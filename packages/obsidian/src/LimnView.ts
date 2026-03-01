// ABOUTME: TextFileView subclass that renders .limn files as interactive mind maps.
// ABOUTME: Mounts React into Obsidian's view container with an isolated React instance.

import { TextFileView, type WorkspaceLeaf } from "obsidian";
import type LimnPlugin from "./main";
import { Editor, migrateToLatest, AutoSaveController } from "@limn/core";
import type { MindMapFileFormat } from "@limn/core";
import { ObsidianPersistenceProvider } from "./ObsidianPersistenceProvider";
import { createDomTextMeasurer } from "./ObsidianTextMeasurer";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { EditorContext } from "@limn/web/hooks/useEditor";
import { PersistenceContext } from "@limn/web/hooks/usePersistence";
import { AssetUrlContext } from "@limn/web/hooks/useAssetUrls";
import { MindMapCanvas } from "@limn/web/components/MindMapCanvas";
import { ToolbarOverlay } from "@limn/web/components/ToolbarOverlay";
import { HamburgerMenu } from "@limn/web/components/HamburgerMenu";
import type { MenuItemDef } from "@limn/web/components/HamburgerMenu";
import { exportSvg } from "@limn/web/export/svg";
import { useKeyboardHandler } from "@limn/web/input/useKeyboardHandler";

export const VIEW_TYPE_LIMN = "limn-view";

const DEFAULT_MAP: MindMapFileFormat = {
  version: 1,
  meta: { id: crypto.randomUUID(), theme: "default" },
  camera: { x: 200, y: 200, zoom: 1 },
  roots: [],
  assets: [],
};

const obsidianMenuItems: MenuItemDef[] = [
  { label: "Export SVG", onClick: () => exportSvg() },
];

/** Wrapper component that sets up keyboard handling inside the Obsidian view. */
function LimnViewRoot({ editor }: { editor: Editor }) {
  useKeyboardHandler(editor);
  return createElement("div", { style: { width: "100%", height: "100%", position: "relative" } },
    createElement(MindMapCanvas),
    createElement(ToolbarOverlay),
    createElement(HamburgerMenu, { items: obsidianMenuItems, showTheme: false }),
  );
}

export class LimnView extends TextFileView {
  private editor!: Editor;
  private provider!: ObsidianPersistenceProvider;
  private autoSave: AutoSaveController | null = null;
  private reactRoot: Root | null = null;

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

  async onOpen(): Promise<void> {
    this.contentEl.addClass("limn-view");
    const measurer = createDomTextMeasurer(this.contentEl);
    this.editor = new Editor(measurer);
    this.provider = new ObsidianPersistenceProvider(this);
    this.autoSave = new AutoSaveController(
      this.editor, this.provider, { mode: "interval", delayMs: 5000 },
    );
  }

  async onClose(): Promise<void> {
    this.autoSave?.dispose();
    this.provider?.dispose();
    this.reactRoot?.unmount();
    this.reactRoot = null;
  }

  setViewData(data: string, clear: boolean): void {
    if (clear) {
      this.clear();
    }
    const parsed: MindMapFileFormat = data ? JSON.parse(data) : DEFAULT_MAP;
    const migrated = migrateToLatest(parsed);
    this.editor.loadJSON(migrated);
    this.editor.remeasureAllNodes();
    if (!this.reactRoot) {
      this.mountReact();
    }
  }

  getViewData(): string {
    return JSON.stringify(this.editor.toJSON(), null, 2);
  }

  clear(): void {
    this.editor.loadJSON(DEFAULT_MAP);
  }

  private mountReact(): void {
    // Mount React into a sub-div so the measurement element (a sibling in
    // contentEl) stays outside React's managed subtree.
    const container = this.contentEl.createDiv();
    container.style.width = "100%";
    container.style.height = "100%";
    this.reactRoot = createRoot(container);
    this.reactRoot.render(
      createElement(PersistenceContext.Provider, { value: this.provider },
        createElement(EditorContext.Provider, { value: this.editor },
          createElement(AssetUrlContext.Provider, { value: new Map() },
            createElement(LimnViewRoot, { editor: this.editor }),
          ),
        ),
      ),
    );
  }
}
