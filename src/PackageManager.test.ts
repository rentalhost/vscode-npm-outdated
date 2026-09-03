import { promisify } from "node:util";

import type { RequestOptions } from "@rheactor/rheactor-core";
import { vi } from "vitest";

import { MockedModules } from "#/MockedModules";
import type { ExecCallback } from "#/MockedModules";
import { vscodeSimulator } from "#/TestUtils";

vi.mock(import("node:child_process"), async (importOriginal) => {
  const actual = await importOriginal();

  function execMock(
    command: string,
    options: ExecCallback | undefined,
    callback?: ExecCallback,
  ): unknown {
    const behavior = MockedModules.childProcessExec;

    return behavior === undefined
      ? actual.exec(command, options as never, callback as never)
      : behavior(command, options, callback);
  }

  // Mimics the real `node:child_process.exec`, whose custom promisify hook
  // resolves with `{ stdout, stderr }` instead of a plain stdout string.
  // Production code must use the callback stdout string and never rely on
  // the promisified shape.
  Object.assign(execMock, {
    [promisify.custom]: () => ({ stderr: "", stdout: "1.0.0\n" }),
  });

  return {
    ...actual,
    exec: execMock,
  } as unknown as typeof actual;
});

vi.mock(import("node:fs/promises"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    access: async (file: string): Promise<void> =>
      MockedModules.fsPromisesAccess?.(file) ?? actual.access(file),
  } as unknown as typeof actual;
});

vi.mock(import("#/Utils"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    cacheEnabled: (): boolean => MockedModules.utilsCacheEnabled?.() ?? actual.cacheEnabled(),
    lazyCallback:
      <T extends (...args: never[]) => unknown>(
        callback: T,
      ): ((...args: Parameters<T>) => Promise<void>) =>
      async (...args: Parameters<T>): Promise<void> => {
        await callback(...args);
      },
    promiseLimit:
      () =>
      <T>(callback: () => T): T =>
        callback(),
    requestSafe: async <T>(options: RequestOptions): Promise<T | undefined> => {
      const behavior = MockedModules.utilsRequestSafe;

      if (behavior === undefined) {
        return await actual.requestSafe<T>(options);
      }

      return await behavior(options);
    },
    waitUntil: async (callback: () => unknown): Promise<void> => {
      await callback();
    },
  };
});

describe("package manager exec regression", () => {
  it("detects the package manager when promisify(exec) resolves with { stdout, stderr }", async () => {
    expect.assertions(2);

    const { diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics.at(0)?.message).toContain("Newer version");
  });
});
