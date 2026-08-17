// ABOUTME: Obsidian plugin entry point for Limn mind maps.
// ABOUTME: Registers the .limn file extension and LimnView, and the Markdown-backed LimnMarkdownView.

import { Plugin } from "obsidian";
import { setHost } from "@limn/core";
import { LimnView, VIEW_TYPE_LIMN } from "./LimnView";
import { obsidianHost } from "./host/obsidianHost";
import { DEFAULT_SETTINGS, mergeSettings, type LimnSettings } from "./settings";
import { LimnSettingTab } from "./LimnSettingTab";
import { VIEW_TYPE_LIMN_MARKDOWN, MARKDOWN_VIEW_TYPE, hasMindMapMarker } from "./markdown/routing";
import { installRoutingPatch, filePathOf, type LeafChoices } from "./markdown/leafRouting";
import { LimnMarkdownView } from "./markdown/LimnMarkdownView";
import { registerMarkdownCommands } from "./markdown/commands";

export default class LimnPlugin extends Plugin {
  settings: LimnSettings = { ...DEFAULT_SETTINGS };
  leafChoices: LeafChoices = new WeakMap();
  private uninstallRouting: (() => void) | null = null;

  async onload(): Promise<void> {
    setHost(obsidianHost);
    this.settings = mergeSettings(await this.loadData());
    this.registerView(VIEW_TYPE_LIMN, (leaf) => new LimnView(leaf, this));
    this.registerExtensions(["limn"], VIEW_TYPE_LIMN);
    this.registerView(VIEW_TYPE_LIMN_MARKDOWN, (leaf) => new LimnMarkdownView(leaf, this));
    registerMarkdownCommands(this);
    this.addSettingTab(new LimnSettingTab(this.app, this));
    this.uninstallRouting = installRoutingPatch(this);
    this.app.workspace.onLayoutReady(() => this.routeOpenMarkedNotes());

    this.addCommand({
      id: "create-new",
      name: "Create new mind map file (.limn)",
      callback: () => void this.createNewFile(),
    });
  }

  onunload() {
    // Remove the wrapper first so switching leaves back is not re-routed, then hand every map leaf
    // back to the Markdown editor before the view type disappears.
    this.uninstallRouting?.();
    this.uninstallRouting = null;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_LIMN_MARKDOWN)) {
      void leaf.setViewState({ type: MARKDOWN_VIEW_TYPE, state: leaf.getViewState().state });
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Marked notes already open in the Markdown editor when the plugin loads switch to the map view. */
  private routeOpenMarkedNotes(): void {
    if (this.settings.openMarkedNotesAs !== "mindmap") return;
    for (const leaf of this.app.workspace.getLeavesOfType(MARKDOWN_VIEW_TYPE)) {
      if (leaf.isDeferred) continue;
      const state = leaf.getViewState();
      const path = filePathOf(state);
      if (path === undefined) continue;
      if (!hasMindMapMarker(this.app.metadataCache.getCache(path)?.frontmatter)) continue;
      // Re-setting the same state runs it through the wrapper, which rewrites the type.
      void leaf.setViewState(state);
    }
  }

  applyThemeSettingToMarkdownViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_LIMN_MARKDOWN)) {
      if (leaf.view instanceof LimnMarkdownView) leaf.view.applyThemeSetting();
    }
  }

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
