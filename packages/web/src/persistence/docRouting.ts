// ABOUTME: Hash-based document routing for multi-document support.
// ABOUTME: Resolves URL hash to a document ID, handling #data=, #local-doc=, and legacy migration.

import { get, set } from "idb-keyval";
import { decompressFromUrl } from "@limn/core";
import type { MindMapFileFormat } from "@limn/core";

const IDB_DOC_PREFIX = "limn:doc:";
const IDB_RECENT_KEY = "limn:recent";

interface StoredDocument {
  data: MindMapFileFormat;
  savedAt: number;
}

export interface DocRouteResult {
  /** The document ID to use for persistence. */
  docId: string;
  /** Pre-loaded data (from #data= URL), ready to load into editor. */
  initialData?: MindMapFileFormat;
  /** If set, replace window.location.hash with this value. */
  replaceHash?: string;
}

/**
 * Resolve the current URL hash to a document ID and optional initial data.
 *
 * Hash formats:
 *   #local-doc=<uuid>  -- load from IndexedDB by that UUID
 *   #data=<compressed> -- decompress inline data, assign fresh UUID
 *   (empty)            -- reopen last-used document, migrate legacy, or create new
 */
export async function resolveDocId(hash: string): Promise<DocRouteResult> {
  // #local-doc=<uuid>
  if (hash.startsWith("#local-doc=")) {
    const docId = hash.slice("#local-doc=".length);
    return { docId };
  }

  // #data=<compressed> -- shareable URL with inline document
  if (hash.startsWith("#data=")) {
    const compressed = hash.slice("#data=".length);
    const data = decompressFromUrl(compressed);
    const docId = crypto.randomUUID();
    return {
      docId,
      initialData: data ?? undefined,
      replaceHash: `#local-doc=${docId}`,
    };
  }

  // No hash -- try recent, then legacy migration, then fresh
  const recent = await get<string>(IDB_RECENT_KEY);
  if (recent) {
    return { docId: recent, replaceHash: `#local-doc=${recent}` };
  }

  // Legacy migration: check for old "demo" document
  const legacy = await get<StoredDocument>(IDB_DOC_PREFIX + "demo");
  if (legacy) {
    const docId = crypto.randomUUID();
    await set(IDB_DOC_PREFIX + docId, legacy);
    await set(IDB_RECENT_KEY, docId);
    return { docId, replaceHash: `#local-doc=${docId}` };
  }

  // Fresh document
  const docId = crypto.randomUUID();
  return { docId, replaceHash: `#local-doc=${docId}` };
}
