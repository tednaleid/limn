// ABOUTME: Interface for abstracting document persistence across environments.
// ABOUTME: Web uses IndexedDB; Obsidian would use vault.read()/vault.modify().

import type { MindMapFileFormat } from "../serialization/schema";

export interface PersistenceProvider {
  /** Load the working copy of the document. Returns null if no saved state exists. */
  load(): Promise<MindMapFileFormat | null>;

  /** Save the working copy of the document. */
  save(data: MindMapFileFormat): Promise<void>;

  /** Store a binary asset (image). */
  saveAsset(assetId: string, blob: Blob): Promise<void>;

  /** Load a binary asset by ID. */
  loadAsset(assetId: string): Promise<Blob | undefined>;

  /** Load blob URLs for a list of asset IDs. Returns assetId -> objectURL map. */
  loadAssetUrls(assetIds: string[]): Promise<Map<string, string>>;

  /**
   * Subscribe to external changes (other tabs, vault file edits, etc).
   * Returns unsubscribe function.
   */
  onExternalChange(callback: (data: MindMapFileFormat) => void): () => void;

  /** Clean up resources (timers, channels, event listeners). */
  dispose(): void;
}
