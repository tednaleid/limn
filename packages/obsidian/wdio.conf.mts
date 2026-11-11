// ABOUTME: WebdriverIO configuration that runs the end-to-end specs against a real Obsidian.
// ABOUTME: Obsidian is downloaded into .obsidian-cache and opened on a throwaway copy of a fixture vault.

import * as path from "path";

export const config: WebdriverIO.Config = {
  runner: "local",
  framework: "mocha",
  specs: ["./e2e/specs/**/*.e2e.ts"],
  // One Obsidian per spec file, run side by side. Hosted runners have fewer cores and set a lower count.
  maxInstances: Number(process.env.WDIO_MAX_INSTANCES ?? 4),
  capabilities: [{
    browserName: "obsidian",
    browserVersion: "latest",
    "wdio:obsidianOptions": {
      installerVersion: "latest",
      plugins: ["./dist"],
      vault: "e2e/vaults/basic",
    },
  }],
  services: ["obsidian"],
  reporters: ["obsidian"],
  cacheDir: path.resolve(".obsidian-cache"),
  mochaOpts: { ui: "bdd", timeout: 60000 },
  logLevel: "warn",
};
