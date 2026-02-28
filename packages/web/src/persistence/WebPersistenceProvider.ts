// ABOUTME: Web implementation of PersistenceProvider using IndexedDB and BroadcastChannel.
// ABOUTME: Wraps idb-keyval for storage and BroadcastChannel for cross-tab sync.

import { get, set } from "idb-keyval";
import type { PersistenceProvider, MindMapFileFormat } from "@limn/core";

const IDB_PREFIX = "limn:doc:";
const IDB_REVISION_PREFIX = "limn:rev:";
const IDB_ASSET_PREFIX = "limn:asset:";
const BROADCAST_CHANNEL_NAME = "limn-sync";

interface StoredDocument {
  data: MindMapFileFormat;
  savedAt: number;
}

export class WebPersistenceProvider implements PersistenceProvider {
  private channel: BroadcastChannel | null = null;
  private revision = 0;

  constructor(private docId: string) {}

  async load(): Promise<MindMapFileFormat | null> {
    const stored = await get<StoredDocument>(IDB_PREFIX + this.docId);
    return stored?.data ?? null;
  }

  async save(data: MindMapFileFormat): Promise<void> {
    this.revision++;
    await set(IDB_PREFIX + this.docId, { data, savedAt: Date.now() } satisfies StoredDocument);
    await set(IDB_REVISION_PREFIX + this.docId, this.revision);

    try {
      this.channel?.postMessage({ docId: this.docId, revision: this.revision });
    } catch {
      // Channel may be closed
    }
  }

  async saveAsset(assetId: string, blob: Blob): Promise<void> {
    await set(IDB_ASSET_PREFIX + assetId, blob);
  }

  async loadAsset(assetId: string): Promise<Blob | undefined> {
    return get<Blob>(IDB_ASSET_PREFIX + assetId);
  }

  async loadAssetUrls(assetIds: string[]): Promise<Map<string, string>> {
    const urlMap = new Map<string, string>();
    await Promise.all(
      assetIds.map(async (id) => {
        const blob = await this.loadAsset(id);
        if (blob) {
          urlMap.set(id, URL.createObjectURL(blob));
        }
      }),
    );
    return urlMap;
  }

  onExternalChange(callback: (data: MindMapFileFormat) => void): () => void {
    try {
      this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      this.channel.onmessage = async (event) => {
        const msg = event.data;
        if (msg.docId === this.docId && msg.revision > this.revision) {
          this.revision = msg.revision;
          const data = await this.load();
          if (data) {
            callback(data);
          }
        }
      };
    } catch {
      // BroadcastChannel not available (e.g., some test environments)
    }

    return () => {
      this.channel?.close();
      this.channel = null;
    };
  }

  dispose(): void {
    this.channel?.close();
    this.channel = null;
  }
}
