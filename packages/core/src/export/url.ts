// ABOUTME: URL sharing via lz-string compressed JSON in URL hash fragment.
// ABOUTME: Compresses mind map data for URL-safe sharing, decompresses on load.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import type { MindMapFileFormat } from "../serialization/schema";

/** Safe maximum URL length across browsers (Chrome caps at ~32K). */
export const MAX_SHARE_URL_LENGTH = 32_000;

/**
 * Prepare a mind map for sharing via URL.
 * Returns a shallow clone with assets stripped (image blobs are sidecar files).
 */
export function prepareForShare(data: MindMapFileFormat): MindMapFileFormat {
  return { ...data, assets: [] };
}

/**
 * Compress a mind map to a URL-safe string.
 * Uses lz-string's EncodedURIComponent mode (no +, /, = characters).
 */
export function compressToUrl(data: MindMapFileFormat): string {
  const json = JSON.stringify(data);
  return compressToEncodedURIComponent(json);
}

/**
 * Decompress a URL-safe string back to a mind map.
 * Returns null if the data is invalid or corrupted.
 */
export function decompressFromUrl(compressed: string): MindMapFileFormat | null {
  if (!compressed) return null;

  try {
    const json = decompressFromEncodedURIComponent(compressed);
    if (!json) return null;
    return JSON.parse(json) as MindMapFileFormat;
  } catch {
    return null;
  }
}
