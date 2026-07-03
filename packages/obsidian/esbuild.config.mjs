// ABOUTME: esbuild config for bundling the Obsidian plugin to a single main.js.
// ABOUTME: Externalizes obsidian API, bundles React (isolated instance).

import esbuild from "esbuild";
import { execSync } from "child_process";
import { copyFileSync, mkdirSync, readFileSync } from "fs";

const dev = process.argv.includes("--dev");
const watch = process.argv.includes("--watch");

mkdirSync("dist", { recursive: true });

// Release builds embed no git sha so the community-plugin scanner's clean
// rebuild (from a repo snapshot with no `.git`) byte-matches our released
// main.js -- the build-verification/reproducibility check. Dev builds keep the
// short sha for local debugging.
let gitSha = "";
if (dev) {
  try {
    gitSha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    gitSha = "unknown";
  }
}
const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const version = pkg.version ?? "dev";

const ctx = await esbuild[watch ? "context" : "build"]({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/main.js",
  external: ["obsidian", "electron", "@codemirror/*"],
  // Bundle Preact (via preact/compat) instead of React. Preact has none of
  // react-dom's resource-preload code, which the Obsidian scanner flags as
  // dynamic <script> creation. Obsidian-only; web/desktop still use React.
  alias: {
    react: "preact/compat",
    "react-dom": "preact/compat",
    "react-dom/client": "preact/compat/client",
    "react/jsx-runtime": "preact/jsx-runtime",
  },
  format: "cjs",
  platform: "node",
  target: "es2022",
  jsx: "automatic",
  sourcemap: dev ? "inline" : false,
  minify: !dev,
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __GIT_SHA__: JSON.stringify(gitSha),
    // Ship production React in release builds (strips dev warnings/checks,
    // ~40% smaller); keep the dev build for --dev/watch DX.
    "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production"),
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
