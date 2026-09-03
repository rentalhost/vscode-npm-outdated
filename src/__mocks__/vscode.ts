import { vi } from "vitest";

let rangeSelectFirsts: number | undefined;

export function setRangeSelectFirsts(value: number | undefined): void {
  rangeSelectFirsts = value;
}

interface RangeInstance {
  end: { character: number; line: number };
  start: { character: number; line: number };

  intersection(): RangeInstance | undefined;
}

export function Range(
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number,
): RangeInstance {
  const range: RangeInstance = {
    start: { character: startCharacter, line: startLine },
    end: { character: endCharacter, line: endLine },

    intersection: () =>
      rangeSelectFirsts !== undefined && range.end.line + 1 <= rangeSelectFirsts
        ? range
        : undefined,
  };

  return range;
}

export const ExtensionContext: unknown = vi.fn<() => unknown>(() => ({
  subscriptions: vi.fn<() => unknown>(() => ({
    push: vi.fn<() => undefined>(),
  })),
}));

interface DiagnosticInstance {
  message: string;
  range: unknown;
  severity?: DiagnosticSeverity;
}

export function Diagnostic(
  range: unknown,
  message: string,
  severity?: DiagnosticSeverity,
): DiagnosticInstance {
  return { message, range, severity };
}

export enum DiagnosticSeverity {
  // oxlint-disable-next-line eslint/no-shadow
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export const CodeActionKind = {
  QuickFix: "QuickFix",
};

export const commands = {};

export const languages = {
  registerCodeActionsProvider: vi.fn<() => undefined>(),
};

export const window = {
  createTextEditorDecorationType: (): symbol => Symbol(""),
};

export const Uri = {
  parse: (): undefined => undefined,
};

export const workspace: unknown = vi.fn<() => undefined>();

interface WorkspaceEditInstance {
  replace(): undefined;
}

export function WorkspaceEdit(): WorkspaceEditInstance {
  return {
    replace: (): undefined => undefined,
  };
}

interface CodeActionInstance {
  title: string;
}

export function CodeAction(title: string): CodeActionInstance {
  return { title };
}

const localization = {
  t: (message: string, ...args: unknown[]): string => {
    let messageModified = message;

    for (const [argumentIndex, argument] of args.entries()) {
      messageModified = messageModified.replaceAll(`{${argumentIndex}}`, String(argument));
    }

    return messageModified;
  },
};

// oxlint-disable-next-line eslint/id-match
export { localization as l10n };
