import { dirname, sep } from "node:path";

import {
  intersects,
  maxSatisfying,
  minSatisfying,
  prerelease,
  satisfies,
} from "semver";
import {
  Diagnostic,
  DiagnosticSeverity,
  l10n,
  Uri,
  window,
  workspace,
} from "vscode";

import { getDocumentPackages } from "./Document";
import { DocumentDecoration } from "./DocumentDecoration";
import { DocumentDecorationManager } from "./DocumentDecorationManager";
import { DocumentDiagnostics } from "./DocumentDiagnostics";
import {
  getPackageManager,
  getPackagesAdvisories,
  PackageManager,
  packageManagerCaches,
  packagesInstalledCaches,
} from "./PackageManager";
import { name as packageName } from "./plugin.json";
import {
  getDecorationsMode,
  getParallelProcessesLimit,
  identifySecurityAdvisories,
} from "./Settings";
import { icons } from "./Theme";
import { promiseLimit } from "./Utils";

import type { PackageInfo } from "./PackageInfo";
import type { PackagesAdvisories } from "./PackageManager";
import type {
  DiagnosticCollection,
  ExtensionContext,
  Range,
  TextDocument,
  TextDocumentChangeEvent,
  TextEditor,
} from "vscode";

function isPackageJsonDocument(document: TextDocument): boolean {
  return document.fileName.endsWith(`${sep}package.json`);
}

// Notifies you of potential security advisory issues.
async function detectAdvisoryDiagnostics(
  packagesAdvisories: PackagesAdvisories,
  packageInfo: PackageInfo,
  documentDecorations: DocumentDecoration | undefined,
  documentDiagnostics: DocumentDiagnostics,
): Promise<void> {
  const packageAdvisories = packagesAdvisories.get(packageInfo.name);

  if (!packageAdvisories) {
    return;
  }

  const versionNormalized = packageInfo.getVersionNormalized();

  if (versionNormalized === undefined) {
    return;
  }

  const packageAdvisory = packageAdvisories.find((advisory) =>
    intersects(advisory.vulnerable_versions, versionNormalized),
  );

  if (packageAdvisory) {
    // If there is any advisory for the package, update the decoration.
    documentDecorations?.setAdvisoryMessage(packageInfo, packageAdvisory);

    const advisoryMessages = [
      icons.advisory,
      l10n.t(
        "Security advisory: this package version has a known flaw of level {0}/{1}.",
        packageAdvisory.severity.toUpperCase(),
        packageAdvisory.cvss.score.toFixed(1),
      ),
    ];

    // Filters available versions that are not affected by any type of advisory.
    const versionsNotAffected = (await packageInfo.getVersions())!.filter(
      (packageVersion) => {
        if (prerelease(packageVersion)) {
          return false;
        }

        for (const advisory of packageAdvisories) {
          if (satisfies(packageVersion, advisory.vulnerable_versions)) {
            return false;
          }
        }

        return true;
      },
    );

    // Gets the closest possible future version that does not have the problem.
    const versionFutureNotAffected = minSatisfying(
      versionsNotAffected,
      `>${versionNormalized}`,
    );

    if (versionFutureNotAffected === null) {
      advisoryMessages.push(l10n.t("No fix available yet."));

      // If there is no future version available then it suggests a downgrade.
      // Gets the largest available version in which a flaw does not exist.
      const versionPastNotAffected = maxSatisfying(
        versionsNotAffected,
        `<${versionNormalized}`,
      );

      if (versionPastNotAffected !== null) {
        advisoryMessages.push(
          l10n.t(
            "If possible, downgrade to version {0}.",
            versionPastNotAffected,
          ),
        );
      }
    } else {
      advisoryMessages.push(
        l10n.t(
          "Please upgrade to version {0} or higher.",
          versionFutureNotAffected,
        ),
      );
    }

    advisoryMessages.push(`(${packageName})`);

    // And adds a new diagnostic.
    const diagnostic = new Diagnostic(
      packageInfo.versionRange,
      advisoryMessages.join(" "),
      DiagnosticSeverity.Error,
    );

    diagnostic.code = {
      target: Uri.parse(packageAdvisory.url),
      value: l10n.t("Details"),
    };

    documentDiagnostics.push(diagnostic);
  }
}

export function diagnosticSubscribe(
  context: ExtensionContext,
  diagnostics: DiagnosticCollection,
  onChange: (document: TextDocument) => void,
) {
  // Handles the active editor change, but only continues with package.json files.
  function handleChange(document: TextDocument): void {
    if (isPackageJsonDocument(document)) {
      onChange(document);
    }
  }

  // Trigger on the currently active editor, if any..
  if (window.activeTextEditor) {
    handleChange(window.activeTextEditor.document);
  }

  // Trigger when any file in the workspace is modified.
  // Our interest here is to know about the package.json itself, package-lock.json or pnpm-lock.yaml.
  function lockerUpdated(uri: Uri): void {
    const workspacePath = dirname(uri.fsPath);

    packageManagerCaches.get(workspacePath)?.invalidate();
    packagesInstalledCaches.get(workspacePath)?.invalidate();

    for (const editor of window.visibleTextEditors) {
      handleChange(editor.document);
    }
  }

  const lockerWatcher = workspace.createFileSystemWatcher(
    "**/{package.json,package-lock.json,pnpm-lock.yaml}",
  );

  const nodeModulesWatcher = workspace.createFileSystemWatcher(
    "**/node_modules/**/*",
  );

  context.subscriptions.push(
    // Trigger when the active editor changes.
    window.onDidChangeActiveTextEditor((editor: TextEditor | undefined) => {
      if (editor) {
        handleChange(editor.document);
      }
    }),

    // Trigger when the active document text is modified.
    workspace.onDidChangeTextDocument((editor: TextDocumentChangeEvent) => {
      handleChange(editor.document);
    }),

    lockerWatcher.onDidCreate(lockerUpdated),
    lockerWatcher.onDidChange(lockerUpdated),
    lockerWatcher.onDidDelete(lockerUpdated),

    nodeModulesWatcher.onDidCreate(lockerUpdated),
    nodeModulesWatcher.onDidChange(lockerUpdated),
    nodeModulesWatcher.onDidDelete(lockerUpdated),

    // Trigger when the active document is closed, removing the current document from the diagnostic collection.
    workspace.onDidCloseTextDocument((document: TextDocument) => {
      if (isPackageJsonDocument(document)) {
        diagnostics.delete(document.uri);

        DocumentDecorationManager.flushDocument(document);
      }
    }),
  );
}

export enum DiagnosticType {
  GENERAL,
  READY_TO_INSTALL,
}

export class PackageRelatedDiagnostic extends Diagnostic {
  public constructor(
    range: Range,
    message: string,
    severity: DiagnosticSeverity,
    document: TextDocument,
    public packageRelated: PackageInfo,
    public type = DiagnosticType.GENERAL,
  ) {
    super(range, message, severity);

    this.code = { target: document.uri, value: packageName };
  }

  public static is(
    diagnostic: Diagnostic | PackageRelatedDiagnostic,
  ): diagnostic is PackageRelatedDiagnostic {
    return "packageRelated" in diagnostic;
  }
}

export async function getPackageDiagnostic(
  document: TextDocument,
  packageInfo: PackageInfo,
): Promise<Diagnostic | PackageRelatedDiagnostic | undefined> {
  if (!packageInfo.isVersionValidRange()) {
    return new Diagnostic(
      packageInfo.versionRange,
      l10n.t("Invalid package version."),
      DiagnosticSeverity.Error,
    );
  }

  const versionLatest = await packageInfo.getVersionLatest();

  // When no latest version is found, we just ignore it.
  // In practice, this is an exception-of-the-exception, and is expected to never happen.
  if (versionLatest === null) {
    return undefined;
  }

  if (!(await packageInfo.isVersionReleased())) {
    return new PackageRelatedDiagnostic(
      packageInfo.versionRange,
      l10n.t("Package version not available."),
      DiagnosticSeverity.Error,
      document,
      packageInfo,
    );
  }

  if (!(await packageInfo.isVersionUpdatable())) {
    // The user has the latest version defined in `package.json`,
    // but still needs to run `npm install` to complete.
    if (await packageInfo.requiresInstallCommand()) {
      return new PackageRelatedDiagnostic(
        packageInfo.versionRange,
        l10n.t(
          'Ready-to-install package "{0}" at version {1}. Just run your package manager install command.',
          packageInfo.name,
          versionLatest,
        ),
        DiagnosticSeverity.Information,
        document,
        packageInfo,
        DiagnosticType.READY_TO_INSTALL,
      );
    }

    return undefined;
  }

  if (!(await packageInfo.isVersionMaxed())) {
    return new PackageRelatedDiagnostic(
      packageInfo.versionRange,
      l10n.t(
        'Newer version of "{0}" is available: {1}.',
        packageInfo.name,
        versionLatest,
      ),
      DiagnosticSeverity.Warning,
      document,
      packageInfo,
    );
  }

  // If the user-defined version is higher than the last available version, then the user is probably using a pre-release version.
  // In this case, we will only generate a informational diagnostic.
  if (packageInfo.isVersionPrerelease()) {
    return new Diagnostic(
      packageInfo.versionRange,
      l10n.t('Pre-release version of "{0}".', packageInfo.name),
      DiagnosticSeverity.Information,
    );
  }

  return undefined;
}

// Analyzes the document dependencies and returns the diagnostics.
export async function generatePackagesDiagnostics(
  document: TextDocument,
  diagnosticsCollection: DiagnosticCollection,
): Promise<void> {
  // Soft-disable extension if none Package Manager installed is detected.
  if ((await getPackageManager(document)) === PackageManager.NONE) {
    return;
  }

  // Read dependencies from package.json to get the name of packages used.
  const packagesInfos = Object.values(await getDocumentPackages(document));

  const documentDecorations =
    getDecorationsMode() === "disabled"
      ? undefined
      : new DocumentDecoration(document);

  const documentDiagnostics = new DocumentDiagnostics(
    document,
    diagnosticsCollection,
  );

  if (!documentDecorations) {
    DocumentDecorationManager.flushDocument(document);
  }

  const parallelProcessing = promiseLimit(getParallelProcessesLimit());

  // Obtains, through NPM, the latest available version of each installed package.
  // As a result of each promise, we will have the package name and its latest version.
  await Promise.all(
    packagesInfos.map(async (packageInfo) => {
      if (!packageInfo.isNameValid()) {
        return;
      }

      if (packageInfo.isVersionComplex() || packageInfo.isVersionIgnorable()) {
        return;
      }

      return parallelProcessing(async () => {
        documentDecorations?.setCheckingMessage(packageInfo.getLine());

        const packageDiagnostic = await getPackageDiagnostic(
          document,
          packageInfo,
        );

        if (packageDiagnostic !== undefined) {
          documentDiagnostics.push(packageDiagnostic);

          if (PackageRelatedDiagnostic.is(packageDiagnostic)) {
            return documentDecorations?.setUpdateMessage(
              packageInfo.getLine(),
              packageDiagnostic,
            );
          }

          if (packageDiagnostic.severity === DiagnosticSeverity.Error) {
            return documentDecorations?.clearLine(packageInfo.getLine());
          }
        }

        documentDecorations?.setCheckedMessage(packageInfo.getLine());
      });
    }),
  );

  if (identifySecurityAdvisories()) {
    // Search for security advisories in current packages.
    const packagesAdvisories = await getPackagesAdvisories(packagesInfos);

    if (packagesAdvisories) {
      await Promise.all(
        packagesInfos.map(async (packageInfo) =>
          detectAdvisoryDiagnostics(
            packagesAdvisories,
            packageInfo,
            documentDecorations,
            documentDiagnostics,
          ),
        ),
      );
    }
  }

  void documentDiagnostics.render();
}
