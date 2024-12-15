import type { ThemableDecorationAttachmentRenderOptions } from "vscode";

export class Message {
  public constructor(
    public message: string,
    public styleDefault?: ThemableDecorationAttachmentRenderOptions,
    public styleDark?: ThemableDecorationAttachmentRenderOptions,
  ) {}
}
