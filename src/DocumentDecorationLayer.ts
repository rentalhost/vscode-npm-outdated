import { window } from "vscode";

import type { DecorationOptions, TextEditorDecorationType } from "vscode";

// We need to store the styles that will be used.
// This way we will support up to 5 different styles in a single line.
const decorationTypes = new Map<number, TextEditorDecorationType>([
  [0, window.createTextEditorDecorationType({})],
  [1, window.createTextEditorDecorationType({})],
  [2, window.createTextEditorDecorationType({})],
  [3, window.createTextEditorDecorationType({})],
  [4, window.createTextEditorDecorationType({})],
]);

export class DocumentDecorationLayer {
  public lines = new Map<number, DecorationOptions>();

  public type: TextEditorDecorationType;

  public constructor(position: number) {
    this.type = decorationTypes.get(position)!;
  }
}
