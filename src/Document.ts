import { commands, Range } from "vscode";
import type { DocumentSymbol, TextDocument } from "vscode";

import { PackageInfo } from "#/PackageInfo";
import { waitUntil } from "#/Utils";

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

export type DocumentsPackagesInterface = PackageInfo[];

// Gets an array of packages used in the document, regardless of dependency type.
// The same package may appear in multiple dependency sections (e.g. `devDependencies`
// and `peerDependencies`), so every occurrence is preserved instead of being
// deduplicated by name.
export async function getDocumentPackages(
  document: TextDocument,
): Promise<DocumentsPackagesInterface> {
  let documentsPackages: DocumentsPackagesInterface | undefined = undefined;

  await waitUntil(async () => {
    const symbols: DocumentSymbol[] | undefined = await commands.executeCommand(
      "vscode.executeDocumentSymbolProvider",
      document.uri,
    );

    if (symbols !== undefined) {
      documentsPackages = [
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
          symbols.find((symbol) => symbol.name === "optionalDependencies"),
        ),
      ];
    }

    return symbols !== undefined;
  }, 33);

  return (documentsPackages as DocumentsPackagesInterface | undefined) ?? [];
}
