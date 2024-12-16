/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { DiagnosticSeverity } from "vscode";

import { COMMAND_INSTALL, COMMAND_INSTALL_REQUEST } from "./Command";
import { PackageManager } from "./PackageManager";
import { vscodeSimulator } from "./TestUtils";
import { icons } from "./Theme";

jest.mock("node:child_process", () => ({
  __esModule: true,
  ...jest.requireActual("node:child_process"),
}));

jest.mock("node:fs", () => ({
  __esModule: true,
  ...jest.requireActual("node:fs"),
}));

describe("package diagnostics", () => {
  it("initialization without a package.json", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator();

    expect(diagnostics).toHaveLength(0);
    expect(decorations).toStrictEqual([]);
  });

  it("initialization without an empty package.json", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: "",
    });

    expect(diagnostics).toHaveLength(0);
    expect(decorations).toStrictEqual([]);
  });

  it("initialization with package.json without dependencies", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: {},
    });

    expect(diagnostics).toHaveLength(0);
    expect(decorations).toStrictEqual([]);
  });

  it("valid dependency, pending installation", async () => {
    expect.assertions(5);

    const { actions, decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesRepository: { "npm-outdated": ["1.0.0"] },
      selectFirsts: 1,
    });

    expect(diagnostics[0]?.message).toContain("run your package manager");
    expect(diagnostics[0]?.severity).toBe(DiagnosticSeverity.Information);
    expect(decorations[0]).toContain(
      "Now run your package manager install command.",
    );
    expect(actions[0]?.title).toBe("Install package");
    expect(actions).toHaveLength(1);
  });

  it("valid dependency, already installed, just formalization", async () => {
    expect.assertions(3);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.1" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    });

    expect(diagnostics[0]?.message).toContain("Newer version");
    expect(diagnostics[0]?.message).toContain("1.0.1");
    expect(decorations[0]).toContain("(already installed, just formalization)");
  });

  it("valid dependency, newer version available", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    });

    expect(diagnostics[0]?.message).toContain("Newer version");
    expect(decorations[0]).toContain("Update available:");
  });

  it("valid dependency, newer version available, avoid major dump", async () => {
    expect.assertions(3);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1", "2.0.0"] },
    });

    expect(diagnostics[0]?.message).toContain("Newer version");
    expect(diagnostics[0]?.message).toContain("1.0.1");
    expect(decorations[0]).toContain("Update available:");
  });

  it("valid dependency, newer version available, suggesting major dump", async () => {
    expect.assertions(3);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1", "2.0.0"] },
    });

    expect(diagnostics[0]?.message).toContain("Newer version");
    expect(diagnostics[0]?.message).toContain("2.0.0");
    expect(decorations[0]).toContain("(attention: major update!)");
  });

  it("valid dependency, newer version available, major dump protection disabled", async () => {
    expect.assertions(3);

    const { decorations, diagnostics } = await vscodeSimulator({
      configurations: { majorUpdateProtection: false },
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1", "2.0.0"] },
    });

    expect(diagnostics[0]?.message).toContain("Newer version");
    expect(diagnostics[0]?.message).toContain("2.0.0");
    expect(decorations[0]).toContain("(attention: major update!)");
  });

  it("valid dependency, newer version available (using cache)", async () => {
    expect.assertions(4);

    const { decorations: decorations1, diagnostics: diagnostics1 } =
      await vscodeSimulator({
        packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
        packagesInstalled: { "npm-outdated": "1.0.0" },
        packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
      });

    expect(diagnostics1[0]?.message).toContain("Newer version");
    expect(decorations1[0]).toContain("Update available:");

    const { decorations: decorations2, diagnostics: diagnostics2 } =
      await vscodeSimulator({
        cacheEnabled: true,
        packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
        packagesInstalled: { "npm-outdated": "1.0.0" },
        packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
      });

    expect(diagnostics2[0]?.message).toContain("Newer version");
    expect(decorations2[0]).toContain("Update available:");
  });

  it("valid dev dependency, newer version available", async () => {
    expect.assertions(3);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { devDependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    });

    expect(diagnostics[0]?.message).toContain("Newer version");
    expect(diagnostics[0]?.message).toContain("1.0.1");
    expect(decorations[0]).toContain("Update available:");
  });

  it("valid peer dependency, newer version available", async () => {
    expect.assertions(3);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { peerDependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    });

    expect(diagnostics[0]?.message).toContain("Newer version");
    expect(diagnostics[0]?.message).toContain("1.0.1");
    expect(decorations[0]).toContain("Update available:");
  });

  it("valid optional dependency, newer version available", async () => {
    expect.assertions(3);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { optionalDependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    });

    expect(diagnostics[0]?.message).toContain("Newer version");
    expect(diagnostics[0]?.message).toContain("1.0.1");
    expect(decorations[0]).toContain("Update available:");
  });

  it("valid dependency, package version not available", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1" } },
      packagesRepository: { "npm-outdated": ["1.0.0"] },
    });

    expect(diagnostics[0]?.message).toContain("not available");
    expect(decorations[0]).toContain("(install pending)");
  });

  it("valid dependency, latest pre-release", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1-alpha" } },
      packagesInstalled: { "npm-outdated": "1.0.1-alpha" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1-alpha"] },
    });

    expect(diagnostics[0]?.message).toContain("Pre-release version");
    expect(decorations[0]).toContain(icons.checked);
  });

  it("valid dependency, newer pre-release available", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1-alpha" } },
      packagesInstalled: { "npm-outdated": "1.0.1-alpha" },
      packagesRepository: {
        "npm-outdated": ["1.0.0", "1.0.1-alpha", "1.0.2-alpha"],
      },
    });

    expect(diagnostics[0]?.message).toContain("1.0.2-alpha");
    expect(decorations[0]).toContain("<pre-release>");
  });

  it("valid dependency, newer stable-after pre-release available", async () => {
    expect.assertions(3);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1-alpha" } },
      packagesInstalled: { "npm-outdated": "1.0.1-alpha" },
      packagesRepository: {
        "npm-outdated": ["1.0.0", "1.0.1-alpha", "1.0.1"],
      },
    });

    expect(diagnostics[0]?.message).toContain("1.0.1");
    expect(decorations[0]).toContain("Update available:");
    expect(decorations[0]).not.toContain("(attention: major update!)");
  });

  it("valid dependency, upgrading to major pre-release", async () => {
    expect.assertions(3);

    const { decorations } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^2.0.0-alpha" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: {
        "npm-outdated": ["1.0.0", "2.0.0-alpha", "2.0.0"],
      },
    });

    expect(decorations[0]).toContain("Update available:");
    expect(decorations[0]).toContain("2.0.0");
    expect(decorations[0]).toContain("(attention: major update!)");
  });

  it("valid dependency, latest available version", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1" } },
      packagesInstalled: { "npm-outdated": "1.0.1" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    });

    expect(diagnostics).toHaveLength(0);
    expect(decorations[0]).toStrictEqual([icons.checked]);
  });

  it("valid dependency, with partial version", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "1" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0"] },
    });

    expect(diagnostics).toHaveLength(0);
    expect(decorations[0]).toStrictEqual([icons.checked]);
  });

  it("valid dependency, suggests minor or greater only", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      configurations: { level: "minor" },
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    });

    expect(diagnostics).toHaveLength(0);
    expect(decorations[0]).toStrictEqual([icons.checked]);
  });

  it("valid dependency, but cannot get latest version (exception case)", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1" } },
      packagesInstalled: { "npm-outdated": "1.0.1" },
    });

    expect(diagnostics).toHaveLength(0);
    expect(decorations[0]).toStrictEqual([icons.checked]);
  });

  it("valid dependency, no diagnostic", async () => {
    expect.assertions(1);

    const { diagnostics } = await vscodeSimulator({
      configurations: { level: "major" },
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    });

    expect(diagnostics).toHaveLength(0);
  });

  it("valid dependency, waiting for run your package manager install", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    });

    expect(diagnostics[0]?.message).toBe(
      'Ready-to-install package "npm-outdated" at version 1.0.1. Just run your package manager install command.',
    );
    expect(decorations[0]).toContain(
      "Now run your package manager install command.",
    );
  });

  it("valid dependency, with major already installed must not show 'major' tooltip", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "2.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1", "2.0.0"] },
    });

    expect(diagnostics[0]?.message).toContain("available: 1.0.1");
    expect(decorations[0]).not.toContain("(attention: major update!)");
  });

  it("dependency name is invalid", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "invalid!": "^1.0.0" } },
    });

    expect(diagnostics).toHaveLength(0);
    expect(decorations).toStrictEqual([]);
  });

  it("dependency version is complex", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0 || ^2.0.0" } },
    });

    expect(diagnostics).toHaveLength(0);
    expect(decorations).toStrictEqual([]);
  });

  it("dependency version is invalid", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^a.b.c" } },
    });

    expect(diagnostics[0]?.message).toContain("Invalid package version");
    expect(decorations).toStrictEqual([]);
  });

  it("dependency version is incomplete/empty", async () => {
    expect.assertions(1);

    const { decorations } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "" } },
      packagesRepository: { "npm-outdated": ["1.0.0"] },
    });

    expect(decorations[0]).toContain("(install pending)");
  });

  it("decorations simple", async () => {
    expect.assertions(1);

    const { decorations } = await vscodeSimulator({
      configurations: { decorations: "simple" },
      packageJson: { devDependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    });

    expect(decorations[0]).toContain(
      `${icons.updatable} Update available: 1.0.1`,
    );
  });

  it("decorations disabled", async () => {
    expect.assertions(1);

    const { decorations } = await vscodeSimulator({
      configurations: { decorations: "disabled" },
      packageJson: { devDependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    });

    expect(decorations).toStrictEqual([]);
  });

  it("package dependes on auth, so npm view will be used (found)", async () => {
    expect.assertions(2);

    const { diagnostics } = await vscodeSimulator({
      packageJson: { devDependencies: { "@private/npm-outdated": "^1.0.0" } },
      packagesInstalled: { "@private/npm-outdated": "1.0.0" },
      packagesRepository: { "@private/npm-outdated": ["1.0.0", "1.0.1"] },
    });

    expect(diagnostics[0]?.message).toContain("Newer version");
    expect(diagnostics[0]?.message).toContain("1.0.1");
  });

  it("package dependes on auth, so npm view will be used (not found)", async () => {
    expect.assertions(1);

    const { diagnostics } = await vscodeSimulator({
      packageJson: { devDependencies: { "@private/jest": "^1.0.0" } },
      packagesInstalled: { "@private/jest": "1.0.0" },
      packagesRepository: { "@private/jest": ["1.0.0", "1.0.1"] },
    });

    expect(diagnostics).toStrictEqual([]);
  });
});

describe("code actions", () => {
  it("no package selected", async () => {
    expect.assertions(1);

    const { actions } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1" } },
      packagesInstalled: { "npm-outdated": "1.0.1" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
      selectFirsts: 0,
    });

    expect(actions).toHaveLength(0);
  });

  it("no package selected, must not have any action", async () => {
    expect.assertions(1);

    const { actions } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
      selectFirsts: 0,
    });

    expect(actions).toHaveLength(0);
  });

  it("selected a specific package, ready to install", async () => {
    expect.assertions(3);

    const { actions } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "@types/jest": "^1.0.1",
          "npm-outdated": "^1.0.0",
        },
      },
      packagesInstalled: {
        "@types/jest": "1.0.0",
        "npm-outdated": "1.0.0",
      },
      packagesRepository: {
        "@types/jest": ["1.0.0", "1.0.1"],
        "npm-outdated": ["1.0.0", "1.0.1"],
      },
      selectFirsts: 2,
    });

    expect(actions[0]?.title).toBe('Update "npm-outdated" to 1.0.1');
    expect(actions[1]?.title).toBe("Install package");
    expect(actions).toHaveLength(2);
  });

  it("selected two packages, ready to install", async () => {
    expect.assertions(2);

    const { actions } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "@types/jest": "^1.0.1",
          "npm-outdated": "^1.0.1",
        },
      },
      packagesInstalled: {
        "@types/jest": "1.0.0",
        "npm-outdated": "1.0.0",
      },
      packagesRepository: {
        "@types/jest": ["1.0.0", "1.0.1"],
        "npm-outdated": ["1.0.0", "1.0.1"],
      },
      selectFirsts: 2,
    });

    expect(actions[0]?.title).toBe("Install packages");
    expect(actions).toHaveLength(1);
  });

  it("selected a specific package", async () => {
    expect.assertions(2);

    const { actions } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
      selectFirsts: 1,
    });

    expect(actions[0]?.title).toBe('Update "npm-outdated" to 1.0.1');
    expect(actions).toHaveLength(1);
  });

  it("selected first package only", async () => {
    expect.assertions(3);

    const { actions } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "@types/jest": "^1.0.0",
          "npm-outdated": "^1.0.0",
        },
      },
      packagesInstalled: {
        "@types/jest": "1.0.0",
        "npm-outdated": "1.0.0",
      },
      packagesRepository: {
        "@types/jest": ["1.0.0", "1.0.1"],
        "npm-outdated": ["1.0.0", "1.0.1"],
      },
      selectFirsts: 1,
    });

    expect(actions[0]?.title).toBe('Update "@types/jest" to 1.0.1');
    expect(actions[1]?.title).toBe("Update all 2 packages");
    expect(actions).toHaveLength(2);
  });

  it("selected first package only, both major updates", async () => {
    expect.assertions(3);

    const { actions } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "@types/jest": "^1.0.0",
          "npm-outdated": "^1.0.0",
        },
      },
      packagesInstalled: {
        "@types/jest": "1.0.0",
        "npm-outdated": "1.0.0",
      },
      packagesRepository: {
        "@types/jest": ["1.0.0", "2.0.0"],
        "npm-outdated": ["1.0.0", "2.0.0"],
      },
      selectFirsts: 1,
    });

    expect(actions[0]?.title).toBe('Update "@types/jest" to 2.0.0 (major)');
    expect(actions[1]?.title).toBe("Update all 2 packages (major)");
    expect(actions).toHaveLength(2);
  });

  it("selected first package only, both major updates (protection disabled)", async () => {
    expect.assertions(3);

    const { actions } = await vscodeSimulator({
      configurations: {
        majorUpdateProtection: false,
      },
      packageJson: {
        dependencies: {
          "@types/jest": "^1.0.0",
          "npm-outdated": "^1.0.0",
        },
      },
      packagesInstalled: {
        "@types/jest": "1.0.0",
        "npm-outdated": "1.0.0",
      },
      packagesRepository: {
        "@types/jest": ["1.0.0", "2.0.0"],
        "npm-outdated": ["1.0.0", "2.0.0"],
      },
      selectFirsts: 1,
    });

    expect(actions[0]?.title).toBe('Update "@types/jest" to 2.0.0');
    expect(actions[1]?.title).toBe("Update all 2 packages");
    expect(actions).toHaveLength(2);
  });

  it("selected all two packages, with waiting for install another", async () => {
    expect.assertions(3);

    const { actions } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "@types/jest": "^1.0.0",
          "node-fetch": "^1.0.1",
          "npm-outdated": "^1.0.0",
        },
      },
      packagesInstalled: {
        "@types/jest": "1.0.0",
        "node-fetch": "1.0.0",
        "npm-outdated": "1.0.0",
      },
      packagesRepository: {
        "@types/jest": ["1.0.0", "1.0.1"],
        "node-fetch": ["1.0.0", "1.0.1"],
        "npm-outdated": ["1.0.0", "1.0.1"],
      },
      selectFirsts: 3,
    });

    expect(actions[0]?.title).toBe("Update 2 selected packages");
    expect(actions[1]?.title).toBe("Install package");
    expect(actions).toHaveLength(2);
  });

  it("selected all two packages, but one is major update (protection enabled)", async () => {
    expect.assertions(2);

    const { actions } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "@types/jest": "^1.0.0",
          "npm-outdated": "^1.0.0",
        },
      },
      packagesInstalled: {
        "@types/jest": "1.0.0",
        "npm-outdated": "1.0.0",
      },
      packagesRepository: {
        "@types/jest": ["1.0.0", "2.0.0"],
        "npm-outdated": ["1.0.0", "1.0.1"],
      },
      selectFirsts: 2,
    });

    expect(actions[0]?.title).toBe('Update "npm-outdated" to 1.0.1');
    expect(actions).toHaveLength(1);
  });

  it("selected all two packages, but one is major update (protection disabled)", async () => {
    expect.assertions(2);

    const { actions } = await vscodeSimulator({
      configurations: {
        majorUpdateProtection: false,
      },
      packageJson: {
        dependencies: {
          "@types/jest": "^1.0.0",
          "npm-outdated": "^1.0.0",
        },
      },
      packagesInstalled: {
        "@types/jest": "1.0.0",
        "npm-outdated": "1.0.0",
      },
      packagesRepository: {
        "@types/jest": ["1.0.0", "2.0.0"],
        "npm-outdated": ["1.0.0", "1.0.1"],
      },
      selectFirsts: 2,
    });

    expect(actions[0]?.title).toBe("Update 2 selected packages");
    expect(actions).toHaveLength(1);
  });

  it("selected all two packages, both are major update", async () => {
    expect.assertions(2);

    const { actions } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "@types/jest": "^1.0.0",
          "npm-outdated": "^1.0.0",
        },
      },
      packagesInstalled: {
        "@types/jest": "1.0.0",
        "npm-outdated": "1.0.0",
      },
      packagesRepository: {
        "@types/jest": ["1.0.0", "2.0.0"],
        "npm-outdated": ["1.0.0", "2.0.0"],
      },
      selectFirsts: 2,
    });

    expect(actions[0]?.title).toBe("Update 2 selected packages (major)");
    expect(actions).toHaveLength(1);
  });
});

describe("commands", () => {
  it("notify install", async () => {
    expect.assertions(1);

    const { actions } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "2.0.0"] },
      runAction: {
        args: [{ save: jest.fn(), uri: { fsPath: "./test" } }],
        name: COMMAND_INSTALL_REQUEST,
      },
      selectFirsts: 1,
    });

    expect(actions).toHaveLength(1);
  });

  it("install success", async () => {
    expect.assertions(1);

    const { actions } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "2.0.0"] },
      runAction: {
        args: ["npm install", "./"],
        name: COMMAND_INSTALL,
      },
      selectFirsts: 1,
    });

    expect(actions).toHaveLength(1);
  });

  it("install failure", async () => {
    expect.assertions(1);

    const { actions } = await vscodeSimulator({
      execError: true,
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "2.0.0"] },
      runAction: {
        args: ["npm install", "./"],
        name: COMMAND_INSTALL,
      },
      selectFirsts: 1,
    });

    expect(actions).toHaveLength(1);
  });
});

describe("code coverage", () => {
  it("simulate change active text editor", async () => {
    expect.assertions(2);

    const { decorations, diagnostics, document, subscriptions } =
      await vscodeSimulator();

    subscriptions.find(
      (subscription) => subscription[0] === "onDidChangeActiveTextEditor",
    )?.[1]({ document });

    expect(diagnostics).toHaveLength(0);
    expect(decorations).toStrictEqual([]);
  });

  it("simulate change text document", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      triggerChangeAfter: true,
    });

    expect(diagnostics).toHaveLength(0);
    expect(decorations).toStrictEqual([]);
  });

  it("simulate packages-lock.json or pnpm-lock.yaml change", async () => {
    expect.assertions(2);

    const { decorations, diagnostics, subscriptions } = await vscodeSimulator();

    subscriptions.find(
      (subscription) => subscription[0] === "onDidChange",
    )?.[1]({ fsPath: "/repo/package.json" });

    expect(diagnostics).toHaveLength(0);
    expect(decorations).toStrictEqual([]);
  });

  it("simulate close text document", async () => {
    expect.assertions(2);

    const { decorations, diagnostics, document, subscriptions } =
      await vscodeSimulator({
        packageJson: { dependencies: { "npm-outdated": "^a.b.c" } },
      });

    subscriptions.find(
      (subscription) => subscription[0] === "onDidCloseTextDocument",
    )?.[1](document);

    expect(diagnostics).toHaveLength(1);
    expect(decorations).toStrictEqual([]);
  });

  it("decoration re-flush layers", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
      triggerChangeAfter: true,
    });

    expect(diagnostics).toHaveLength(1);
    expect(decorations[0]).toContain("Update available:");
  });
});

describe("security advisories", () => {
  it("updatable", async () => {
    expect.assertions(4);

    const { decorations, diagnostics } = await vscodeSimulator({
      cacheEnabled: true,
      packageJson: {
        dependencies: {
          "@types/jest": "1.0.0",
          "npm-outdated": "^1.0.0",
        },
      },
      packagesAdvisories: {
        "npm-outdated": [
          {
            cvss: { score: 5.6 },
            severity: "high",
            title: "flaw",
            url: "https://testing",
            [`vulnerable_versions`]: "1.0.0",
          },
        ],
      },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    });

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[1]?.message).toContain("Security advisory:");
    expect(decorations[0]).toHaveLength(1);
    expect(decorations[1]).toContain("Security advisory (HIGH/5.6):");
  });

  it("needs downgrade", async () => {
    expect.assertions(4);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "@types/jest": "1.0.0",
          "npm-outdated": "^1.0.1",
        },
      },
      packagesAdvisories: {
        "npm-outdated": [
          {
            cvss: { score: 5.6 },
            severity: "high",
            title: "flaw",
            url: "https://testing",
            [`vulnerable_versions`]: "1.0.1",
          },
        ],
      },
      packagesInstalled: { "npm-outdated": "1.0.1" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1", "1.0.1-alpha"] },
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("downgrade");
    expect(decorations[0]).toHaveLength(1);
    expect(decorations[1]).toContain("Security advisory (HIGH/5.6):");
  });

  it("ignore directory-versions", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "npm-outdated-2": "../src",
          "npm-outdated-3": "./src",
          "npm-outdated-4": "~/src",
          "npm-outdated-5": "/src",
        },
      },
    });

    expect(diagnostics).toHaveLength(0);
    expect(decorations).toHaveLength(0);
  });

  it("ignore protocol versions", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "npm-outdated-1": "file:/src",
          "npm-outdated-2": "http://...",
          "npm-outdated-3": "https://...",
          "npm-outdated-4": "git://...",
          "npm-outdated-5": "git+ssh://...",
        },
      },
    });

    expect(diagnostics).toHaveLength(0);
    expect(decorations).toHaveLength(0);
  });

  it("ignore github packages", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "npm-outdated-1": "rentalhost/vscode-npm-outdated",
          "npm-outdated-2": "rentalhost/vscode-npm-outdated#1234567890",
          "npm-outdated-3": "rentalhost/vscode-npm-outdated#feature/branch",
        },
      },
    });

    expect(diagnostics).toHaveLength(0);
    expect(decorations).toHaveLength(0);
  });

  it("detect installed modules: none", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { jest: "^1.0.1" } },
      packageManager: PackageManager.NONE,
      packagesRepository: { jest: ["1.0.0", "1.0.1"] },
    });

    expect(diagnostics).toHaveLength(0);
    expect(decorations).toHaveLength(0);
  });

  it("detect installed modules: npm", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { jest: "^1.0.1" } },
      packagesInstalled: { jest: "1.0.1" },
      packagesRepository: { jest: ["1.0.0", "1.0.1"] },
    });

    expect(diagnostics).toHaveLength(0);
    expect(decorations[0]).toContain(icons.checked);
  });

  it("detect installed modules: pnpm", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { jest: "^1.0.1" } },
      packageManager: PackageManager.PNPM,
      packagesInstalled: { jest: "1.0.1" },
      packagesRepository: { jest: ["1.0.0", "1.0.1"] },
    });

    expect(diagnostics).toHaveLength(0);
    expect(decorations[0]).toContain(icons.checked);
  });

  it("valid dependency, newer version available (pnpm issue #7514)", async () => {
    expect.assertions(2);

    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packageManager: PackageManager.PNPM,
      packagesInstalled: `pnpm issue printing message before JSON\n${JSON.stringify(
        [
          {
            dependencies: { "npm-outdated": { version: "1.0.0" } },
            name: "test",
          },
        ],
      )}`,
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    });

    expect(diagnostics[0]?.message).toContain("Newer version");
    expect(decorations[0]).toContain("Update available:");
  });
});
