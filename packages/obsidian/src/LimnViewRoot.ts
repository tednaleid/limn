// ABOUTME: React tree shared by the .limn and Markdown mind map views inside Obsidian.
// ABOUTME: Wires keyboard handling, asset URLs, and the overlay menus around MindMapCanvas.

import { createRoot, type Root } from "react-dom/client";
import { createElement, useState, useEffect, useCallback } from "react";
import type { Editor, PersistenceProvider } from "@limn/core";
import { EditorContext } from "@limn/web/hooks/useEditor";
import { PersistenceContext } from "@limn/web/hooks/usePersistence";
import { AssetUrlContext, type AssetUrlMap } from "@limn/web/hooks/useAssetUrls";
import { usePersistence } from "@limn/web/hooks/usePersistence";
import { MindMapCanvas } from "@limn/web/components/MindMapCanvas";
import { ToolbarOverlay } from "@limn/web/components/ToolbarOverlay";
import { HamburgerMenu } from "@limn/web/components/HamburgerMenu";
import type { MenuItemDef } from "@limn/web/components/HamburgerMenu";
import { exportSvg } from "@limn/web/export/svg";
import { KeystrokeOverlay } from "@limn/web/components/KeystrokeOverlay";
import { useKeyboardHandler } from "@limn/web/input/useKeyboardHandler";
import type { AssetAddedDetail } from "@limn/web/limn-window";
import { useClipboard } from "@limn/web/input/clipboard";

/** Wrapper component that sets up keyboard handling inside the Obsidian view. */
export function LimnViewRoot({ editor, containerEl }: { editor: Editor; containerEl: HTMLElement }) {
  const provider = usePersistence();
  const menuItems: MenuItemDef[] = [
    {
      label: "Export SVG",
      shortcut: "Shift+Cmd+E",
      onClick: () => void exportSvg(editor.getContentBounds(), (id) => provider.loadAsset(id)),
    },
  ];
  // Only handle keyboard events when this view is the active Obsidian leaf.
  // Obsidian adds .mod-active to the workspace-leaf containing the focused tab.
  const isActive = useCallback(
    () => containerEl.closest(".workspace-leaf.mod-active") !== null,
    [containerEl],
  );

  useKeyboardHandler(editor, isActive);

  // Copy, cut, paste, and image paste listen on the view's own document so popout windows work;
  // isActive keeps other leaves in the same window from reacting.
  useClipboard(editor, provider, containerEl.ownerDocument, isActive);

  const [showKeystrokeOverlay, setShowKeystrokeOverlay] = useState(false);
  useEffect(() => {
    const toggle = () => setShowKeystrokeOverlay((v) => !v);
    window.addEventListener("limn:toggle-keystroke-overlay", toggle);
    return () => window.removeEventListener("limn:toggle-keystroke-overlay", toggle);
  }, []);

  // Asset URL management: load existing assets and listen for new drops
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
    const { assetId, blobUrl } = (e as CustomEvent<AssetAddedDetail>).detail;
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

/** Mount the shared tree into a sub-div of the view container. The measurement element (a sibling
 *  in contentEl) stays outside React's managed subtree. Returns the root for unmounting. */
export function mountLimnRoot(contentEl: HTMLElement, editor: Editor, provider: PersistenceProvider): Root {
  const container = contentEl.createDiv({ cls: "limn-react-root" });
  const root = createRoot(container);
  root.render(
    createElement(PersistenceContext.Provider, { value: provider },
      createElement(EditorContext.Provider, { value: editor },
        createElement(LimnViewRoot, { editor, containerEl: contentEl }),
      ),
    ),
  );
  return root;
}
