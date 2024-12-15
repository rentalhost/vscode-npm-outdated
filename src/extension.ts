import { CodeActionKind, commands, languages, window } from "vscode";

import { PackageJsonCodeActionProvider } from "./CodeAction";
import {
  COMMAND_INSTALL,
  COMMAND_INSTALL_REQUEST,
  packageInstall,
  packageInstallRequest,
} from "./Command";
import { diagnosticSubscribe, generatePackagesDiagnostics } from "./Diagnostic";
import { name as packageName } from "./plugin.json";
import { lazyCallback } from "./Utils";

import type { ExtensionContext, TextDocument } from "vscode";

export function activate(context: ExtensionContext) {
  const diagnostics = languages.createDiagnosticCollection();

  const handleChange = lazyCallback(async (document: TextDocument) => {
    await generatePackagesDiagnostics(document, diagnostics);
  });

  diagnosticSubscribe(context, diagnostics, (document: TextDocument) => {
    void handleChange(document);
  });

  const outputChannel = window.createOutputChannel(packageName);

  context.subscriptions.push(
    diagnostics,
    outputChannel,

    commands.registerCommand(COMMAND_INSTALL_REQUEST, packageInstallRequest),
    commands.registerCommand(
      COMMAND_INSTALL,
      packageInstall.bind(null, outputChannel),
    ),

    languages.registerCodeActionsProvider(
      { language: "json", pattern: "**/package.json", scheme: "file" },
      new PackageJsonCodeActionProvider(),
      { providedCodeActionKinds: [CodeActionKind.QuickFix] },
    ),
  );
}
