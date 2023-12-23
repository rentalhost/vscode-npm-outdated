import { workspace } from "vscode";

import { name as packageName } from "./plugin.json";

import type { ReleaseType } from "semver";

// Minimum semver bump required for a package to display as outdated.
// Default: "patch".
export function getLevel(): ReleaseType {
  return workspace.getConfiguration().get<ReleaseType>(`${packageName}.level`)!;
}

// Avoid suggesting that a package be upgraded to a `major` version directly.
// Default: true.
export function hasMajorUpdateProtection(): boolean {
  return workspace
    .getConfiguration()
    .get<boolean>(`${packageName}.majorUpdateProtection`)!;
}

// Identifies packages used with known security advisories.
// Default: true.
export function identifySecurityAdvisories(): boolean {
  return workspace
    .getConfiguration()
    .get<boolean>(`${packageName}.identifySecurityAdvisories`)!;
}

// Displays decorations on the right side of packages.
// Default: true.
export function getDecorationsMode(): "disabled" | "fancy" | "simple" {
  return workspace.getConfiguration().get(`${packageName}.decorations`)!;
}

// Time in minutes in which the versions of packages already analyzed will be kept internally.
// Default: 60 minutes.
export function getCacheLifetime(): number {
  return (
    Number(
      workspace.getConfiguration().get<number>(`${packageName}.cacheLifetime`),
    ) *
    60 *
    1000
  );
}

// Defines how much packages can be analyzed together.
// Default: 20 packages.
export function getParallelProcessesLimit(): number {
  return workspace
    .getConfiguration()
    .get<number>(`${packageName}.parallelProcessesLimit`)!;
}
