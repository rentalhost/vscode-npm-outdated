import { workspace } from "vscode";

import { name as packageName } from "./plugin.json";

import type { ReleaseType } from "semver";
import type { ExtensionContext, Uri } from "vscode";

// Store per-file enabled state
const fileEnabledState = new Map<string, boolean>();
let extensionContext: ExtensionContext | null = null;

// Persist the current state
function persistState(): void {
  if (extensionContext) {
    const stateObject = Object.fromEntries(fileEnabledState);
    void extensionContext.workspaceState.update('npm-outdated-plus.fileStates', stateObject);
  }
}

// Minimum semver bump required for a package to display as outdated.
// Default: "patch".
function getLevel(): ReleaseType {
  return workspace.getConfiguration().get<ReleaseType>(`${packageName}.level`)!;
}

// Retrieves the action for the "Do it for me!" feature based on the current configuration.
// Default: "install".
function getDoItForMeAction() {
  return workspace
    .getConfiguration()
    .get<"install" | "update">(`${packageName}.doItForMeAction`)!;
}

// Avoid suggesting that a package be upgraded to a `major` version directly.
// Default: true.
function hasMajorUpdateProtection(): boolean {
  return workspace
    .getConfiguration()
    .get<boolean>(`${packageName}.majorUpdateProtection`)!;
}

// Identifies packages used with known security advisories.
// Default: true.
function identifySecurityAdvisories(): boolean {
  return workspace
    .getConfiguration()
    .get<boolean>(`${packageName}.identifySecurityAdvisories`)!;
}

// Displays decorations on the right side of packages.
// Default: true.
function getDecorationsMode(): "disabled" | "fancy" | "simple" {
  return workspace.getConfiguration().get(`${packageName}.decorations`)!;
}

// Time in minutes in which the versions of packages already analyzed will be kept internally.
// Default: 60 minutes.
function getCacheLifetime(): number {
  const MINUTES_IN_MS = 60000;

  return (
    MINUTES_IN_MS *
    Number(
      workspace.getConfiguration().get<number>(`${packageName}.cacheLifetime`),
    )
  );
}

// Defines how much packages can be analyzed together.
// Default: 20 packages.
function getParallelProcessesLimit(): number {
  return workspace
    .getConfiguration()
    .get<number>(`${packageName}.parallelProcessesLimit`)!;
}

// Initialize the settings with extension context for persistence
function initializeSettings(context: ExtensionContext): void {
  extensionContext = context;
  
  // Load persisted state
  const persistedState = context.workspaceState.get<Record<string, boolean>>('npm-outdated-plus.fileStates', {});
  for (const [filePath, enabled] of Object.entries(persistedState)) {
    fileEnabledState.set(filePath, enabled);
  }
}

// Check if the extension is enabled for a specific file
// Default: false (disabled by default for new files)
function isEnabledForFile(fileUri: Uri): boolean {
  const filePath = fileUri.toString();
  return fileEnabledState.get(filePath) ?? false;
}

// Toggle the enabled state for a specific file
function toggleEnabledForFile(fileUri: Uri): boolean {
  const filePath = fileUri.toString();
  const currentState = fileEnabledState.get(filePath) ?? false;
  const newState = !currentState;
  fileEnabledState.set(filePath, newState);
  persistState();
  return newState;
}

// Set the enabled state for a specific file
function setEnabledForFile(fileUri: Uri, enabled: boolean): void {
  const filePath = fileUri.toString();
  fileEnabledState.set(filePath, enabled);
  persistState();
}

// Get all files and their enabled states (for debugging/persistence)
function getAllFileStates(): Map<string, boolean> {
  return new Map(fileEnabledState);
}

export {
  getAllFileStates,
  getCacheLifetime,
  getDecorationsMode,
  getDoItForMeAction,
  getLevel,
  getParallelProcessesLimit,
  hasMajorUpdateProtection,
  identifySecurityAdvisories,
  initializeSettings,
  isEnabledForFile,
  setEnabledForFile,
  toggleEnabledForFile,
};
