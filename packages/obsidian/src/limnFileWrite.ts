// ABOUTME: Writes a .limn file's bytes only while that file is still the one in the vault.
// ABOUTME: Stops a save that was already under way from recreating a deleted file or overwriting its replacement.

import type { TFile } from "obsidian";

/** The part of the vault needed to tell whether a file is still the one at its path. */
export interface FileLookup {
  getAbstractFileByPath(path: string): unknown;
}

/**
 * Build the file's bytes and hand them to `write`, unless the file has left the vault. Building is
 * asynchronous, so the file is checked again afterwards: by then it can have been deleted, or a new
 * file can have taken its name. Returns whether the bytes were written.
 */
export async function writeIfCurrent(
  vault: FileLookup,
  file: TFile,
  build: () => Promise<ArrayBuffer>,
  write: (bytes: ArrayBuffer) => Promise<void>,
): Promise<boolean> {
  const isCurrent = () => vault.getAbstractFileByPath(file.path) === file;
  if (!isCurrent()) return false;
  const bytes = await build();
  if (!isCurrent()) return false;
  await write(bytes);
  return true;
}
