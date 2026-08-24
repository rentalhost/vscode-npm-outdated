import { defineConfig } from "tsdown";

// oxlint-disable-next-line import/no-anonymous-default-export
export default defineConfig({
  entry: "./src/extension.ts",
  outDir: "./out",
  format: "cjs",
  platform: "node",
  target: "esnext",
  minify: true,
  dts: false,
  deps: { alwaysBundle: ["semver"], neverBundle: ["vscode"] },
});
