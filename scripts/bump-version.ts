#!/usr/bin/env bun
// ABOUTME: Bumps the version across all Limn packages, commits the change, tags it, and pushes.
// ABOUTME: Usage: bun run scripts/bump-version.ts [version] -- defaults to patch bump if no version given.

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");

const VERSION_FILES = [
  "packages/core/package.json",
  "packages/web/package.json",
  "packages/obsidian/package.json",
  "packages/obsidian/manifest.json",
  "manifest.json",
];

const VERSIONS_JSON = "packages/obsidian/versions.json";

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, path), "utf-8"));
}

function writeJson(path: string, data: Record<string, unknown>): void {
  writeFileSync(join(ROOT, path), JSON.stringify(data, null, 2) + "\n");
}

function bumpPatch(version: string): string {
  const parts = version.split(".");
  if (parts.length !== 3) throw new Error(`Invalid version: ${version}`);
  parts[2] = String(Number(parts[2]) + 1);
  return parts.join(".");
}

function run(cmd: string): void {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

// Read current version from obsidian manifest
const manifest = readJson("packages/obsidian/manifest.json");
const currentVersion = manifest.version as string;
console.log(`Current version: ${currentVersion}`);

// Determine new version
const newVersion = process.argv[2] || bumpPatch(currentVersion);
if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error(`Invalid version format: ${newVersion} (expected X.Y.Z)`);
  process.exit(1);
}
console.log(`New version: ${newVersion}`);

// Update all version files
for (const file of VERSION_FILES) {
  const data = readJson(file);
  data.version = newVersion;
  writeJson(file, data);
  console.log(`Updated ${file}`);
}

// Update versions.json (add new version mapping)
const versionsData = readJson(VERSIONS_JSON) as Record<string, string>;
const minAppVersion = (readJson("packages/obsidian/manifest.json") as Record<string, string>).minAppVersion;
versionsData[newVersion] = minAppVersion;
writeJson(VERSIONS_JSON, versionsData);
console.log(`Updated ${VERSIONS_JSON}`);

// Commit, tag, and push
run(`git add ${VERSION_FILES.join(" ")} ${VERSIONS_JSON}`);
run(`git commit -m "Bump version to ${newVersion}"`);
run(`git tag ${newVersion}`);
run(`git push && git push --tags`);

console.log(`\nVersion ${newVersion} released!`);
