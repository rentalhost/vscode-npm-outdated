import { exec } from "node:child_process";
import { dirname } from "node:path";

import { attempt, matchGroups, parseAs, singleton, unsafeCast } from "@rheactor/rheactor-core";
import { exists } from "@rheactor/rheactor-core/node";
import { prerelease } from "semver";
import type { TextDocument } from "vscode";

import { Cache } from "#/Cache";
import type { PackageInfo } from "#/PackageInfo";
import { getCacheLifetime } from "#/Settings";
import { cacheEnabled, requestSafe } from "#/Utils";

const PACKAGE_VERSION_REGEXP = /^\d+\.\d+\.\d+$/;

interface NPMRegistryPackage {
  versions?: Record<
    string,
    {
      version: string;
      deprecated?: string;
    }
  >;
}

// The `npm view` cache.
const getPackagesCache = singleton(() => new Map<string, Cache<Promise<string[] | null>>>());

type NPMDependencies = Record<string, { version: string }>;

interface NPMListResponse {
  dependencies?: NPMDependencies;
  devDependencies?: NPMDependencies;
  peerDependencies?: NPMDependencies;
  optionalDependencies?: NPMDependencies;
}

const getPackageManagerExecCache = singleton(() => new Cache<Record<string, boolean>>({}));

// Return if asked Package Manager is installed.
async function supportsPackageManager(
  document: TextDocument,
  cmd: "bun" | "npm" | "pnpm",
): Promise<boolean> {
  return new Promise((resolve) => {
    if (
      cacheEnabled() &&
      getPackageManagerExecCache().isValid(getCacheLifetime()) &&
      cmd in getPackageManagerExecCache().value
    ) {
      resolve(getPackageManagerExecCache().value[cmd]!);

      return;
    }

    const cwd = dirname(document.uri.fsPath);

    exec(`${cmd} --version`, { cwd }, (error, stdout) => {
      const isInstalled = !error && PACKAGE_VERSION_REGEXP.test(stdout.trimEnd());

      getPackageManagerExecCache().value[cmd] = isInstalled;

      resolve(isInstalled);
    });
  });
}

function getPackagesInstalledEntries(packages: NPMListResponse): PackagesInstalled | null {
  const dependencies: NPMDependencies = {
    ...packages.dependencies,
    ...packages.devDependencies,
    ...packages.peerDependencies,
    ...packages.optionalDependencies,
  };

  if (Object.keys(dependencies).length > 0) {
    // The `npm ls` command returns a lot of information.
    // We only need the name of the installed package and its version.
    const packageEntries = Object.entries(dependencies).map(([packageName, packageInfo]) => [
      packageName,
      packageInfo.version,
    ]);

    return unsafeCast<PackagesInstalled>(Object.fromEntries(packageEntries));
  }

  return null;
}

const getPackagesAdvisoriesCache = singleton(() => new Map<string, Cache<PackageAdvisory[]>>());

// Get all package versions through `npm view` command.
export async function getPackageVersions(name: string): Promise<string[] | null> {
  // If the package query is in the cache (even in the process of being executed), return it.
  // This ensures that we will not have duplicate execution process while it is within lifetime.
  if (cacheEnabled()) {
    const cachePackages = getPackagesCache().get(name);

    if (cachePackages?.isValid(getCacheLifetime()) === true) {
      return cachePackages.value;
    }
  }

  // We'll use Registry NPM to get the versions directly from the source.
  // This avoids loading processes via `npm view`.
  // The process is cached if it is triggered quickly, within lifetime.
  const execPromise = requestSafe<NPMRegistryPackage>({
    headers: { Accept: "application/vnd.npm.install-v1+json" },
    url: `https://registry.npmjs.org/${name}`,
  }).then(async (data): Promise<string[] | null> => {
    if (data?.versions) {
      return Object.values(data.versions)
        .filter(({ deprecated }) => deprecated === undefined)
        .map(({ version }) => version);
    }

    // Uses `npm view` as a fallback.
    // This usually happens when the package needs authentication.
    // In this case, we'll let `npm` handle it directly.
    return new Promise((resolve) => {
      exec(`npm view --json ${name} versions`, (error, stdout) => {
        resolve(error ? null : (parseAs<string[]>(stdout) ?? null));
      });
    });
  });

  getPackagesCache().set(name, new Cache(execPromise));

  return execPromise;
}

export type PackagesInstalled = Record<string, string | undefined>;

export const packageManagerCaches = new Map<string, Cache<PackageManager | undefined>>();

// Return the current Package Manager.
export async function getPackageManager(document: TextDocument): Promise<PackageManager> {
  const cwd = dirname(document.uri.fsPath);

  if (cacheEnabled()) {
    const packageManagerCache = packageManagerCaches.get(cwd);

    if (
      packageManagerCache?.value !== undefined &&
      packageManagerCache.isValid(getCacheLifetime())
    ) {
      return packageManagerCache.value;
    }
  }

  function setPackageManager(packageManager: PackageManager) {
    packageManagerCaches.set(cwd, new Cache(packageManager));

    return packageManager;
  }

  // Using PNPM with already installed node_modules/ directory.
  if (
    (await exists(`${cwd}/node_modules/.pnpm`)) &&
    (await supportsPackageManager(document, "pnpm"))
  ) {
    return setPackageManager(PackageManager.PNPM);
  }

  // Not installed node_modules/ but pnpm-lock.yaml is present.
  else if (
    (await exists(`${cwd}/pnpm-lock.yaml`)) &&
    (await supportsPackageManager(document, "pnpm"))
  ) {
    return setPackageManager(PackageManager.PNPM);
  }

  // Bun text-format lockfile (Bun 1.2+) or legacy binary lockfile.
  else if (
    ((await exists(`${cwd}/bun.lock`)) || (await exists(`${cwd}/bun.lockb`))) &&
    (await supportsPackageManager(document, "bun"))
  ) {
    return setPackageManager(PackageManager.BUN);
  }

  // In last case, check for NPM.
  else if (await supportsPackageManager(document, "npm")) {
    return setPackageManager(PackageManager.NPM);
  }

  // None available Package Manager supported.
  return setPackageManager(PackageManager.NONE);
}

export const packagesInstalledCaches = new Map<
  string,
  Cache<Promise<PackagesInstalled | undefined>>
>();

// Parse the `bun list` output, which uses a tree-like text format
// (no JSON mode is available). Matches lines like `├── name@version`
// or `└── @scope/name@version` and ignores headers/log noise.
export function parseBunList(data: string): PackagesInstalled | null {
  const lineRegex = /^[└├]── (?<name>(?:@[^/]+\/)?[^\s@]+)@(?<version>\S+)/;
  const dependencies: PackagesInstalled = {};

  for (const line of data.split("\n")) {
    const groups = matchGroups<"name" | "version">(lineRegex, line);

    if (groups?.["name"] !== undefined && groups["version"] !== undefined) {
      dependencies[groups["name"]] = groups["version"];
    }
  }

  return Object.keys(dependencies).length > 0 ? dependencies : null;
}

// Parse a JSON string and return an object of type T.
// It tries to parse the string starting from the beginning and,
// if that fails, continues to try parsing from each newline character
// until it either succeeds or runs out of new data to parse.
export function parseJSON<T>(data: string): T {
  let dataOffset = 0;

  while (dataOffset !== -1) {
    try {
      return unsafeCast<T>(JSON.parse(data.slice(dataOffset)));
    } catch {
      /* empty */
    }

    dataOffset = data.indexOf("\n", dataOffset + 1);
  }

  throw new Error("invalid JSON response");
}

// Returns packages installed by the user and their respective versions.
export async function getPackagesInstalled(
  document: TextDocument,
): Promise<PackagesInstalled | undefined> {
  const cwd = dirname(document.uri.fsPath);

  if (cacheEnabled()) {
    const cache = packagesInstalledCaches.get(cwd);

    if (cache?.isValid(60 * 60 * 1000) === true) {
      return cache.value;
    }
  }

  const packageManager = await getPackageManager(document);

  const execPromise = new Promise<PackagesInstalled | undefined>((resolve) => {
    if (packageManager === PackageManager.PNPM) {
      exec("pnpm ls --json --depth=0", { cwd }, (_error, stdout) => {
        const packagesInstalled = stdout
          ? attempt(
              () => {
                const execResult = parseJSON<[NPMListResponse]>(stdout);

                return Array.isArray(execResult)
                  ? getPackagesInstalledEntries(execResult[0])
                  : null;
              },
              () => null,
            )
          : null;

        resolve(packagesInstalled ?? undefined);
      });

      return;
    }

    if (packageManager === PackageManager.BUN) {
      exec("bun list", { cwd }, (_error, stdout) => {
        if (stdout) {
          const packagesInstalled = parseBunList(stdout);

          if (packagesInstalled !== null) {
            resolve(packagesInstalled);

            return;
          }
        }

        resolve(undefined);
      });

      return;
    }

    exec("npm ls --json --depth=0", { cwd }, (_error, stdout) => {
      const packagesInstalled = stdout
        ? attempt(
            () => getPackagesInstalledEntries(parseJSON(stdout)),
            () => null,
          )
        : null;

      resolve(packagesInstalled ?? undefined);
    });
  });

  packagesInstalledCaches.set(cwd, new Cache(execPromise));

  return execPromise;
}

export interface PackageAdvisory {
  cvss: { score: number };
  severity: string;
  title: string;
  url: string;
  vulnerable_versions: string;
}

export type PackagesAdvisories = Map<string, PackageAdvisory[]>;

// Returns packages with known security advisories.
export async function getPackagesAdvisories(
  packagesInfos: PackageInfo[],
): Promise<PackagesAdvisories | undefined> {
  const packages = await Promise.allSettled(
    packagesInfos.map(async (packageInfo) => {
      if (
        !packageInfo.name ||
        !packageInfo.isNameValid() ||
        packageInfo.isVersionComplex() ||
        getPackagesAdvisoriesCache().get(packageInfo.name)?.isValid(getCacheLifetime()) === true
      ) {
        throw new Error("Invalid package info");
      }

      // We need to push all versions to the NPM Registry.
      // Thus, we can check in real time when the package version is modified by the user.
      return getPackageVersions(packageInfo.name).then((packageVersions) => {
        if (!packageVersions) {
          throw new Error("No package versions found");
        }

        return [
          packageInfo.name,
          packageVersions.filter((packageVersion) => prerelease(packageVersion) === null),
        ] as const;
      });
    }),
  ).then((results) =>
    Object.fromEntries(
      results.filter((result) => result.status === "fulfilled").map((result) => result.value),
    ),
  );

  if (Object.keys(packages).length > 0) {
    // Query advisories through the NPM Registry.
    const responseAdvisories = await requestSafe<PackagesAdvisories>({
      body: packages,
      headers: { "Content-Type": "application/json" },
      method: "post",
      url: "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
    });

    // Fills the packages with their respective advisories.
    if (responseAdvisories) {
      for (const [packageName, packageAdvisories] of Object.entries(responseAdvisories)) {
        getPackagesAdvisoriesCache().set(
          packageName,
          new Cache(unsafeCast<PackageAdvisory[]>(packageAdvisories)),
        );
      }
    }

    // Autocomplete packages without any advisories.
    for (const packageName of Object.keys(packages)) {
      if (!getPackagesAdvisoriesCache().has(packageName)) {
        getPackagesAdvisoriesCache().set(packageName, new Cache([]));
      }
    }
  }

  return new Map(
    [...getPackagesAdvisoriesCache().entries()].map(([packageName, packageAdvisory]) => [
      packageName,
      packageAdvisory.value,
    ]),
  );
}

export const enum PackageManager {
  NPM,
  PNPM,
  BUN,
  NONE,
}
