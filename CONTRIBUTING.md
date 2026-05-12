# Contributing

## Installation

Run the following commands to clone the repository for this extension and install all necessary dependencies.

```bash
git clone git@github.com:rentalhost/vscode-npm-outdated.git
cd vscode-npm-outdated
npm install
```

## Testing the extension

To run the extension, open the project in VS Code and run the `Debug: Start Debugging` command. When you start debugging, a new VS Code test instance will be launched with all your extensions disabled except for this extension. The TypeScript compiler will also start in watch mode and compile any changes you make to the extension. After making your changes, run the `Debug: Restart` command to restart the test instance.

## Contributing with translations

Translations are located in the `locales/` directory. The reference file is `bundle.l10n.jsonc` (English). To add or update a translation:

1. Create or edit `bundle.l10n.{locale}.json` (e.g. `bundle.l10n.fr.json`).
2. Only include keys you actually need to translate — missing keys fall back to English.
3. Update `package.nls.{locale}.json` for settings descriptions.

See VS Code's [l10n documentation](https://code.visualstudio.com/api/references/extension-guidelines#localization) for more details.
