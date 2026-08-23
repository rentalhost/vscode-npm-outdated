import { vi } from "vitest";

let rangeSelectFirsts: number | undefined;

export function __setRangeSelectFirsts(value: number | undefined): void {
  rangeSelectFirsts = value;
}

export class Range {
  public start: { character: number; line: number };

  public end: { character: number; line: number };

  public constructor(
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number,
  ) {
    this.start = { character: startCharacter, line: startLine };
    this.end = { character: endCharacter, line: endLine };
  }

  public intersection(): Range | undefined {
    return rangeSelectFirsts !== undefined && this.end.line + 1 <= rangeSelectFirsts
      ? this
      : undefined;
  }
}

export const ExtensionContext: unknown = vi.fn(() => ({
  subscriptions: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

export class Diagnostic {
  public constructor(
    public range: typeof Range,
    public message: string,
    public severity?: DiagnosticSeverity,
  ) {}
}

export enum DiagnosticSeverity {
  Error,
  Warning,
  Information,
  Hint,
}

export const CodeActionKind = {
  QuickFix: "QuickFix",
};

export const commands = {};

export const languages: { registerCodeActionsProvider: unknown } = {
  registerCodeActionsProvider: vi.fn(),
};

export const window = {
  createTextEditorDecorationType: (): symbol => Symbol(""),
};

export const Uri = {
  parse: (): undefined => undefined,
};

export const workspace: unknown = vi.fn();

export class WorkspaceEdit {
  public replace(): undefined {
    return undefined;
  }
}

export class CodeAction {
  public constructor(public title: string) {}
}

export const l10n = {
  t: (message: string, ...args: unknown[]): string => {
    let messageModified = message;

    for (const [argumentIndex, argument] of args.entries()) {
      messageModified = messageModified.replaceAll(`{${argumentIndex}}`, String(argument));
    }

    return messageModified;
  },
};
