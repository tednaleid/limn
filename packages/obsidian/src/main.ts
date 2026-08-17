// ABOUTME: Obsidian plugin entry point for Limn mind maps.
// ABOUTME: Registers the .limn file extension and LimnView for viewing/editing.

import { Plugin } from "obsidian";
import { setHost } from "@limn/core";
import { LimnView, VIEW_TYPE_LIMN } from "./LimnView";
import { obsidianHost } from "./host/obsidianHost";
import { DEFAULT_SETTINGS, mergeSettings, type LimnSettings } from "./settings";
import { LimnSettingTab } from "./LimnSettingTab";

export default class LimnPlugin extends Plugin {
  settings: LimnSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    setHost(obsidianHost);
    this.settings = mergeSettings(await this.loadData());
    this.registerView(VIEW_TYPE_LIMN, (leaf) => new LimnView(leaf, this));
    this.registerExtensions(["limn"], VIEW_TYPE_LIMN);
    this.addSettingTab(new LimnSettingTab(this.app, this));

    this.addCommand({
      id: "create-new",
      name: "Create new mind map",
      callback: () => void this.createNewFile(),
    });
  }

  onunload() {
    // Views are cleaned up by Obsidian via onClose()
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Re-apply the theme setting to open Markdown mind map views (filled in with the view). */
  applyThemeSettingToMarkdownViews(): void {}

  private async createNewFile(): Promise<void> {
    const folder = this.app.vault.getRoot();
    let name = "Untitled.limn";
    let i = 1;
    while (this.app.vault.getAbstractFileByPath(`${folder.path}${name}`)) {
      name = `Untitled ${i}.limn`;
      i++;
    }
    // Empty file; LimnView opens it as a blank document and writes a real
    // ZIP on first save (see loadLimnDocument).
    const file = await this.app.vault.create(`${folder.path}${name}`, "");
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }
}
