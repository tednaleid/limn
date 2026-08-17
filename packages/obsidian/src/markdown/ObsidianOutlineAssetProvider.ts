// ABOUTME: PersistenceProvider for Markdown-backed maps: images are vault attachments, ids are link texts.
// ABOUTME: load/save are no-ops because TextFileView owns the note; only the asset methods do work.

import type { App, TFile } from "obsidian";
import type { MindMapFileFormat, PersistenceProvider } from "@limn/core";
import { mimeTypeForName } from "./OutlineDocument";

export class ObsidianOutlineAssetProvider implements PersistenceProvider {
  constructor(private readonly app: App, private readonly notePath: () => string) {}

  load(): Promise<MindMapFileFormat | null> {
    return Promise.resolve(null);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }

  /** Write the blob as an attachment next to the note and return the link text that reaches it. */
  async importAsset(filename: string, blob: Blob): Promise<string> {
    const notePath = this.notePath();
    const path = await this.app.fileManager.getAvailablePathForAttachment(filename, notePath);
    const file = await this.app.vault.createBinary(path, await blob.arrayBuffer());
    return this.app.metadataCache.fileToLinktext(file, notePath);
  }

  /** Callers use importAsset; this exists to satisfy the interface and stores under the given name. */
  async saveAsset(assetId: string, blob: Blob): Promise<void> {
    await this.importAsset(assetId, blob);
  }

  async loadAsset(assetId: string): Promise<Blob | undefined> {
    const file = this.resolve(assetId);
    if (!file) return undefined;
    const bytes = await this.app.vault.readBinary(file);
    return new Blob([bytes], { type: mimeTypeForName(file.name) });
  }

  loadAssetUrls(assetIds: string[]): Promise<Map<string, string>> {
    const urls = new Map<string, string>();
    for (const id of assetIds) {
      const file = this.resolve(id);
      if (file) urls.set(id, this.app.vault.getResourcePath(file));
    }
    return Promise.resolve(urls);
  }

  onExternalChange(): () => void {
    return () => {};
  }

  dispose(): void {}

  private resolve(linkText: string): TFile | null {
    return this.app.metadataCache.getFirstLinkpathDest(linkText, this.notePath());
  }
}
