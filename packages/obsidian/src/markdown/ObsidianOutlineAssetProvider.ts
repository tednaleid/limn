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

  /** Exists to satisfy the interface; outlines store images through importAsset instead, since the
   *  vault chooses the attachment name rather than the caller. */
  saveAsset(_assetId: string, _blob: Blob): Promise<void> {
    return Promise.reject(new Error("Outline maps store images through importAsset, which chooses the attachment name"));
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
