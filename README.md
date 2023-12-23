# npm-outdated (and pnpm) for vscode

[![build](https://github.com/rentalhost/vscode-npm-outdated/actions/workflows/build.yml/badge.svg)](https://github.com/rentalhost/vscode-npm-outdated/actions/workflows/build.yml)

Displays a diagnostic message in package.json files for packages which have newer versions available as well as a code action to quickly update packages to their latest version.

![Screenshot](/images/screenshot.png)

## Usage

This extension provides three primary means of updating outdated packages. The following code actions are available in `package.json` files.

1. `Update all packages` - This command will update all `dependencies`, `devDependencies` and `peerDependencies` in the package.json file.
1. `Update package` - This command will update a single package to the latest version. This will show when a single package is selected.
1. `Update x packages` - This command will update all the selected packages to the latest version. This will show when multiple packages are selected.
