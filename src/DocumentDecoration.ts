import { prerelease } from "semver";
import { l10n, Range, window } from "vscode";

import { DocumentDecorationManager } from "./DocumentDecorationManager";
import { Message } from "./Message";
import { getDecorationsMode } from "./Settings";
import { icons, margins, themeDark, themeLight } from "./Theme";
import { lazyCallback } from "./Utils";

import type { PackageRelatedDiagnostic } from "./Diagnostic";
import type { PackageInfo } from "./PackageInfo";
import type { PackageAdvisory } from "./PackageManager";
import type { TextDocument, TextEditor } from "vscode";

export class DocumentDecoration {
  private readonly editors: TextEditor[];

  private flushed = false;

  private readonly render;

  public constructor(private readonly document: TextDocument) {
    this.render = lazyCallback(() => {
      const documentLayers = DocumentDecorationManager.fromDocument(
        this.document,
      ).layers.values();

      for (const layer of documentLayers) {
        for (const editor of this.editors) {
          editor.setDecorations(layer.type, [...layer.lines.values()]);
        }
      }
    }, 100);

    this.editors = window.visibleTextEditors.filter(
      (editor) => editor.document === document,
    );
  }

  public clearLine(line: number): void {
    const documentLayers = DocumentDecorationManager.fromDocument(
      this.document,
    ).layers.values();

    for (const decoration of documentLayers) {
      decoration.lines.delete(line);
    }

    void this.render();
  }

  public setCheckedMessage(line: number): void {
    this.setLine(line, [
      new Message(icons.checked, themeLight.iconChecked, themeDark.iconChecked),
    ]);
  }

  public setCheckingMessage(line: number): void {
    this.setLine(line, [new Message(icons.checking)]);
  }

  public async setUpdateMessage(
    line: number,
    packageInfo: PackageRelatedDiagnostic,
  ): Promise<void> {
    const versionLatest =
      (await packageInfo.packageRelated.getVersionLatest())!;

    const packageVersionInstalled =
      await packageInfo.packageRelated.getVersionInstalled();

    if (await packageInfo.packageRelated.requiresInstallCommand()) {
      this.setLine(line, [
        new Message(
          icons.pending,
          themeLight.iconAvailable,
          themeDark.iconAvailable,
        ),
        new Message(l10n.t("Now run your package manager install command.")),
      ]);

      return;
    }

    const updateDetails = [
      new Message(
        icons.updatable,
        themeLight.iconUpdatable,
        themeDark.iconUpdatable,
      ),
      new Message(
        packageVersionInstalled === undefined
          ? l10n.t("Latest version:")
          : l10n.t("Update available:"),
        themeLight.labelUpdatable,
        themeDark.labelUpdatable,
      ),
      new Message(
        versionLatest,
        themeLight.labelVersion,
        themeDark.labelVersion,
      ),
    ];

    if (packageVersionInstalled === undefined) {
      // If the package has not yet been installed by the user, but defined in the dependencies.
      updateDetails.push(
        new Message(
          `(${l10n.t("install pending")})`,
          themeLight.labelPending,
          themeDark.labelPending,
        ),
      );
    } else if (
      await packageInfo.packageRelated.isVersionLatestAlreadyInstalled()
    ) {
      // If the latest version is already installed, it informs that only a user-defined version will be bumped.
      updateDetails.push(
        new Message(
          `(${l10n.t("already installed, just formalization")})`,
          themeLight.labelFormalization,
          themeDark.labelFormalization,
        ),
      );
    }

    // Identifies whether the suggested version is a major update.
    if (await packageInfo.packageRelated.requiresVersionMajorUpdate()) {
      updateDetails.push(
        new Message(
          `(${l10n.t("attention: major update!")})`,
          themeLight.labelMajor,
          themeDark.labelMajor,
        ),
      );
    }

    // Indicate that the suggested version is pre-release.
    // This will only happen if the user defined version is also pre-release.
    if (prerelease(versionLatest)) {
      updateDetails.push(
        new Message(
          `<${l10n.t("pre-release")}>`,
          themeLight.labelPreRelease,
          themeDark.labelPreRelease,
        ),
      );
    }

    this.setLine(line, updateDetails);
  }

  public setAdvisoryMessage(
    packageInfo: PackageInfo,
    packageAdvisory: PackageAdvisory,
  ): void {
    this.setLine(packageInfo.getLine(), [
      new Message(
        icons.advisory,
        themeLight.iconAdvisory,
        themeDark.iconAdvisory,
      ),
      new Message(
        `${l10n.t("Security advisory")} (${l10n.t(
          packageAdvisory.severity.toUpperCase(),
        )}/${packageAdvisory.cvss.score.toFixed(1)}):`,
        themeLight.labelAdvisory,
        themeDark.labelAdvisory,
      ),
      new Message(
        `${packageAdvisory.title.replace(/\.$/, "")}.`,
        themeLight.labelAdvisoryTitle,
        themeDark.labelAdvisoryTitle,
      ),
    ]);
  }

  private setLine(line: number, messages: Message[]): void {
    const decorationManager = DocumentDecorationManager.fromDocument(
      this.document,
    );

    if (this.flushed) {
      decorationManager.flushLine(line);
    } else {
      this.flushed = true;
      decorationManager.flushLayers();
    }

    if (getDecorationsMode() === "simple") {
      const decorationLayer = decorationManager.getLayer(0);

      decorationLayer.lines.set(line, {
        range: new Range(line, 4096, line, 4096),
        renderOptions: {
          after: {
            contentText: messages.map((message) => message.message).join(" "),
            ...themeLight.default,
            ...margins.marginInitial,
          },
          dark: {
            after: { ...themeDark.default },
          },
        },
      });
    } else {
      for (const [messageIndex, message] of messages.entries()) {
        const decorationLayer = decorationManager.getLayer(messageIndex);

        decorationLayer.lines.set(line, {
          range: new Range(line, 4096, line, 4096),
          renderOptions: {
            after: {
              contentText: message.message,
              ...themeLight.default,
              ...(messageIndex === 0
                ? margins.marginInitial
                : margins.marginThen),
              ...message.styleDefault,
            },
            dark: {
              after: {
                ...themeDark.default,
                ...message.styleDark,
              },
            },
          },
        });
      }
    }

    void this.render();
  }
}
