import { CodeActionKind, commands, languages, window } from "vscode";

import { PackageJsonCodeActionProvider } from "./CodeAction";
import {
  COMMAND_INSTALL,
  COMMAND_INSTALL_REQUEST,
  COMMAND_TOGGLE_ENABLED,
  packageInstall,
  packageInstallRequest,
  setDiagnosticsCollection,
  toggleEnabled,
} from "./Command";
import { diagnosticSubscribe, generatePackagesDiagnostics } from "./Diagnostic";
import { name as packageName } from "./plugin.json";
import { initializeSettings, isEnabledForFile } from "./Settings";
import { lazyCallback } from "./Utils";

import type { ExtensionContext, TextDocument } from "vscode";

export function activate(context: ExtensionContext) {
  // Initialize settings with context for persistence
  initializeSettings(context);
  
  const diagnostics = languages.createDiagnosticCollection();
  
  // Pass diagnostics collection to Command module for refresh capability
  setDiagnosticsCollection(diagnostics);

  const handleChange = lazyCallback(async (document: TextDocument) => {
    if (isEnabledForFile(document.uri)) {
      await generatePackagesDiagnostics(document, diagnostics);
    } else {
      // Clear diagnostics when disabled for this file
      diagnostics.delete(document.uri);
    }
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
    commands.registerCommand(COMMAND_TOGGLE_ENABLED, toggleEnabled),

    languages.registerCodeActionsProvider(
      { language: "json", pattern: "**/package.json", scheme: "file" },
      new PackageJsonCodeActionProvider(),
      { providedCodeActionKinds: [CodeActionKind.QuickFix] },
    ),
  );
}
