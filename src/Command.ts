import { exec } from "node:child_process";
import { dirname } from "node:path";

import { commands, l10n, window } from "vscode";

import { name as packageName } from "./plugin.json";
import { getDoItForMeAction } from "./Settings";

import type { OutputChannel, TextDocument } from "vscode";

export const COMMAND_INSTALL = `${packageName}.install`;
export const COMMAND_INSTALL_REQUEST = `${packageName}.installRequest`;

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
