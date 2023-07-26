import {
  type Diagnostic,
  type DiagnosticCollection,
  type TextDocument,
} from "vscode"

import { lazyCallback } from "./Utils"

// This class assists in managing diagnostics for the document.
export class DocumentDiagnostics {
  public render

  private readonly diagnostics: Diagnostic[] = []

  public constructor(
    private readonly document: TextDocument,
    private readonly diagnosticsCollection: DiagnosticCollection,
  ) {
    this.render = lazyCallback(() => {
      this.diagnosticsCollection.clear()
      this.diagnosticsCollection.set(this.document.uri, this.diagnostics)
    }, 100)
  }

  public push(diagnostic: Diagnostic): void {
    this.diagnostics.push(diagnostic)
    void this.render()
  }
}
