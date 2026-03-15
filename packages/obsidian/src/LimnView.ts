// ABOUTME: FileView subclass that renders .limn files as interactive mind maps.
// ABOUTME: Mounts React into Obsidian's view container with an isolated React instance.

import { FileView, type WorkspaceLeaf, type TFile, type EventRef } from "obsidian";
import type LimnPlugin from "./main";
import {
  Editor, AutoSaveController,
  resolveTheme, deriveThemeVars, THEME_CSS_VARS,
} from "@limn/core";
import { parseLimnFile, buildLimnZip } from "@limn/web/persistence/file";
import { ObsidianPersistenceProvider } from "./ObsidianPersistenceProvider";
import { createDomTextMeasurer } from "./ObsidianTextMeasurer";
import { createRoot, type Root } from "react-dom/client";
import { createElement, useState, useEffect, useCallback } from "react";
import { EditorContext } from "@limn/web/hooks/useEditor";
import { PersistenceContext } from "@limn/web/hooks/usePersistence";
import { AssetUrlContext, type AssetUrlMap } from "@limn/web/hooks/useAssetUrls";
import { usePersistence } from "@limn/web/hooks/usePersistence";
import { MindMapCanvas } from "@limn/web/components/MindMapCanvas";
import { ToolbarOverlay } from "@limn/web/components/ToolbarOverlay";
import { HamburgerMenu } from "@limn/web/components/HamburgerMenu";
import type { MenuItemDef } from "@limn/web/components/HamburgerMenu";
import { resolveActiveThemeKey } from "@limn/web/theme/themes";
import { exportSvg } from "@limn/web/export/svg";
import { KeystrokeOverlay } from "@limn/web/components/KeystrokeOverlay";
import { useKeyboardHandler } from "@limn/web/input/useKeyboardHandler";

export const VIEW_TYPE_LIMN = "limn-view";

/** Wrapper component that sets up keyboard handling inside the Obsidian view. */
function LimnViewRoot({ editor, containerEl }: { editor: Editor; containerEl: HTMLElement }) {
  const menuItems: MenuItemDef[] = [
    { label: "Export SVG", shortcut: "Shift+Cmd+E", onClick: () => void exportSvg(editor.getContentBounds()) },
  ];
  // Only handle keyboard events when this view is the active Obsidian leaf.
  // Obsidian adds .mod-active to the workspace-leaf containing the focused tab.
  const isActive = useCallback(
    () => containerEl.closest(".workspace-leaf.mod-active") !== null,
    [containerEl],
  );

  useKeyboardHandler(editor, isActive);

  const [showKeystrokeOverlay, setShowKeystrokeOverlay] = useState(false);
  useEffect(() => {
    const toggle = () => setShowKeystrokeOverlay((v) => !v);
    window.addEventListener("limn:toggle-keystroke-overlay", toggle);
    return () => window.removeEventListener("limn:toggle-keystroke-overlay", toggle);
  }, []);

  // Asset URL management: load existing assets and listen for new drops
  const provider = usePersistence();
  const [assetUrls, setAssetUrls] = useState<AssetUrlMap>(new Map());

  useEffect(() => {
    const assets = editor.getAssets();
    if (assets.length > 0) {
      void provider.loadAssetUrls(assets.map((a) => a.id)).then((urls) => {
        if (urls.size > 0) setAssetUrls(urls);
      });
    }
  }, [editor, provider]);

  const handleAssetAdded = useCallback((e: Event) => {
    const { assetId, blobUrl } = (e as CustomEvent).detail;
    setAssetUrls((prev) => {
      const next = new Map(prev);
      next.set(assetId, blobUrl);
      return next;
    });
  }, []);

  useEffect(() => {
    window.addEventListener("limn:asset-added", handleAssetAdded);
    return () => window.removeEventListener("limn:asset-added", handleAssetAdded);
  }, [handleAssetAdded]);

  return createElement(AssetUrlContext.Provider, { value: assetUrls },
    createElement("div", { style: { width: "100%", height: "100%", position: "relative" } },
      createElement(MindMapCanvas),
      createElement(ToolbarOverlay),
      createElement(HamburgerMenu, { items: menuItems, showTheme: true, aboutVariant: "obsidian", keystrokeOverlay: showKeystrokeOverlay }),
      createElement(KeystrokeOverlay, { enabled: showKeystrokeOverlay, isActive }),
    ),
  );
}

export class LimnView extends FileView {
  editor!: Editor;
  provider!: ObsidianPersistenceProvider;
  private autoSave: AutoSaveController | null = null;
  private reactRoot: Root | null = null;
  /** Guard to ignore vault 'modify' events triggered by our own writes. */
  private isSaving = false;
  private vaultModifyRef: EventRef | null = null;

  constructor(leaf: WorkspaceLeaf, _plugin: LimnPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_LIMN;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "Mind Map";
  }

  getIcon(): string {
    return "git-branch";
  }

  canAcceptExtension(ext: string): boolean {
    return ext === "limn";
  }

  async onOpen(): Promise<void> {
    await super.onOpen();
    this.contentEl.addClass("limn-view");
    const measurer = createDomTextMeasurer(this.contentEl);
    this.editor = new Editor(measurer);
    this.provider = new ObsidianPersistenceProvider(this);
    this.autoSave = new AutoSaveController(
      this.editor, this.provider, { mode: "interval", delayMs: 5000 },
    );

    // Apply or clear inline theme CSS when user changes theme via the picker
    this.editor.onThemeChange(() => {
      this.applyThemeToContainer();
    });

    // Listen for external changes to the file (e.g., sync)
    this.vaultModifyRef = this.app.vault.on("modify", (file) => {
      if (this.isSaving) return;
      if (file === this.file) {
        void this.onLoadFile(file as TFile);
      }
    });
  }

  /**
   * Apply or clear inline theme CSS on the .limn-view container.
   * In "system" mode, remove inline properties so Obsidian's stylesheet takes over.
   * In "light" or "dark" mode, resolve the theme and set CSS vars as inline styles.
   */
  private applyThemeToContainer(): void {
    const el = this.contentEl;
    const mode = this.editor.getTheme();
    if (mode === "system") {
      // Clear inline overrides, let Obsidian's CSS mapping take over
      for (const name of THEME_CSS_VARS) {
        el.style.removeProperty(name);
      }
      el.style.removeProperty("color");
      return;
    }
    // Resolve the active theme and apply derived CSS vars as inline styles
    const themeKey = resolveActiveThemeKey(
      mode, this.editor.getLightTheme(), this.editor.getDarkTheme(),
    );
    const effective: "light" | "dark" = themeKey.includes("light") || themeKey.includes("latte") ? "light" : "dark";
    const theme = resolveTheme(themeKey, effective);
    const vars = deriveThemeVars(theme);
    for (const [key, value] of Object.entries(vars)) {
      el.style.setProperty(key, value);
    }
    // Set color directly so buttons (which use `inherit`) get the right color.
    // This bypasses Obsidian's --text-color variable that shadows ours.
    el.style.color = vars["--text-color"];
  }

  async onClose(): Promise<void> {
    await super.onClose();
    if (this.vaultModifyRef) {
      this.app.vault.offref(this.vaultModifyRef);
      this.vaultModifyRef = null;
    }
    this.autoSave?.dispose();
    this.provider?.dispose();
    this.reactRoot?.unmount();
    this.reactRoot = null;
  }

  async onLoadFile(file: TFile): Promise<void> {
    const buf = await this.app.vault.readBinary(file);
    const blob = new Blob([buf]);
    const { data, assetBlobs } = await parseLimnFile(blob);

    // For legacy JSON files with assets, try to load from sidecar directory
    if ((data.assets?.length ?? 0) > 0 && assetBlobs.size === 0) {
      for (const asset of data.assets ?? []) {
        const dir = file.parent?.path ?? "";
        const prefix = dir ? `${dir}/` : "";
        const assetPath = `${prefix}${file.basename}.limn-assets/${asset.id}`;
        try {
          const assetBuf = await this.app.vault.adapter.readBinary(assetPath);
          assetBlobs.set(asset.id, new Blob([assetBuf]));
        } catch {
          // Sidecar asset not found -- skip
        }
      }
    }

    // Populate provider's in-memory asset cache
    this.provider.setAssetBlobs(assetBlobs);

    this.editor.loadJSON(data);
    this.editor.remeasureAllNodes();
    this.applyThemeToContainer();
    if (!this.reactRoot) {
      this.mountReact();
    }
  }

  async onUnloadFile(file: TFile): Promise<void> {
    // Flush any pending auto-save before unloading
    await this.autoSave?.flush();
    await super.onUnloadFile(file);
  }

  /** Save the current document as a ZIP to the vault. */
  async saveToDisk(): Promise<void> {
    if (!this.file) return;
    const data = this.editor.toJSON();
    const assetBlobs = this.provider.getAssetBlobs();
    const zipBlob = await buildLimnZip(data, assetBlobs);
    const arrayBuf = await zipBlob.arrayBuffer();
    this.isSaving = true;
    try {
      await this.app.vault.modifyBinary(this.file, arrayBuf);
    } finally {
      this.isSaving = false;
    }
  }

  private mountReact(): void {
    // Mount React into a sub-div so the measurement element (a sibling in
    // contentEl) stays outside React's managed subtree.
    const container = this.contentEl.createDiv({ cls: "limn-react-root" });
    this.reactRoot = createRoot(container);
    this.reactRoot.render(
      createElement(PersistenceContext.Provider, { value: this.provider },
        createElement(EditorContext.Provider, { value: this.editor },
          createElement(LimnViewRoot, { editor: this.editor, containerEl: this.contentEl }),
        ),
      ),
    );
  }
}
