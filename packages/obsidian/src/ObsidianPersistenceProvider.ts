// ABOUTME: PersistenceProvider backed by the Obsidian vault API.
// ABOUTME: Assets cached in memory and bundled into the ZIP on save.

import type { PersistenceProvider, MindMapFileFormat } from "@limn/core";
import type { LimnView } from "./LimnView";

export class ObsidianPersistenceProvider implements PersistenceProvider {
  private assetCache = new Map<string, Blob>();

  constructor(private view: LimnView) {}

  load(): Promise<MindMapFileFormat | null> {
    // FileView handles loading via onLoadFile -- return null
    return Promise.resolve(null);
  }

  async save(_data: MindMapFileFormat): Promise<void> {
    await this.view.saveToDisk();
  }

  async saveAsset(assetId: string, blob: Blob): Promise<void> {
    this.assetCache.set(assetId, blob);
  }

  async loadAsset(assetId: string): Promise<Blob | undefined> {
    return this.assetCache.get(assetId);
  }

  async loadAssetUrls(assetIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const id of assetIds) {
      const blob = this.assetCache.get(id);
      if (blob) map.set(id, URL.createObjectURL(blob));
    }
    return map;
  }

  /** Get all cached asset blobs (needed by the view for ZIP building). */
  getAssetBlobs(): Map<string, Blob> {
    return this.assetCache;
  }

  /** Bulk-set asset blobs from a parsed ZIP. */
  setAssetBlobs(blobs: Map<string, Blob>): void {
    this.assetCache = new Map(blobs);
  }

  onExternalChange(_callback: (data: MindMapFileFormat) => void): () => void {
    // External changes handled by vault.on('modify') in LimnView -- no-op
    return () => {};
  }

  dispose(): void {
    this.assetCache.clear();
  }
}
