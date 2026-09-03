import { sep } from "node:path";

import { firstOf, sleep } from "@rheactor/rheactor-core";
import type { RequestOptions } from "@rheactor/rheactor-core";
import type { ReleaseType } from "semver";
import { vi } from "vitest";
import { commands, languages, Range, window, workspace } from "vscode";
import type {
  CodeAction,
  Diagnostic,
  DocumentSymbol,
  ExtensionContext,
  TextDocument,
  Uri,
} from "vscode";

import { setRangeSelectFirsts } from "#/__mocks__/vscode";
import { PackageJsonCodeActionProvider } from "#/CodeAction";
import { DocumentDecorationManager } from "#/DocumentDecorationManager";
import { activate } from "#/extension";
import { MockedModules } from "#/MockedModules";
import type { ExecCallback } from "#/MockedModules";
import type { PackageAdvisory } from "#/PackageManager";
import { PackageManager } from "#/PackageManager";
import { name as packageName } from "#/plugin.json";

interface PluginConfigurations {
  cacheLifetime?: number;
  decorations?: "disabled" | "fancy" | "simple";
  identifySecurityAdvisories?: boolean;
  level?: ReleaseType;
  majorUpdateProtection?: boolean;
  parallelProcessesLimit?: number;
}

const DefaultPluginConfigurations: PluginConfigurations = {
  cacheLifetime: 0,
  decorations: "fancy",
  identifySecurityAdvisories: true,
  level: "patch",
  majorUpdateProtection: true,
  parallelProcessesLimit: 0,
};

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface SimulatorOptions {
  cacheEnabled?: boolean;

  configurations?: PluginConfigurations;

  execError?: boolean;

  packageJson?: PackageJson | "";

  packageManager?: PackageManager;

  packagesAdvisories?: Record<string, PackageAdvisory[]>;

  packagesInstalled?: Record<string, string> | string;

  packagesRepository?: Record<string, string[]>;

  runAction?: { args?: unknown[]; name: string };

  selectFirsts?: number;

  triggerChangeAfter?: boolean;
}

interface CommandsMock {
  executeCommand(command: string): unknown;
  registerCommand(name: string, callback: (...args: unknown[]) => void): number;
}

interface OutputChannelMock {
  append: unknown;
  clear: unknown;
  show: unknown;
}

interface WindowMock {
  activeTextEditor: unknown;
  visibleTextEditors: unknown[];
  onDidChangeActiveTextEditor(handle: () => void): number;
  showErrorMessage(message: string, ...items: string[]): string | undefined;
  showInformationMessage(message: string, ...items: string[]): string | undefined;
  createOutputChannel(): OutputChannelMock;
}

interface FileSystemWatcherMock {
  onDidChange(handle: () => void): number;
  onDidCreate(): null;
  onDidDelete(): null;
}

interface WorkspaceMock {
  onDidChangeTextDocument(handle: () => void): number;
  onDidCloseTextDocument(handle: () => void): number;
  createFileSystemWatcher(): FileSystemWatcherMock;
  getConfiguration(): unknown;
}

interface DiagnosticCollectionMock {
  clear: unknown;
  delete: unknown;
  set(uri: Uri, diagnostics: Diagnostic[]): Diagnostic[];
}

interface LanguagesMock {
  createDiagnosticCollection(): DiagnosticCollectionMock;
  getDiagnostics(): Diagnostic[];
}

const commandsMock = commands as unknown as CommandsMock;
const windowMock = window as unknown as WindowMock;
const workspaceMock = workspace as unknown as WorkspaceMock;
const languagesMock = languages as unknown as LanguagesMock;

function dependenciesAsChildren(dependencies: Record<string, string>): DocumentSymbol[] {
  return Object.entries(dependencies).map(
    ([name, version], entryIndex) =>
      ({
        detail: version,
        name,
        range: new Range(entryIndex, 0, entryIndex, 0),
      }) as DocumentSymbol,
  );
}

// Simulates launching diagnostics in a virtual packages.json file.
export async function vscodeSimulator(options: SimulatorOptions = {}) {
  let actions: CodeAction[] = [];
  let diagnostics: Diagnostic[] = [];
  let decorations: string[][] = [];

  const windowsInformation: Array<[string, string[]]> = [];

  const subscriptions: Array<[string, (...args: unknown[]) => void]> = [];
  const registeredCommands: Array<[string, (...args: unknown[]) => void]> = [];

  const packageManager = options.packageManager ?? PackageManager.NPM;

  const document = {
    fileName: `${sep}tests${sep}package.json`,
    lineAt: (line: number) => ({
      text: {
        slice: (): string => (options.packageJson as PackageJson).dependencies?.[line] ?? "",
      },
    }),
    uri: { fsPath: `${sep}tests` },
  } as TextDocument;

  const editor = {
    document,
    setDecorations: (): void => {
      decorations = [];

      const documentLayers = DocumentDecorationManager.fromDocument(document).layers.values();

      for (const layer of documentLayers) {
        for (const line of layer.lines.values()) {
          const lineIndex = line.range.start.line;

          decorations[lineIndex] ??= [];
          decorations[lineIndex].push(String(line.renderOptions?.after?.contentText));
        }
      }
    },
  };

  MockedModules.fsPromisesAccess = async (file: string): Promise<void> => {
    const isKnown =
      (file.endsWith("/.pnpm") && packageManager === PackageManager.PNPM) ||
      (file.endsWith("/bun.lock") && packageManager === PackageManager.BUN);

    await (isKnown ? Promise.resolve() : Promise.reject(new Error(`ENOENT: ${file}`)));
  };

  MockedModules.utilsCacheEnabled = (): boolean => options.cacheEnabled === true;

  MockedModules.utilsRequestSafe = async <T>({ url }: RequestOptions): Promise<T | undefined> => {
    const target = String(url);

    let result: unknown = undefined;

    if (target.endsWith("/bulk")) {
      result = options.packagesAdvisories;
    } else if (options.packagesRepository) {
      for (const name of Object.keys(options.packagesRepository)) {
        if (
          target.endsWith(`/${name}`) &&
          name in options.packagesRepository &&
          !name.startsWith("@private/")
        ) {
          result = {
            versions: Object.fromEntries(
              options.packagesRepository[name]?.map((version) => [version, { version }]) as [],
            ),
          };

          break;
        }
      }
    }

    await Promise.resolve();

    return result as T | undefined;
  };

  MockedModules.childProcessExec = (
    command: string,
    execOptions: ExecCallback | undefined,
    callback?: ExecCallback,
  ): unknown => {
    const callbackReal = (callback ?? execOptions)!;

    if (
      command === "npm ls --json --depth=0" &&
      options.packagesInstalled !== undefined &&
      packageManager === PackageManager.NPM
    ) {
      callbackReal(
        null,
        typeof options.packagesInstalled === "string"
          ? options.packagesInstalled
          : JSON.stringify({
              dependencies: Object.fromEntries(
                Object.entries(options.packagesInstalled).map(([name, version]) => [
                  name,
                  { version },
                ]),
              ),
            }),
      );

      return;
    }

    if (
      command === "pnpm ls --json --depth=0" &&
      options.packagesInstalled !== undefined &&
      packageManager === PackageManager.PNPM
    ) {
      callbackReal(
        null,
        typeof options.packagesInstalled === "string"
          ? options.packagesInstalled
          : JSON.stringify([
              {
                dependencies: Object.fromEntries(
                  Object.entries(options.packagesInstalled).map(([name, version]) => [
                    name,
                    { version },
                  ]),
                ),
              },
            ]),
      );

      return;
    }

    if (
      command === "bun list" &&
      options.packagesInstalled !== undefined &&
      packageManager === PackageManager.BUN
    ) {
      callbackReal(
        null,
        typeof options.packagesInstalled === "string"
          ? options.packagesInstalled
          : [
              `${sep}tests node_modules`,
              ...Object.entries(options.packagesInstalled).map(
                ([name, version]) => `├── ${name}@${version}`,
              ),
            ].join("\n"),
      );

      return;
    }

    if (command === "npm --version" && packageManager === PackageManager.NPM) {
      callbackReal(null, "1.0.0\n");

      return;
    }

    if (command === "pnpm --version" && packageManager === PackageManager.PNPM) {
      callbackReal(null, "1.0.0\n");

      return;
    }

    if (command === "bun --version" && packageManager === PackageManager.BUN) {
      callbackReal(null, "1.0.0\n");

      return;
    }

    if (typeof callbackReal === "function") {
      if (command === "npm view --json @private/npm-outdated versions") {
        callbackReal(null, JSON.stringify(options.packagesRepository!["@private/npm-outdated"]));

        return;
      }

      callbackReal("error", null);
    }

    return {
      on: (_data: unknown, callbackInner: () => void) => {
        callbackInner();
      },
      stderr: {
        on: (_data: unknown, callbackInner: (message: string) => void) => {
          if (options.execError === true) {
            callbackInner("test");
          }
        },
      },
      stdout: {
        on: (_data: unknown, callbackInner: (message: string) => void) => {
          callbackInner("test");
        },
      },
    };
  };

  commandsMock.executeCommand = (command: string): unknown => {
    if (command === "vscode.executeDocumentSymbolProvider") {
      const symbols: Array<Record<string, unknown>> = [];

      if (options.packageJson === undefined || options.packageJson === "") {
        return undefined;
      }

      if (options.packageJson.dependencies) {
        symbols.push({
          children: dependenciesAsChildren(options.packageJson.dependencies),
          name: "dependencies",
        });
      }

      if (options.packageJson.devDependencies) {
        symbols.push({
          children: dependenciesAsChildren(options.packageJson.devDependencies),
          name: "devDependencies",
        });
      }

      if (options.packageJson.peerDependencies) {
        symbols.push({
          children: dependenciesAsChildren(options.packageJson.peerDependencies),
          name: "peerDependencies",
        });
      }

      if (options.packageJson.optionalDependencies) {
        symbols.push({
          children: dependenciesAsChildren(options.packageJson.optionalDependencies),
          name: "optionalDependencies",
        });
      }

      return symbols;
    }

    if (command === "npm.packageManager") {
      return "npm";
    }

    return undefined;
  };

  commandsMock.registerCommand = (name: string, callback: (...args: unknown[]) => void): number =>
    registeredCommands.push([name, callback]);

  windowMock.activeTextEditor = editor;
  windowMock.visibleTextEditors = [editor];

  windowMock.onDidChangeActiveTextEditor = (handle: () => void): number =>
    subscriptions.push(["onDidChangeActiveTextEditor", handle]);

  windowMock.showErrorMessage = (message: string, ...items: string[]): string | undefined => {
    windowsInformation.push([message, items]);

    return firstOf(items);
  };

  windowMock.showInformationMessage = (message: string, ...items: string[]): string | undefined =>
    windowMock.showErrorMessage(message, ...items);

  windowMock.createOutputChannel = vi.fn<() => OutputChannelMock>(() => ({
    append: vi.fn<() => undefined>(),
    clear: vi.fn<() => undefined>(),
    show: vi.fn<() => undefined>(),
  }));

  workspaceMock.onDidChangeTextDocument = (handle: () => void): number =>
    subscriptions.push(["onDidChangeTextDocument", handle]);

  workspaceMock.onDidCloseTextDocument = (handle: () => void): number =>
    subscriptions.push(["onDidCloseTextDocument", handle]);

  workspaceMock.createFileSystemWatcher = (): FileSystemWatcherMock => ({
    onDidChange: (handle: () => void): number => subscriptions.push(["onDidChange", handle]),
    onDidCreate: () => null,
    onDidDelete: () => null,
  });

  workspaceMock.getConfiguration = (): unknown => ({
    get: vi.fn<(name: string) => unknown>((name: string) => {
      const nameWithoutPrefix = name.slice(packageName.length + 1) as keyof PluginConfigurations;

      return options.configurations && nameWithoutPrefix in options.configurations
        ? options.configurations[nameWithoutPrefix]
        : DefaultPluginConfigurations[nameWithoutPrefix];
    }),
  });

  languagesMock.createDiagnosticCollection = vi.fn<() => DiagnosticCollectionMock>(() => ({
    clear: vi.fn<() => undefined>(),
    delete: vi.fn<() => undefined>(),
    set: (_uri: Uri, diags: Diagnostic[]): Diagnostic[] => {
      diagnostics = diags;

      return diags;
    },
  }));

  languagesMock.getDiagnostics = (): Diagnostic[] => diagnostics;

  setRangeSelectFirsts(options.selectFirsts);

  const context = { subscriptions: { push: vi.fn<() => undefined>() } };

  activate(context as unknown as ExtensionContext);

  if (options.triggerChangeAfter === true) {
    const changeSubscription = subscriptions.find(
      ([eventName]) => eventName === "onDidChangeTextDocument",
    );
    const changeHandler = changeSubscription?.at(1);

    if (typeof changeHandler === "function") {
      changeHandler({ document });
    }
  }

  if (options.selectFirsts !== undefined) {
    await sleep(0);

    actions = await new PackageJsonCodeActionProvider().provideCodeActions(
      document,
      new Range(0, 0, 0, 0),
    );

    if (options.runAction !== undefined) {
      const command = registeredCommands.find(
        ([commandName]) => commandName === options.runAction?.name,
      );

      if (command !== undefined) {
        const runActionHandler = command.at(1);

        if (typeof runActionHandler === "function") {
          runActionHandler(...(options.runAction.args ?? []));
        }
      }
    }
  }

  await sleep(0);

  return {
    actions,
    decorations,
    diagnostics,
    document,
    subscriptions,
    windowsInformation,
  };
}
