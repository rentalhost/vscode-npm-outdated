import { window } from "vscode";

import { DocumentDecorationLayer } from "./DocumentDecorationLayer";

import type { TextDocument } from "vscode";

// We need to create some decoration levels as needed.
// Each layer must have its own style implementation, so that the message order is respected.
// @see https://github.com/microsoft/vscode/issues/169051
export class DocumentDecorationManager {
  private static readonly documents = new WeakMap<
    TextDocument,
    DocumentDecorationManager
  >();

  public layers = new Map<number, DocumentDecorationLayer>();

  // Returns the decoration layers of a document.
  // If the document has never been used, then instantiate and return.
  public static fromDocument(
    document: TextDocument,
  ): DocumentDecorationManager {
    if (!this.documents.has(document)) {
      this.documents.set(document, new DocumentDecorationManager());
    }

    return this.documents.get(document)!;
  }

  // When the document is closed, then it unloads the layers defined for it.
  public static flushDocument(document: TextDocument): void {
    const { layers } = DocumentDecorationManager.fromDocument(document);

    for (const layer of layers.values()) {
      for (const editor of window.visibleTextEditors) {
        if (editor.document === document) {
          editor.setDecorations(layer.type, []);
        }
      }
    }

    this.documents.delete(document);
  }

  public getLayer(position: number): DocumentDecorationLayer {
    if (!this.layers.has(position)) {
      this.layers.set(position, new DocumentDecorationLayer(position));
    }

    return this.layers.get(position)!;
  }

  public flushLayers(): void {
    for (const layer of this.layers.values()) {
      layer.lines.clear();
    }
  }

  public flushLine(line: number): void {
    for (const layer of this.layers.values()) {
      layer.lines.delete(line);
    }
  }
}
