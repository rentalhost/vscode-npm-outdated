# Changelog

## 3.3.0 - 15/12/2024

- Added support to `optionalDependencies`;
- Fixes an issue where the package indicated an available version, but it was deprecated;
- Fixes an issue where packages versions were no longer reprocessed when there were too many packages due to the way data from NPM was handled;

## 3.2.0 - 03/02/2024

- The "Do it for me" button now supports executing either the `install` command (set as default) or the `update` command;

## 3.1.1 - 10/01/2024

- Fixes an issue when `pnpm` generates a "WARN" next to the expected JSON;

## 3.1.0 - 23/12/2023

- Added support to `peerDependencies`;
- Optimized package repository analysis to reduce data transfer;

## 3.0.0 - 25/07/2023

- Initial release, forked from https://github.com/mskelton/vscode-npm-outdated
- Added full support to `pnpm`;
- Added support to monorepos and multiple workspaces;
