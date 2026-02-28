// ABOUTME: File save/load using browser-fs-access for File System Access API with fallback.
// ABOUTME: Saves .mindmap files as ZIP bundles containing data.json + assets/.

import { fileSave, fileOpen, supported as fsAccessSupported } from "browser-fs-access";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import type { Editor, PersistenceProvider } from "@limn/core";
import { migrateToLatest } from "@limn/core";
import type { MindMapFileFormat } from "@limn/core";

const MINDMAP_EXTENSION = ".mindmap";
const MINDMAP_MIME = "application/octet-stream";

const FILE_OPTIONS = {
  mimeTypes: [MINDMAP_MIME],
  extensions: [MINDMAP_EXTENSION],
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
 * Parse a .mindmap file (ZIP bundle or legacy JSON).
 * Returns the parsed data and any asset blobs found in the archive.
 */
export async function parseMindmapFile(file: File | Blob): Promise<{
  data: MindMapFileFormat;
  assetBlobs: Map<string, Blob>;
}> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Detect format: ZIP starts with PK (0x50, 0x4B)
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return parseZipMindmap(bytes);
  }

  // Legacy: plain JSON
  const text = new TextDecoder().decode(bytes);
  const raw = JSON.parse(text);
  const data: MindMapFileFormat = migrateToLatest(raw);
  return { data, assetBlobs: new Map() };
}

/** Parse a ZIP-bundled .mindmap file. */
function parseZipMindmap(bytes: Uint8Array): {
  data: MindMapFileFormat;
  assetBlobs: Map<string, Blob>;
} {
  const files = unzipSync(bytes);
  const assetBlobs = new Map<string, Blob>();

  // Extract data.json
  const dataJsonBytes = files["data.json"];
  if (!dataJsonBytes) {
    throw new Error("Invalid .mindmap file: missing data.json");
  }
  const raw = JSON.parse(strFromU8(dataJsonBytes));
  const data: MindMapFileFormat = migrateToLatest(raw);

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
      const buf = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;
      assetBlobs.set(assetId, new Blob([buf]));
    }
  }

  return { data, assetBlobs };
}

/**
 * Build a .mindmap ZIP Blob from document data and pre-loaded asset blobs.
 * Pure function: no IndexedDB access, no File System Access API.
 */
export async function buildMindmapZip(
  data: MindMapFileFormat,
  assetBlobs: Map<string, Blob>,
): Promise<Blob> {
  const json = JSON.stringify(data, null, 2);
  const zipFiles: Record<string, Uint8Array> = {
    "data.json": strToU8(json),
  };

  for (const asset of data.assets ?? []) {
    const blob = assetBlobs.get(asset.id);
    if (blob) {
      const buffer = await blob.arrayBuffer();
      zipFiles[`assets/${asset.filename}`] = new Uint8Array(buffer);
    }
  }

  const zipped = zipSync(zipFiles);
  const zipBuf = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
  return new Blob([zipBuf], { type: MINDMAP_MIME });
}

/**
 * Save the current editor state to a .mindmap ZIP file.
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

  const zipBlob = await buildMindmapZip(data, assetBlobs);

  const defaultName = currentFilename ?? `${data.meta.id}${MINDMAP_EXTENSION}`;

  const handle = await fileSave(zipBlob, {
    fileName: defaultName,
    ...FILE_OPTIONS,
  }, currentHandle ?? undefined);

  // Remember the handle for subsequent saves (Chromium only)
  if (handle) {
    currentHandle = handle;
    currentFilename = handle.name;
  }

  return currentFilename ?? defaultName;
}

/**
 * Open a .mindmap file and load it into the editor.
 * Supports both ZIP bundles and legacy plain JSON files.
 * Asset blobs are stored in IndexedDB for later retrieval.
 */
export async function openFile(editor: Editor, provider?: PersistenceProvider): Promise<string> {
  const file = await fileOpen({
    ...FILE_OPTIONS,
    id: "limn",
  });

  const { data, assetBlobs } = await parseMindmapFile(file);

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
