// ABOUTME: Loads .limn bytes into a document, treating an empty file as a new blank doc.
// ABOUTME: The "Create new mind map" command writes an empty file; it opens as a blank map.

import { CURRENT_FORMAT_VERSION } from "@limn/core";
import type { MindMapFileFormat } from "@limn/core";
import { parseLimnFile } from "@limn/web/persistence/file";

/** A valid, empty document, used for brand-new (zero-byte) .limn files. */
export function emptyDocument(): MindMapFileFormat {
  return {
    version: CURRENT_FORMAT_VERSION,
    meta: {
      id: crypto.randomUUID(),
      mode: "system",
      lightTheme: "catppuccin-latte",
      darkTheme: "catppuccin-mocha",
    },
    camera: { x: 0, y: 0, zoom: 1 },
    roots: [],
    assets: [],
  };
}

/**
 * Parse .limn bytes into document data and asset blobs. A zero-byte file is a
 * brand-new, blank document (the create command writes an empty file, which
 * becomes a real ZIP on first save); anything else goes through the normal
 * ZIP/legacy-JSON parser.
 */
export async function loadLimnDocument(bytes: ArrayBuffer): Promise<{
  data: MindMapFileFormat;
  assetBlobs: Map<string, Blob>;
}> {
  if (bytes.byteLength === 0) {
    return { data: emptyDocument(), assetBlobs: new Map() };
  }
  return parseLimnFile(new Blob([bytes]));
}
