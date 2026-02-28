// ABOUTME: esbuild config for bundling the Obsidian plugin to a single main.js.
// ABOUTME: Externalizes obsidian API, bundles React (isolated instance).

import esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "fs";

const dev = process.argv.includes("--dev");
const watch = process.argv.includes("--watch");

mkdirSync("dist", { recursive: true });

const ctx = await esbuild[watch ? "context" : "build"]({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/main.js",
  external: ["obsidian", "electron", "@codemirror/*"],
  format: "cjs",
  platform: "node",
  target: "es2022",
  jsx: "automatic",
  sourcemap: dev ? "inline" : false,
  minify: !dev,
  logLevel: "info",
});

// Copy static assets to dist/
copyFileSync("manifest.json", "dist/manifest.json");
copyFileSync("styles.css", "dist/styles.css");

if (watch) {
  await ctx.watch();
  console.log("Watching for changes...");
}
