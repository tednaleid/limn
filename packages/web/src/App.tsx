// ABOUTME: Root React component for MindForge.
// ABOUTME: Hosts the SVG canvas with a demo mind map.

import { useMemo, useState, useEffect, useCallback } from "react";
import { Editor } from "@mindforge/core";
import type { MindMapFileFormat } from "@mindforge/core";
import { EditorContext } from "./hooks/useEditor";
import { AssetUrlContext, type AssetUrlMap } from "./hooks/useAssetUrls";
import { MindMapCanvas } from "./components/MindMapCanvas";
import { useKeyboardHandler } from "./input/useKeyboardHandler";

const DEMO_MAP: MindMapFileFormat = {
  version: 1,
  meta: { id: "demo", theme: "default" },
  camera: { x: 400, y: 300, zoom: 1 },
  roots: [
    {
      id: "root",
      text: "MindForge",
      x: 0,
      y: 0,
      width: 100,
      height: 32,
      children: [
        {
          id: "c1",
          text: "Core Engine",
          x: 250,
          y: -78,
          width: 100,
          height: 32,
          children: [
            { id: "gc1", text: "Store", x: 500, y: -104, width: 100, height: 32, children: [] },
            { id: "gc2", text: "Layout", x: 500, y: -52, width: 100, height: 32, children: [] },
          ],
        },
        {
          id: "c2",
          text: "Web App",
          x: 250,
          y: 0,
          width: 100,
          height: 32,
          children: [
            { id: "gc3", text: "SVG Renderer", x: 500, y: -26, width: 100, height: 32, children: [] },
            { id: "gc4", text: "Keyboard Input", x: 500, y: 26, width: 100, height: 32, children: [] },
          ],
        },
        {
          id: "c3",
          text: "Persistence",
          x: 250,
          y: 78,
          width: 100,
          height: 32,
          children: [],
        },
      ],
    },
  ],
  assets: [],
};

export function App() {
  const editor = useMemo(() => {
    const e = new Editor();
    e.loadJSON(DEMO_MAP);
    return e;
  }, []);

  useKeyboardHandler(editor);

  const [assetUrls, setAssetUrls] = useState<AssetUrlMap>(new Map());

  const handleAssetAdded = useCallback((e: Event) => {
    const { assetId, blobUrl } = (e as CustomEvent).detail;
    setAssetUrls((prev) => {
      const next = new Map(prev);
      next.set(assetId, blobUrl);
      return next;
    });
  }, []);

  useEffect(() => {
    window.addEventListener("mindforge:asset-added", handleAssetAdded);
    return () => window.removeEventListener("mindforge:asset-added", handleAssetAdded);
  }, [handleAssetAdded]);

  // Handle paste from clipboard
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) return;

          const img = new Image();
          const blobUrl = URL.createObjectURL(file);
          img.onload = () => {
            const assetId = `a${Date.now()}`;
            const asset = {
              id: assetId,
              filename: `pasted-image.${file.type.split("/")[1]}`,
              mimeType: file.type,
              width: img.naturalWidth,
              height: img.naturalHeight,
            };

            const maxDisplayWidth = 300;
            const scale = Math.min(1, maxDisplayWidth / img.naturalWidth);
            const displayWidth = Math.round(img.naturalWidth * scale);
            const displayHeight = Math.round(img.naturalHeight * scale);

            const selectedId = editor.getSelectedId();
            if (selectedId) {
              editor.setNodeImage(selectedId, asset, displayWidth, displayHeight);
            } else {
              const rootId = editor.addRoot("", 0, 0);
              editor.exitEditMode();
              editor.setNodeImage(rootId, asset, displayWidth, displayHeight);
            }

            setAssetUrls((prev) => {
              const next = new Map(prev);
              next.set(assetId, blobUrl);
              return next;
            });
          };
          img.src = blobUrl;
          break;
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [editor]);

  return (
    <EditorContext.Provider value={editor}>
      <AssetUrlContext.Provider value={assetUrls}>
        <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
          <MindMapCanvas />
        </div>
      </AssetUrlContext.Provider>
    </EditorContext.Provider>
  );
}
