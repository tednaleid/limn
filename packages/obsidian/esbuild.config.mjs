// ABOUTME: esbuild config for bundling the Obsidian plugin to a single main.js.
// ABOUTME: Externalizes obsidian API, bundles React (isolated instance).

import esbuild from "esbuild";
import { execSync } from "child_process";
import { copyFileSync, mkdirSync, readFileSync } from "fs";

const dev = process.argv.includes("--dev");
const watch = process.argv.includes("--watch");

mkdirSync("dist", { recursive: true });

const gitSha = execSync("git rev-parse --short HEAD").toString().trim();
const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const version = pkg.version ?? "dev";

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
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __GIT_SHA__: JSON.stringify(gitSha),
  },
  logLevel: "info",
});

// Copy static assets to dist/
copyFileSync("manifest.json", "dist/manifest.json");
copyFileSync("styles.css", "dist/styles.css");

if (watch) {
  await ctx.watch();
  console.log("Watching for changes...");
}
