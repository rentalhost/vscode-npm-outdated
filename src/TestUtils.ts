/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable import/no-namespace */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as ChildProcess from "node:child_process";
import * as FS from "node:fs";
import { sep } from "node:path";

import * as vscode from "vscode";
import { Range } from "vscode";

import { PackageJsonCodeActionProvider } from "./CodeAction";
import { DocumentDecorationManager } from "./DocumentDecorationManager";
import { activate } from "./extension";
import { PackageManager } from "./PackageManager";
import { name as packageName } from "./plugin.json";
import * as Utils from "./Utils";

import type { PackageAdvisory } from "./PackageManager";
import type { ReleaseType } from "semver";

jest.mock("./Utils", () => ({
  __esModule: true,

  lazyCallback: <T extends () => void>(callback: T): T => callback,

  promiseLimit:
    () =>
    (callback: () => unknown): unknown =>
      callback(),

  waitUntil: (callback: () => void): true => {
    callback();

    return true;
  },
}));

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

  runAction?: { args?: ExplicitAny[]; name: string };

  selectFirsts?: number;

  triggerChangeAfter?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExplicitAny = any;

const vscodeMock = vscode as {
  commands: ExplicitAny;
  languages: ExplicitAny;
  Range: ExplicitAny;
  window: ExplicitAny;
  workspace: ExplicitAny;
};

const ChildProcessMock = ChildProcess as {
  exec: ExplicitAny;
};

const FSMock = FS as {
  existsSync: ExplicitAny;
};

const UtilsMock = Utils as {
  fetchLite: unknown;

  cacheEnabled(): boolean;
};

function dependenciesAsChildren(
  dependencies: Record<string, string>,
): vscode.DocumentSymbol[] {
  return Object.entries(dependencies).map(
    ([name, version], entryIndex) =>
      ({
        detail: version,
        name,
        range: new Range(entryIndex, 0, entryIndex, 0) as unknown as Range,
      }) as vscode.DocumentSymbol,
  );
}

type ExecCallback = (error: string | null, stdout: string | null) => void;

// Simulates launching diagnostics in a virtual packages.json file.
export async function vscodeSimulator(options: SimulatorOptions = {}) {
  let actions: vscode.CodeAction[] = [];
  let diagnostics: vscode.Diagnostic[] = [];
  let decorations: string[][] = [];

  const windowsInformation: Array<[string, string[]]> = [];

  const subscriptions: Array<[string, (...args: ExplicitAny[]) => void]> = [];
  const commands: Array<[string, (...args: ExplicitAny[]) => void]> = [];

  const packageManager = options.packageManager ?? PackageManager.NPM;

  const document = {
    fileName: `${sep}tests${sep}package.json`,
    lineAt: (line: number) => ({
      text: {
        slice: (): string =>
          (options.packageJson as PackageJson).dependencies?.[line] ?? "",
      },
    }),
    uri: { fsPath: `${sep}tests` },
  } as vscode.TextDocument;

  const editor = {
    document,
    setDecorations: (): void => {
      decorations = [];

      const documentLayers =
        DocumentDecorationManager.fromDocument(document).layers.values();

      for (const layer of documentLayers) {
        for (const line of layer.lines.values()) {
          // eslint-disable-next-line @typescript-eslint/prefer-destructuring
          const lineIndex = line.range.start.line;

          decorations[lineIndex] ??= [];
          decorations[lineIndex].push(
            String(line.renderOptions?.after?.contentText),
          );
        }
      }
    },
  };

  FSMock.existsSync = (file: string): boolean => {
    if (file.endsWith("/.pnpm") && packageManager === PackageManager.PNPM) {
      return true;
    }

    return false;
  };

  UtilsMock.cacheEnabled = (): boolean => options.cacheEnabled === true;

  UtilsMock.fetchLite = ({ url }: { url: string }): unknown => {
    if (url.endsWith("/bulk")) {
      return options.packagesAdvisories;
    }

    if (options.packagesRepository) {
      for (const name of Object.keys(options.packagesRepository)) {
        if (
          url.endsWith(`/${name}`) &&
          name in options.packagesRepository &&
          !name.startsWith("@private/")
        ) {
          return Promise.resolve({
            versions: Object.fromEntries(
              options.packagesRepository[name]?.map((version) => [
                version,
                null,
              ]) as [],
            ),
          });
        }
      }
    }

    return Promise.resolve();
  };

  ChildProcessMock.exec = (
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
                Object.entries(options.packagesInstalled).map(
                  ([name, version]) => [name, { version }],
                ),
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
                  Object.entries(options.packagesInstalled).map(
                    ([name, version]) => [name, { version }],
                  ),
                ),
              },
            ]),
      );

      return;
    }

    if (command === "npm --version" && packageManager === PackageManager.NPM) {
      callbackReal(null, "1.0.0\n");

      return;
    }

    if (
      command === "pnpm --version" &&
      packageManager === PackageManager.PNPM
    ) {
      callbackReal(null, "1.0.0\n");

      return;
    }

    if (typeof callbackReal === "function") {
      if (command === "npm view --json @private/npm-outdated versions") {
        callbackReal(
          null,
          JSON.stringify(options.packagesRepository!["@private/npm-outdated"]),
        );

        return;
      }

      callbackReal("error", null);
    }

    return {
      on: (_data: ExplicitAny, callbackInner: () => void) => {
        callbackInner();
      },
      stderr: {
        on: (_data: ExplicitAny, callbackInner: (message: string) => void) => {
          if (options.execError === true) {
            callbackInner("test");
          }
        },
      },
      stdout: {
        on: (_data: ExplicitAny, callbackInner: (message: string) => void) => {
          callbackInner("test");
        },
      },
    };
  };

  vscodeMock.commands.executeCommand = (
    command: string,
  ): Record<string, ExplicitAny> | string | undefined => {
    if (command === "vscode.executeDocumentSymbolProvider") {
      const symbols = [];

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
          children: dependenciesAsChildren(
            options.packageJson.peerDependencies,
          ),
          name: "peerDependencies",
        });
      }

      if (options.packageJson.optionalDependencies) {
        symbols.push({
          children: dependenciesAsChildren(
            options.packageJson.optionalDependencies,
          ),
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

  vscodeMock.commands.registerCommand = (
    name: string,
    callback: (...args: ExplicitAny[]) => void,
  ): number => commands.push([name, callback]);

  vscodeMock.window.activeTextEditor = editor;
  vscodeMock.window.visibleTextEditors = [editor];

  vscodeMock.window.onDidChangeActiveTextEditor = (
    handle: () => void,
  ): number => subscriptions.push(["onDidChangeActiveTextEditor", handle]);

  vscodeMock.window.showErrorMessage = (
    message: string,
    ...items: string[]
  ): string | undefined => {
    windowsInformation.push([message, items]);

    return items[0];
  };

  // eslint-disable-next-line @typescript-eslint/prefer-destructuring
  vscodeMock.window.showInformationMessage = vscodeMock.window.showErrorMessage;

  vscodeMock.window.createOutputChannel = jest.fn(() => ({
    append: jest.fn(),
    clear: jest.fn(),
    show: jest.fn(),
  }));

  vscodeMock.workspace.onDidChangeTextDocument = (handle: () => void): number =>
    subscriptions.push(["onDidChangeTextDocument", handle]);

  vscodeMock.workspace.onDidCloseTextDocument = (handle: () => void): number =>
    subscriptions.push(["onDidCloseTextDocument", handle]);

  vscodeMock.workspace.createFileSystemWatcher = (): unknown => ({
    onDidChange: (handle: () => void): number =>
      subscriptions.push(["onDidChange", handle]),
    onDidCreate: () => null,
    onDidDelete: () => null,
  });

  vscodeMock.workspace.getConfiguration = (): unknown => ({
    get: jest.fn(
      <T extends keyof PluginConfigurations>(name: `${string}.${T}`) => {
        const nameWithoutPrefix = name.slice(packageName.length + 1) as T;

        return options.configurations &&
          nameWithoutPrefix in options.configurations
          ? options.configurations[nameWithoutPrefix]
          : DefaultPluginConfigurations[nameWithoutPrefix];
      },
    ),
  });

  vscodeMock.languages.createDiagnosticCollection = jest.fn(() => ({
    clear: jest.fn(),
    delete: jest.fn(),
    set: (_uri: vscode.Uri, diags: vscode.Diagnostic[]): vscode.Diagnostic[] =>
      (diagnostics = diags),
  }));

  vscodeMock.languages.getDiagnostics = (): vscode.Diagnostic[] => diagnostics;

  vscodeMock.Range = class extends vscode.Range {
    public intersection(): Range | undefined {
      return options.selectFirsts !== undefined &&
        this.end.line + 1 <= options.selectFirsts
        ? this
        : undefined;
    }
  };

  const context = { subscriptions: { push: jest.fn() } };

  activate(context as unknown as vscode.ExtensionContext);

  if (options.triggerChangeAfter === true) {
    subscriptions.find(
      (subscription) => subscription[0] === "onDidChangeTextDocument",
    )?.[1]({ document });
  }

  if (options.selectFirsts !== undefined) {
    await new Promise(process.nextTick.bind(null));

    actions = await new PackageJsonCodeActionProvider().provideCodeActions(
      document,
      new Range(0, 0, 0, 0),
    );

    if (options.runAction !== undefined) {
      const command = commands.find(
        (commandInner) => commandInner[0] === options.runAction?.name,
      );

      command?.[1].apply(undefined, options.runAction.args!);
    }
  }

  await new Promise(process.nextTick.bind(null));

  return {
    actions,
    decorations,
    diagnostics,
    document,
    subscriptions,
    windowsInformation,
  };
}
