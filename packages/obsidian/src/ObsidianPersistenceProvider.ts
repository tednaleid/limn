// ABOUTME: PersistenceProvider backed by the Obsidian vault API.
// ABOUTME: Assets stored as sidecar files in a .assets/ folder next to the .limn file.

import type { PersistenceProvider, MindMapFileFormat } from "@limn/core";
import type { LimnView } from "./LimnView";

export class ObsidianPersistenceProvider implements PersistenceProvider {
  constructor(private view: LimnView) {}

  async load(): Promise<MindMapFileFormat | null> {
    // TextFileView handles loading via setViewData -- return null
    return null;
  }

  async save(_data: MindMapFileFormat): Promise<void> {
    // Trigger TextFileView's save mechanism
    this.view.requestSave();
  }

  async saveAsset(assetId: string, blob: Blob): Promise<void> {
    const buffer = await blob.arrayBuffer();
    const path = this.assetPath(assetId);
    // Ensure the assets directory exists
    const dir = path.substring(0, path.lastIndexOf("/"));
    if (!this.view.app.vault.getAbstractFileByPath(dir)) {
      await this.view.app.vault.createFolder(dir);
    }
    await this.view.app.vault.adapter.writeBinary(path, buffer);
  }

  async loadAsset(assetId: string): Promise<Blob | undefined> {
    const path = this.assetPath(assetId);
    try {
      const buffer = await this.view.app.vault.adapter.readBinary(path);
      return new Blob([buffer]);
    } catch {
      return undefined;
    }
  }

  async loadAssetUrls(assetIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const id of assetIds) {
      const blob = await this.loadAsset(id);
      if (blob) map.set(id, URL.createObjectURL(blob));
    }
    return map;
  }

  onExternalChange(_callback: (data: MindMapFileFormat) => void): () => void {
    // TextFileView handles external changes via setViewData -- no-op
    return () => {};
  }

  dispose(): void {
    // No resources to clean up
  }

  private assetPath(assetId: string): string {
    const file = this.view.file;
    if (!file) throw new Error("No file associated with view");
    const dir = file.parent?.path ?? "";
    const base = file.basename;
    const prefix = dir ? `${dir}/` : "";
    return `${prefix}${base}.assets/${assetId}`;
  }
}
