// ABOUTME: TextFileView that shows a Markdown note's nested bullet lists as an editable mind map.
// ABOUTME: Obsidian's TextFileView owns loading, saving, echo suppression, and merging; this view converts.

import { Notice, TextFileView, type WorkspaceLeaf, type Menu } from "obsidian";
import type { Root } from "react-dom/client";
import { Editor, OUTLINE_CAPABILITIES } from "@limn/core";
import type { AssetAddedDetail } from "@limn/web/limn-window";
import type LimnPlugin from "../main";
import { createDomTextMeasurer } from "../ObsidianTextMeasurer";
import { mountLimnRoot } from "../LimnViewRoot";
import { applyThemeToContainer } from "../viewTheme";
import { describeIssues } from "./unsupportedNotice";
import { OutlineDocument } from "./OutlineDocument";
import { ObsidianOutlineAssetProvider } from "./ObsidianOutlineAssetProvider";
import { VIEW_TYPE_LIMN_MARKDOWN, MARKDOWN_VIEW_TYPE } from "./routing";
import { openLeafAs } from "./leafRouting";
import { openLinkFromMap } from "../openLink";

export class LimnMarkdownView extends TextFileView {
  editor!: Editor;
  private doc!: OutlineDocument;
  private provider!: ObsidianOutlineAssetProvider;
  private reactRoot: Root | null = null;
  private detachDoc: (() => void) | null = null;
  /** Resource URLs already announced to the React tree, by asset id. */
  private assetUrls = new Map<string, string>();

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LimnPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_LIMN_MARKDOWN;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "Mind map";
  }

  getIcon(): string {
    return "git-branch";
  }

  canAcceptExtension(ext: string): boolean {
    return ext === "md";
  }

  async onOpen(): Promise<void> {
    await super.onOpen();
    this.contentEl.addClass("limn-view");
    this.editor = new Editor(createDomTextMeasurer(this.contentEl));
    this.editor.setCapabilities(OUTLINE_CAPABILITIES);
    this.provider = new ObsidianOutlineAssetProvider(this.app, () => this.file?.path ?? "");
    this.doc = new OutlineDocument(this.editor, () => ({
      mode: this.plugin.settings.themeMode,
      lightTheme: this.plugin.settings.lightTheme,
      darkTheme: this.plugin.settings.darkTheme,
    }));
    this.detachDoc = this.doc.attach(this);
    this.editor.onSave(() => void this.save());
    this.editor.onOpenLink((url) => openLinkFromMap(this.app, url, this.file?.path ?? ""));
    // The note stores no theme; the picker in the menu writes the plugin setting instead.
    this.editor.onThemeChange(() => {
      this.plugin.settings.themeMode = this.editor.getTheme();
      this.plugin.settings.lightTheme = this.editor.getLightTheme();
      this.plugin.settings.darkTheme = this.editor.getDarkTheme();
      void this.plugin.saveSettings();
      applyThemeToContainer(this.contentEl, this.editor);
    });
  }

  async onClose(): Promise<void> {
    await super.onClose();
    this.detachDoc?.();
    this.detachDoc = null;
    this.reactRoot?.unmount();
    this.reactRoot = null;
  }

  getViewData(): string {
    return this.doc.viewData();
  }

  setViewData(text: string, clear: boolean): void {
    this.doc.load(text, clear);
    if (this.doc.blockedBy.length > 0) {
      this.refuse();
      return;
    }
    if (clear) {
      this.fitCamera();
      this.assetUrls.clear();
    }
    applyThemeToContainer(this.contentEl, this.editor);
    if (!this.reactRoot) this.reactRoot = mountLimnRoot(this.contentEl, this.editor, this.provider);
    this.announceNewAssets();
  }

  /** Tell the user why and hand the pane to the Markdown editor. Deferred because Obsidian is
   *  still loading the file into this view when setViewData runs. */
  private refuse(): void {
    new Notice(describeIssues(this.doc.blockedBy), 10000);
    const leaf = this.leaf;
    window.setTimeout(() => {
      void openLeafAs(this.plugin, leaf, MARKDOWN_VIEW_TYPE)
        .catch((err: unknown) => { console.error("Failed to open note as Markdown:", err); });
    }, 0);
  }

  clear(): void {
    this.doc.clear();
    this.assetUrls.clear();
  }

  onPaneMenu(menu: Menu, source: string): void {
    super.onPaneMenu(menu, source);
    menu.addItem((item) => item
      .setTitle("Open as Markdown")
      .setIcon("file-text")
      .onClick(() => void openLeafAs(this.plugin, this.leaf, MARKDOWN_VIEW_TYPE)));
  }

  /** Apply the theme from plugin settings (used when the setting changes in the settings tab). */
  applyThemeSetting(): void {
    this.editor.setTheme(this.plugin.settings.themeMode);
  }

  private fitCamera(): void {
    const { clientWidth, clientHeight } = this.contentEl;
    if (clientWidth > 0 && clientHeight > 0) this.editor.zoomToFit(clientWidth, clientHeight);
    else this.editor.setCamera(40, 40, 1);
  }

  /** Resolve resource URLs for images the React tree has not seen, then learn their natural sizes. */
  private announceNewAssets(): void {
    const ids = this.editor.getAssets().map((a) => a.id).filter((id) => !this.assetUrls.has(id));
    if (ids.length === 0) return;
    void this.provider.loadAssetUrls(ids).then((urls) => {
      for (const [assetId, url] of urls) {
        this.assetUrls.set(assetId, url);
        const detail: AssetAddedDetail = { assetId, blobUrl: url };
        window.dispatchEvent(new CustomEvent("limn:asset-added", { detail }));
        if (!this.doc.hasNaturalSize(assetId)) this.resolveNaturalSize(assetId, url);
      }
    });
  }

  private resolveNaturalSize(assetId: string, url: string): void {
    const img = new Image();
    img.onload = () => this.doc.setImageNaturalSize(assetId, img.naturalWidth, img.naturalHeight);
    img.src = url;
  }
}
