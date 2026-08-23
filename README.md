# npm-outdated-plus

[![build](https://github.com/rentalhost/vscode-npm-outdated/actions/workflows/build.yml/badge.svg)](https://github.com/rentalhost/vscode-npm-outdated/actions/workflows/build.yml)

Highlights outdated packages in `package.json` files and provides code actions to quickly update
them. Fully compatible with **npm**, **pnpm** and **bun**.

![Screenshot](/images/screenshot.png)

## Features

- **Diagnostics**: Shows warnings for packages with newer versions available, pre-releases, pending
  installations, and security advisories.
- **Code actions**: Update single packages, multiple selected packages, or all packages at once.
- **Decorations**: Colorful inline decorations on the right side of packages showing update details
  (`npm-outdated-plus.decorations`).
- **Security advisories**: Identifies packages with known security flaws
  (`npm-outdated-plus.identifySecurityAdvisories`).
- **Major update protection**: Prevents accidental major version bumps
  (`npm-outdated-plus.majorUpdateProtection`).
- **"Do it for me"**: Automatically saves `package.json` and runs the package manager install/update
  command.

## Configuration

| Setting                                        | Description                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `npm-outdated-plus.level`                      | Minimum semver bump to show a package as outdated (major, minor, or patch). |
| `npm-outdated-plus.decorations`                | Display style: `fancy` (colorful), `simple` (minimal), or `disabled`.       |
| `npm-outdated-plus.identifySecurityAdvisories` | Enable security advisory detection.                                         |
| `npm-outdated-plus.majorUpdateProtection`      | Avoid suggesting direct major version upgrades.                             |
| `npm-outdated-plus.cacheLifetime`              | Minutes to cache analyzed package versions.                                 |
| `npm-outdated-plus.parallelProcessesLimit`     | Max packages analyzed simultaneously (0 = unlimited).                       |
| `npm-outdated-plus.doItForMeAction`            | Action to run after updating: `install` or `update`.                        |

## Usage

Three code actions are available in `package.json` files:

1. `Update all packages` — Updates all `dependencies`, `devDependencies`, `peerDependencies` and
   `optionalDependencies`.
1. `Update package` — Updates a single package to the latest version (shown when a single package is
   selected).
1. `Update x packages` — Updates all selected packages (shown when multiple packages are selected).
