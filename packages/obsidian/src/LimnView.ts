// ABOUTME: FileView subclass that renders .limn files as interactive mind maps.
// ABOUTME: Mounts the shared React root into Obsidian's view container with an isolated React instance.

import { FileView, TFile, type WorkspaceLeaf, type EventRef } from "obsidian";
import type LimnPlugin from "./main";
import { Editor, AutoSaveController } from "@limn/core";
import { buildLimnZip } from "@limn/web/persistence/file";
import { loadLimnDocument } from "./document";
import { ObsidianPersistenceProvider } from "./ObsidianPersistenceProvider";
import { createDomTextMeasurer } from "./ObsidianTextMeasurer";
import type { Root } from "react-dom/client";
import { mountLimnRoot } from "./LimnViewRoot";
import { applyThemeToContainer } from "./viewTheme";
import { openLinkFromMap } from "./openLink";
import { claimMapKeys } from "./mapKeys";

export const VIEW_TYPE_LIMN = "limn-view";

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
    claimMapKeys(this.app, this);
    const measurer = createDomTextMeasurer(this.contentEl);
    this.editor = new Editor(measurer);
    this.provider = new ObsidianPersistenceProvider(this);
    this.autoSave = new AutoSaveController(
      this.editor, this.provider, { mode: "interval", delayMs: 5000 },
    );

    // Apply or clear inline theme CSS when user changes theme via the picker
    this.editor.onThemeChange(() => {
      applyThemeToContainer(this.contentEl, this.editor);
    });

    this.editor.onOpenLink((url) => openLinkFromMap(this.app, url, this.file?.path ?? ""));

    // Listen for external changes to the file (e.g., sync). This only fires for
    // writes we didn't make (the isSaving guard excludes our own saves), which in
    // Obsidian means the same user's vault syncing from another device -- there is
    // no real-time multi-user collaboration. Known limitations, low severity given
    // that trigger, left for later:
    //   - Reloading via onLoadFile -> loadJSON resets the camera and selection.
    //     Editor.applyExternalUpdate() preserves both (the web app uses it) and
    //     could be wired in here if the viewport jump becomes annoying.
    //   - A partial (non-empty) sync write makes parseLimnFile throw here (an
    //     unhandled rejection); the in-memory document is preserved.
    this.vaultModifyRef = this.app.vault.on("modify", (file) => {
      if (this.isSaving) return;
      if (file === this.file && file instanceof TFile) {
        // A save from Limn always writes a full ZIP, so a 0-byte file here is a
        // transient sync write, not a real edit. Ignore it to avoid blanking the
        // open document; the real content arrives on a later 'modify'.
        if (file.stat.size === 0) return;
        void this.onLoadFile(file);
      }
    });
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
    const { data, assetBlobs } = await loadLimnDocument(buf);

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
    applyThemeToContainer(this.contentEl, this.editor);
    if (!this.reactRoot) {
      this.reactRoot = mountLimnRoot(this.contentEl, this.editor, this.provider);
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
}
