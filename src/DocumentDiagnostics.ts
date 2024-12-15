import { lazyCallback } from "./Utils";

import type { Diagnostic, DiagnosticCollection, TextDocument } from "vscode";

const LAZY_WAITING_DURATION_MS = 100;

export class DocumentDiagnostics {
  public render;

  private readonly diagnostics: Diagnostic[] = [];

  public constructor(
    private readonly document: TextDocument,
    private readonly diagnosticsCollection: DiagnosticCollection,
  ) {
    this.render = lazyCallback(() => {
      this.diagnosticsCollection.clear();
      this.diagnosticsCollection.set(this.document.uri, this.diagnostics);
    }, LAZY_WAITING_DURATION_MS);
  }

  public push(diagnostic: Diagnostic): void {
    this.diagnostics.push(diagnostic);
    void this.render();
  }
}
