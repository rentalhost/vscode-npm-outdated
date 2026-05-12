import { writeFile } from "node:fs/promises";
import { stderr, stdout } from "node:process";

import { transformFile } from "@swc/core";
import { build, context } from "esbuild";

import type { BuildOptions } from "esbuild";

const isWatch = process.argv.includes("--watch");

async function buildFile() {
  stdout.write("Building extension.js...\n");

  const buildOptions: BuildOptions = {
    bundle: true,
    entryPoints: ["./src/extension.ts"],
    outfile: "./out/extension.js",
    platform: "node",
    format: "cjs",
    target: "esnext",
    external: ["vscode"],
    tsconfig: "./tsconfig.json",
    allowOverwrite: true,
  };

  if (isWatch) {
    const ctx = await context(buildOptions);

    await ctx.watch();
  } else {
    await build(buildOptions);

    await minifyFile();
  }
}

async function minifyFile() {
  stdout.write("Minifying with SWC... ");

  try {
    const { code } = await transformFile("./out/extension.js", {
      jsc: {
        target: "esnext",
        loose: true,
        minify: {
          compress: { defaults: true, arguments: true, passes: 3 },
          mangle: true,
        },
      },
      minify: true,
    });

    await writeFile("./out/extension.js", code);

    stdout.write(`${(code.length / 1024).toFixed(1)} KB\n`);
  } catch (error: unknown) {
    if (error instanceof Error) {
      stderr.write(`\n${error.message}\n`);
    }
  }
}

await buildFile();
