// ABOUTME: IndexedDB auto-save using idb-keyval with debounced writes.
// ABOUTME: Persists mind map state between sessions; supports cross-tab sync.

import { get, set } from "idb-keyval";
import type { Editor } from "@limn/core";
import type { MindMapFileFormat } from "@limn/core";

const SAVE_DEBOUNCE_MS = 500;
const IDB_PREFIX = "limn:doc:";
const IDB_REVISION_PREFIX = "limn:rev:";
const IDB_ASSET_PREFIX = "limn:asset:";
const BROADCAST_CHANNEL_NAME = "limn-sync";

interface StoredDocument {
  data: MindMapFileFormat;
  savedAt: number;
}

/** Load a document from IndexedDB by its meta.id. */
export async function loadFromIDB(docId: string): Promise<MindMapFileFormat | null> {
  const stored = await get<StoredDocument>(IDB_PREFIX + docId);
  return stored?.data ?? null;
}

/** Save a document to IndexedDB. */
async function saveToIDB(docId: string, data: MindMapFileFormat, revision: number): Promise<void> {
  await set(IDB_PREFIX + docId, { data, savedAt: Date.now() } satisfies StoredDocument);
  await set(IDB_REVISION_PREFIX + docId, revision);
}

/**
 * Set up auto-save for an editor.
 * Returns a cleanup function that stops auto-save and closes the BroadcastChannel.
 */
export function setupAutoSave(
  editor: Editor,
  docId: string,
  onRemoteUpdate?: (data: MindMapFileFormat) => void,
): () => void {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let revision = 0;
  let channel: BroadcastChannel | null = null;

  // Set up BroadcastChannel for cross-tab sync
  try {
    channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channel.onmessage = async (event) => {
      const msg = event.data;
      if (msg.docId === docId && msg.revision > revision) {
        revision = msg.revision;
        const data = await loadFromIDB(docId);
        if (data && onRemoteUpdate) {
          onRemoteUpdate(data);
        }
      }
    };
  } catch {
    // BroadcastChannel not available (e.g., some test environments)
  }

  // Subscribe to editor changes
  const unsubscribe = editor.subscribe(() => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      revision++;
      const data = editor.toJSON();
      await saveToIDB(docId, data, revision);

      // Broadcast to other tabs
      try {
        channel?.postMessage({ docId, revision });
      } catch {
        // Channel may be closed
      }
    }, SAVE_DEBOUNCE_MS);
  });

  return () => {
    unsubscribe();
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
    }
    channel?.close();
  };
}

/** Store an image blob in IndexedDB. */
export async function saveAssetBlob(assetId: string, blob: Blob): Promise<void> {
  await set(IDB_ASSET_PREFIX + assetId, blob);
}

/** Retrieve an image blob from IndexedDB. */
export async function loadAssetBlob(assetId: string): Promise<Blob | undefined> {
  return get<Blob>(IDB_ASSET_PREFIX + assetId);
}

/** Load blobs for a list of asset IDs and return a map of assetId -> blob URL. */
export async function loadAllAssetBlobs(assetIds: string[]): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();
  await Promise.all(
    assetIds.map(async (id) => {
      const blob = await loadAssetBlob(id);
      if (blob) {
        urlMap.set(id, URL.createObjectURL(blob));
      }
    }),
  );
  return urlMap;
}
