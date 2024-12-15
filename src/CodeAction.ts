import {
  CodeAction,
  CodeActionKind,
  l10n,
  languages,
  WorkspaceEdit,
} from "vscode";

import { COMMAND_INSTALL_REQUEST } from "./Command";
import { DiagnosticType, PackageRelatedDiagnostic } from "./Diagnostic";
import { name as packageName } from "./plugin.json";
import { hasMajorUpdateProtection } from "./Settings";

import type { CodeActionProvider, Range, TextDocument } from "vscode";

const VERSION_PREFIX_REGEXP = /^\s*(?<op>[=^~]|>=|<=)/;

async function createAction(
  document: TextDocument,
  message: string,
  diagnostics: PackageRelatedDiagnostic[],
  isPreferred?: boolean,
): Promise<CodeAction> {
  const edit = new WorkspaceEdit();
  const action = new CodeAction(message, CodeActionKind.QuickFix);

  action.edit = edit;
  action.diagnostics = diagnostics;
  action.isPreferred = isPreferred;

  await Promise.any(
    diagnostics.map(async (diagnostic) => {
      const isLatest =
        await diagnostic.packageRelated.isVersionLatestAlreadyInstalled();

      if (!isLatest) {
        throw new Error();
      }

      return true;
    }),
  ).then(
    () => {
      action.command = {
        arguments: [document],
        command: COMMAND_INSTALL_REQUEST,
        title: "update",
      };
    },
    () => null,
  );

  return action;
}

async function createUpdateManyAction(
  document: TextDocument,
  diagnostics: PackageRelatedDiagnostic[],
  message: string,
): Promise<CodeAction> {
  const action = await createAction(document, message, diagnostics);

  await Promise.all(
    diagnostics.map(async (diagnostic) =>
      updatePackageVersion(action, document, diagnostic),
    ),
  );

  return action;
}

async function createUpdateSingleAction(
  document: TextDocument,
  diagnostic: PackageRelatedDiagnostic,
): Promise<CodeAction> {
  const versionLatest = await diagnostic.packageRelated.getVersionLatest();
  const updateWarning =
    hasMajorUpdateProtection() &&
    (await diagnostic.packageRelated.requiresVersionMajorUpdate())
      ? ` (${l10n.t("major")})`
      : "";

  const action = createAction(
    document,
    `${l10n.t(
      'Update "{0}" to {1}',
      diagnostic.packageRelated.name,
      versionLatest!,
    )}${updateWarning}`,
    [diagnostic],
    true,
  );

  await updatePackageVersion(await action, document, diagnostic);

  return action;
}

const SINGLE_PACKAGE_TO_INSTALL = 1;

function createInstallAction(
  document: TextDocument,
  requiresInstallCount: number,
): CodeAction {
  const action = new CodeAction(
    requiresInstallCount === SINGLE_PACKAGE_TO_INSTALL
      ? l10n.t("Install package")
      : l10n.t("Install packages"),
    CodeActionKind.QuickFix,
  );

  action.command = {
    arguments: [document],
    command: COMMAND_INSTALL_REQUEST,
    title: "update",
  };

  return action;
}

async function updatePackageVersion(
  action: CodeAction,
  document: TextDocument,
  diagnostic: PackageRelatedDiagnostic,
): Promise<void> {
  const line = document.lineAt(diagnostic.range.start.line);
  const version = line.text.slice(
    diagnostic.range.start.character,
    diagnostic.range.end.character,
  );
  const versionPrefix = VERSION_PREFIX_REGEXP.exec(version)?.groups?.op ?? "";
  const versionUpdated = await diagnostic.packageRelated.getVersionLatest();

  action.edit?.replace(
    document.uri,
    diagnostic.range,
    versionPrefix + versionUpdated,
  );
}

export class PackageJsonCodeActionProvider implements CodeActionProvider {
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  public async provideCodeActions(
    document: TextDocument,
    range: Range,
  ): Promise<CodeAction[]> {
    const diagnosticsAll = languages.getDiagnostics(document.uri);

    // Get all diagnostics from this extension.
     
    const diagnostics = diagnosticsAll.filter(
      (diagnostic) =>
        typeof diagnostic.code === "object" &&
        diagnostic.code.value === packageName &&
        (!PackageRelatedDiagnostic.is(diagnostic) ||
          diagnostic.type === DiagnosticType.GENERAL),
    ) as PackageRelatedDiagnostic[];

    // Checks if an CodeAction comes through a diagnostic.
    const diagnosticsSelected = diagnostics.filter(
      (diagnostic) => diagnostic.range.intersection(range) !== undefined,
    );

    // Checks if there are any packages waiting to be installed.
    let requiresInstallCount = 0;

    for (const diagnostic of diagnosticsAll) {
      if (
        PackageRelatedDiagnostic.is(diagnostic) &&
        diagnostic.type === DiagnosticType.READY_TO_INSTALL &&
        diagnostic.range.intersection(range) !== undefined
      ) {
        requiresInstallCount++;

        if (requiresInstallCount >= 2) {
          break;
        }
      }
    }

    if (diagnosticsSelected.length === 0) {
      if (requiresInstallCount) {
        return Promise.all([
          createInstallAction(document, requiresInstallCount),
        ]);
      }

      return [];
    }

    const diagnosticsPromises: Array<CodeAction | Promise<CodeAction>> = [];

    let diagnosticsSelectedFiltered = diagnosticsSelected;

    // If only a single-line is selected or range accepts only one diagnostic then create a direct action for a specific package.
    // Else, it will be suggested to update all <number of> packages within range.
    if (diagnosticsSelected.length === 1) {
      diagnosticsPromises.push(
        createUpdateSingleAction(document, diagnosticsSelected[0]!),
      );
    } else {
      let updateWarning = "";

      // Ensures that we will not include major updates together with minor, if protection is enabled.
      if (hasMajorUpdateProtection()) {
        const diagnosticsSelectedMajors: PackageRelatedDiagnostic[] = [];

        await Promise.all(
          diagnosticsSelected.map(async (diagnostic) =>
            diagnostic.packageRelated
              .requiresVersionMajorUpdate()
              .then((result) => [diagnostic, result] as const),
          ),
        ).then((results) => {
          for (const [diagnostic, result] of results) {
            if (result) {
              diagnosticsSelectedMajors.push(diagnostic);
            }
          }
        });

        if (diagnosticsSelectedMajors.length > 0) {
          if (diagnosticsSelectedMajors.length < diagnosticsSelected.length) {
            updateWarning = ` (${l10n.t("excluding major")})`;
            diagnosticsSelectedFiltered = diagnosticsSelectedFiltered.filter(
              (diagnostic) => !diagnosticsSelectedMajors.includes(diagnostic),
            );
          } else {
            updateWarning = ` (${l10n.t("major")})`;
          }
        }
      }

      if (diagnosticsSelectedFiltered.length === 1) {
        diagnosticsPromises.push(
          createUpdateSingleAction(document, diagnosticsSelectedFiltered[0]!),
        );
      } else {
        diagnosticsPromises.push(
          createUpdateManyAction(
            document,
            diagnosticsSelectedFiltered,
            `${l10n.t(
              "Update {0} selected packages",
              diagnosticsSelectedFiltered.length,
            )}${updateWarning}`,
          ),
        );
      }
    }

    // If the total number of diagnostics is greater than the number of selected ones, then it is suggested to update all.
    if (
      diagnostics.length > 1 &&
      diagnostics.length > diagnosticsSelectedFiltered.length
    ) {
      let updateWarning = "";
      let diagnosticsFiltered = diagnostics;

      // Ensures that we will not include major updates together with minor, if protection is enabled.
      if (hasMajorUpdateProtection()) {
        const diagnosticsMajors: PackageRelatedDiagnostic[] = [];

        await Promise.all(
          diagnostics.map(async (diagnostic) =>
            diagnostic.packageRelated
              .requiresVersionMajorUpdate()
              .then((result) => [diagnostic, result] as const),
          ),
        ).then((results) => {
          for (const [diagnostic, result] of results) {
            if (result) {
              diagnosticsMajors.push(diagnostic);
            }
          }
        });

        if (diagnosticsMajors.length > 0) {
          if (diagnosticsMajors.length < diagnostics.length) {
            updateWarning = ` (${l10n.t("excluding major")})`;
            diagnosticsFiltered = diagnosticsFiltered.filter(
              (diagnostic) => !diagnosticsMajors.includes(diagnostic),
            );
          } else {
            updateWarning = ` (${l10n.t("major")})`;
          }
        }
      }

      if (diagnosticsFiltered.length > diagnosticsSelectedFiltered.length) {
        diagnosticsPromises.push(
          createUpdateManyAction(
            document,
            diagnosticsFiltered,
            `${l10n.t(
              "Update all {0} packages",
              diagnosticsFiltered.length,
            )}${updateWarning}`,
          ),
        );
      }
    }

    if (requiresInstallCount) {
      diagnosticsPromises.push(
        createInstallAction(document, requiresInstallCount),
      );
    }

    return Promise.all(diagnosticsPromises);
  }
}
