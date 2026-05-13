// ABOUTME: File save/load using browser-fs-access for File System Access API with fallback.
// ABOUTME: Saves .limn files as ZIP (STORE) bundles containing data.json + assets/.

import { fileSave, fileOpen, supported as fsAccessSupported } from "browser-fs-access";
import { zipSync, unzipSync, strToU8, strFromU8, type ZipOptions } from "fflate";
import type { Editor, PersistenceProvider } from "@limn/core";
import { migrateToLatest } from "@limn/core";
import type { MindMapFileFormat } from "@limn/core";

const LIMN_EXTENSION = ".limn";
const LIMN_MIME = "application/octet-stream";

/** Fixed mtime for deterministic ZIP output (git-friendly). */
const FIXED_MTIME = new Date("2024-01-01T00:00:00Z");

/** STORE options: no compression, fixed mtime for deterministic output. */
const STORE_OPTS: ZipOptions = { level: 0, mtime: FIXED_MTIME };

/** Options for saving .limn files (ZIP bundles). */
const SAVE_FILE_OPTIONS = {
  mimeTypes: [LIMN_MIME],
  extensions: [LIMN_EXTENSION],
  description: "Limn Mind Map",
};

/** Options for opening files (accepts both .limn and .limnz for backward compat). */
const OPEN_FILE_OPTIONS = {
  mimeTypes: [LIMN_MIME],
  extensions: [LIMN_EXTENSION, ".limnz"],
  description: "Limn Mind Map",
};

/** Whether the File System Access API is supported (Chromium). */
export const isFileSystemAccessSupported = fsAccessSupported;

/** State for remembering the current file handle. */
let currentHandle: FileSystemFileHandle | null = null;
let currentFilename: string | null = null;

/** Get the current filename (for display in title bar). */
export function getCurrentFilename(): string | null {
  return currentFilename;
}

/** Clear the current file handle (e.g., when creating a new document). */
export function clearFileHandle(): void {
  currentHandle = null;
  currentFilename = null;
}

/**
 * Parse a .limn file (ZIP bundle or legacy JSON).
 * Returns the parsed data and any asset blobs found in the archive.
 */
export async function parseLimnFile(file: File | Blob): Promise<{
  data: MindMapFileFormat;
  assetBlobs: Map<string, Blob>;
}> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Detect format: ZIP starts with PK (0x50, 0x4B)
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return parseZipLimn(bytes);
  }

  // Legacy: plain JSON
  const text = new TextDecoder().decode(bytes);
  const raw: unknown = JSON.parse(text);
  const data: MindMapFileFormat = migrateToLatest(raw as MindMapFileFormat);
  return { data, assetBlobs: new Map() };
}

/** Parse a ZIP-bundled .limn file. */
function parseZipLimn(bytes: Uint8Array): {
  data: MindMapFileFormat;
  assetBlobs: Map<string, Blob>;
} {
  const files = unzipSync(bytes);
  const assetBlobs = new Map<string, Blob>();

  // Extract data.json
  const dataJsonBytes = files["data.json"];
  if (!dataJsonBytes) {
    throw new Error("Invalid .limn file: missing data.json");
  }
  const raw: unknown = JSON.parse(strFromU8(dataJsonBytes));
  const data: MindMapFileFormat = migrateToLatest(raw as MindMapFileFormat);

  // Build filename -> assetId lookup from asset metadata
  const filenameToAssetId = new Map<string, string>();
  for (const asset of data.assets ?? []) {
    filenameToAssetId.set(asset.filename, asset.id);
  }

  // Extract asset files
  for (const [path, content] of Object.entries(files)) {
    if (!path.startsWith("assets/") || path === "assets/") continue;
    const filename = path.slice("assets/".length);
    const assetId = filenameToAssetId.get(filename);
    if (assetId) {
      const fresh = new Uint8Array(content);
      assetBlobs.set(assetId, new Blob([fresh.buffer]));
    }
  }

  return { data, assetBlobs };
}

/**
 * Build a .limn ZIP Blob from document data and pre-loaded asset blobs.
 * Pure function: no IndexedDB access, no File System Access API.
 */
export async function buildLimnZip(
  data: MindMapFileFormat,
  assetBlobs: Map<string, Blob>,
): Promise<Blob> {
  const json = JSON.stringify(data, null, 2);
  const zipFiles: Record<string, [Uint8Array, ZipOptions]> = {
    "data.json": [strToU8(json), STORE_OPTS],
  };

  // Sort assets by filename for deterministic ZIP entry order
  const sortedAssets = [...(data.assets ?? [])].sort((a, b) =>
    a.filename.localeCompare(b.filename),
  );
  for (const asset of sortedAssets) {
    const blob = assetBlobs.get(asset.id);
    if (blob) {
      const buffer = await blob.arrayBuffer();
      zipFiles[`assets/${asset.filename}`] = [new Uint8Array(buffer), STORE_OPTS];
    }
  }

  const zipped = zipSync(zipFiles);
  const fresh = new Uint8Array(zipped);
  return new Blob([fresh.buffer], { type: LIMN_MIME });
}

/**
 * Save the current editor state to a .limn ZIP file.
 * On Chromium: uses showSaveFilePicker, reuses handle for subsequent saves.
 * On Safari/Firefox: triggers a download via <a download>.
 * Returns the filename that was saved to (for UI feedback).
 */
export async function saveToFile(editor: Editor, provider: PersistenceProvider): Promise<string> {
  const data = editor.toJSON();
  const assets = editor.getAssets();

  // Load all asset blobs in parallel before building ZIP.
  // This minimizes async work between the user gesture and fileSave(),
  // which needs transient user activation for showSaveFilePicker.
  const assetBlobs = new Map<string, Blob>();
  await Promise.all(
    assets.map(async (asset) => {
      const blob = await provider.loadAsset(asset.id);
      if (blob) assetBlobs.set(asset.id, blob);
    }),
  );

  const zipBlob = await buildLimnZip(data, assetBlobs);

  const defaultName = currentFilename ?? `${data.meta.id}${LIMN_EXTENSION}`;

  const handle = await fileSave(zipBlob, {
    fileName: defaultName,
    ...SAVE_FILE_OPTIONS,
  }, currentHandle ?? undefined);

  // Remember the handle for subsequent saves (Chromium only)
  if (handle) {
    currentHandle = handle;
    currentFilename = handle.name;
  }

  return currentFilename ?? defaultName;
}

/**
 * Save the current editor state to a new .limn file (always shows file picker).
 * Clears the current handle so the next Cmd+S save goes to the new location.
 * Returns the filename that was saved to (for UI feedback).
 */
export async function saveAsToFile(editor: Editor, provider: PersistenceProvider): Promise<string> {
  const data = editor.toJSON();
  const assets = editor.getAssets();

  const assetBlobs = new Map<string, Blob>();
  await Promise.all(
    assets.map(async (asset) => {
      const blob = await provider.loadAsset(asset.id);
      if (blob) assetBlobs.set(asset.id, blob);
    }),
  );

  const zipBlob = await buildLimnZip(data, assetBlobs);

  const defaultName = currentFilename ?? `${data.meta.id}${LIMN_EXTENSION}`;

  // Pass undefined as handle to always show the file picker
  const handle = await fileSave(zipBlob, {
    fileName: defaultName,
    ...SAVE_FILE_OPTIONS,
  }, undefined);

  if (handle) {
    currentHandle = handle;
    currentFilename = handle.name;
  }

  return currentFilename ?? defaultName;
}

/**
 * Open a .limn or .limnz file and load it into the editor.
 * Supports both ZIP bundles and legacy plain JSON files.
 * Asset blobs are stored in IndexedDB for later retrieval.
 */
export async function openFile(editor: Editor, provider?: PersistenceProvider): Promise<string> {
  const file = await fileOpen({
    ...OPEN_FILE_OPTIONS,
    id: "limn",
  });

  const { data, assetBlobs } = await parseLimnFile(file);

  editor.loadJSON(data);
  editor.remeasureAllNodes();

  // Store asset blobs via provider for later retrieval
  if (provider) {
    for (const [assetId, blob] of assetBlobs) {
      await provider.saveAsset(assetId, blob);
    }
  }

  // Remember the handle for subsequent saves (Chromium only)
  if (file.handle) {
    currentHandle = file.handle;
    currentFilename = file.handle.name;
  } else {
    currentHandle = null;
    currentFilename = file.name;
  }

  return currentFilename;
}
