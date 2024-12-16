import { commands, Range } from "vscode";

import { PackageInfo } from "./PackageInfo";
import { waitUntil } from "./Utils";

import type { DocumentSymbol, TextDocument } from "vscode";

// Process packages of a certain dependency type.
// Returns existing packages, their versions and the package range.
function mapDependencyRange(
  document: TextDocument,
  documentSymbol: DocumentSymbol | undefined,
): PackageInfo[] {
  if (!documentSymbol || documentSymbol.children.length === 0) {
    return [];
  }

  return documentSymbol.children.map(
    (child) =>
      new PackageInfo(
        document,
        child.name,
        child.range,
        child.detail,
        new Range(
          child.range.end.line,
          child.range.end.character - 1 - child.detail.length,
          child.range.end.line,
          child.range.end.character - 1,
        ),
      ),
  );
}

export type DocumentsPackagesInterface = Record<string, PackageInfo>;

// Gets an array of packages used in the document, regardless of dependency type.
export async function getDocumentPackages(
  document: TextDocument,
): Promise<DocumentsPackagesInterface> {
  return new Promise((resolve) => {
    void waitUntil(async () => {
      const symbols: DocumentSymbol[] | undefined =
        await commands.executeCommand(
          "vscode.executeDocumentSymbolProvider",
          document.uri,
        );

      if (symbols !== undefined) {
        resolve(
          Object.fromEntries(
            [
              ...mapDependencyRange(
                document,
                symbols.find((symbol) => symbol.name === "dependencies"),
              ),
              ...mapDependencyRange(
                document,
                symbols.find((symbol) => symbol.name === "devDependencies"),
              ),
              ...mapDependencyRange(
                document,
                symbols.find((symbol) => symbol.name === "peerDependencies"),
              ),
              ...mapDependencyRange(
                document,
                symbols.find(
                  (symbol) => symbol.name === "optionalDependencies",
                ),
              ),
            ].map((documentPackage) => [documentPackage.name, documentPackage]),
          ),
        );
      }

      return symbols !== undefined;
    }, 33);
  });
}
