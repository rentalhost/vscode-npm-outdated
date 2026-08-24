# Changelog

## [4.1.1] - 2026-08-23

### Fixed

- Fixes an issue where the packaged extension failed to load (`Cannot find module 'semver'`) because
  the tsdown migration stopped bundling runtime dependencies while packaging still uses
  `--no-dependencies`;

## [4.1.0] - 2026-08-23

### Changed

- Build tooling migrated to Bun, tsdown and the Oxc suite (oxlint and oxfmt);
- Registry HTTP layer replaced with `@rheactor/rheactor-core` utilities;

## [4.0.0] - 2026-05-26

### Added

- Added support to `bun` package manager;

## [3.3.0] - 2024-12-15

### Added

- Added support to `optionalDependencies`;

### Fixed

- Fixes an issue where the package indicated an available version, but it was deprecated;
- Fixes an issue where packages versions were no longer reprocessed when there were too many
  packages due to the way data from NPM was handled;

## [3.2.0] - 2024-02-03

### Changed

- The "Do it for me" button now supports executing either the `install` command (set as default) or
  the `update` command;

## [3.1.1] - 2024-01-10

### Fixed

- Fixes an issue when `pnpm` generates a "WARN" next to the expected JSON;

## [3.1.0] - 2023-12-23

### Added

- Added support to `peerDependencies`;

### Changed

- Optimized package repository analysis to reduce data transfer;

## [3.0.0] - 2023-07-25

### Added

- Initial release, forked from https://github.com/mskelton/vscode-npm-outdated
- Added full support to `pnpm`;
- Added support to monorepos and multiple workspaces;
