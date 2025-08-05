import { exec } from "node:child_process";
import { dirname } from "node:path";

import { commands, l10n, window } from "vscode";

import { name as packageName } from "./plugin.json";
import { getDoItForMeAction, toggleEnabledForFile } from "./Settings";

import type { DiagnosticCollection, OutputChannel, TextDocument } from "vscode";

// Store reference to diagnostics collection for refresh
let diagnosticsCollection: DiagnosticCollection | null = null;

export function setDiagnosticsCollection(collection: DiagnosticCollection): void {
  diagnosticsCollection = collection;
}

export const COMMAND_INSTALL = `${packageName}.install`;
export const COMMAND_INSTALL_REQUEST = `${packageName}.installRequest`;
export const COMMAND_TOGGLE_ENABLED = `${packageName}.toggleEnabled`;

export function toggleEnabled(): void {
  const { activeTextEditor } = window;
  
  if (!activeTextEditor) {
    void window.showWarningMessage(
      l10n.t("No active editor found. Please open a package.json file first.")
    );
    return;
  }

  const { document } = activeTextEditor;
  
  // Check if it's a package.json file
  if (!document.fileName.endsWith('package.json')) {
    void window.showWarningMessage(
      l10n.t("This command only works with package.json files.")
    );
    return;
  }

  const newState = toggleEnabledForFile(document.uri);
  const status = newState ? "enabled" : "disabled";
  const fileName = document.fileName.split('/').pop() ?? 'package.json';
  
  void window.showInformationMessage(
    l10n.t(`npm-outdated-plus has been ${status} for ${fileName}.`)
  );

  // Trigger a proper refresh of diagnostics
  if (diagnosticsCollection) {
    // Clear existing diagnostics first
    diagnosticsCollection.delete(document.uri);
    
    // Force regeneration by importing and calling the diagnostic function
    void import("./Diagnostic").then(({ generatePackagesDiagnostics }) => {
      void generatePackagesDiagnostics(document, diagnosticsCollection!);
    });
  }
}

export async function packageInstallRequest(
  document: TextDocument,
): Promise<void> {
  // @see https://github.com/microsoft/vscode/blob/main/extensions/npm/package.json
  const packageManager: string = await commands.executeCommand(
    "npm.packageManager",
    document.uri,
  );

  const action = l10n.t("Do it for me!");
  const actionCommand = getDoItForMeAction();

  const result = await window.showInformationMessage(
    l10n.t(
      actionCommand === "install"
        ? "Save your package.json and run your package manager install command to finish updating packages."
        : "Save your package.json and run your package manager update command to finish updating packages.",
    ),
    action,
  );

  if (result === action) {
    await document.save();

    void commands.executeCommand(
      COMMAND_INSTALL,
      `${packageManager} ${actionCommand}`,
      dirname(document.uri.fsPath),
    );
  }
}

export function packageInstall(
  outputChannel: OutputChannel,
  command: string,
  cwd: string,
): void {
  outputChannel.clear();
  outputChannel.show();
  outputChannel.append(
    `${l10n.t(
      "Installing selected packages...",
    )}\n\n---\n\n${command}\n\n---\n`,
  );

  const process = exec(command, { cwd });

  function handleData(data: string): void {
    outputChannel.append(data);
  }

  let hasError = false;

  process.stdout?.on("data", handleData);
  process.stderr?.on("data", (error: string) => {
    hasError = true;

    handleData(error);
  });

  process.on("close", () => {
    outputChannel.append(`\n---\n\n${l10n.t("Done.")}\n\n`);

    if (hasError) {
      void window.showErrorMessage(
        l10n.t("Failed to install packages. Check the output console."),
      );
    } else {
      void window.showInformationMessage(
        l10n.t("Packages installed successfully!"),
      );
    }
  });
}
