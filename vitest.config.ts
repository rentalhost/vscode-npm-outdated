import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "#": resolve(import.meta.dirname, "./src"),
      vscode: resolve(import.meta.dirname, "./src/__mocks__/vscode.ts"),
    },
  },
  test: {
    exclude: ["**/node_modules/**", "**/out/**"],
    globals: true,
    maxConcurrency: 20,
    server: {
      deps: {
        // Keeps @rheactor/rheactor-core inside the Vitest module runner,
        // so `vi.mock("node:*")` also applies to its own Node imports.
        inline: ["@rheactor/rheactor-core"],
      },
    },
  },
});
