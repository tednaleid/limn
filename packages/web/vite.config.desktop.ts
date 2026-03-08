// ABOUTME: Vite config for desktop (WKWebView) builds.
// ABOUTME: Uses relative base, IIFE format, no code splitting, no PWA.

import { defineConfig } from "vite";
import { execSync } from "child_process";
import react from "@vitejs/plugin-react";

const gitSha = execSync("git rev-parse --short HEAD").toString().trim();
const version = process.env.npm_package_version ?? "dev";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      // Stub out PWA virtual module -- service workers don't work in WKWebView
      "virtual:pwa-register/react": new URL("./src/stubs/pwa-register-react.ts", import.meta.url).pathname,
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __GIT_SHA__: JSON.stringify(gitSha),
  },
  build: {
    outDir: "dist-desktop",
    // Single IIFE bundle -- WKWebView file:// URLs cannot load ES modules
    rollupOptions: {
      output: {
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
