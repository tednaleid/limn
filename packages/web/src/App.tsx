// ABOUTME: Root React component for MindForge.
// ABOUTME: Hosts the SVG canvas with a demo mind map.

import { useMemo, useState, useEffect, useCallback } from "react";
import { Editor } from "@mindforge/core";
import type { MindMapFileFormat } from "@mindforge/core";
import { EditorContext } from "./hooks/useEditor";
import { AssetUrlContext, type AssetUrlMap } from "./hooks/useAssetUrls";
import { MindMapCanvas } from "./components/MindMapCanvas";
import { UpdateBanner } from "./components/UpdateBanner";
import { useKeyboardHandler } from "./input/useKeyboardHandler";
import { setupAutoSave, loadFromIDB } from "./persistence/local";
import { saveToFile, openFile } from "./persistence/file";

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

const DOC_ID = "demo";

export function App() {
  const editor = useMemo(() => new Editor(), []);
  const [loaded, setLoaded] = useState(false);

  // Load from IndexedDB or fall back to demo map
  useEffect(() => {
    loadFromIDB(DOC_ID).then((saved) => {
      editor.loadJSON(saved ?? DEMO_MAP);
      setLoaded(true);
    });
  }, [editor]);

  // Set up auto-save after initial load
  useEffect(() => {
    if (!loaded) return;
    return setupAutoSave(editor, DOC_ID, (data) => {
      editor.loadJSON(data);
    });
  }, [editor, loaded]);

  // Wire Cmd+S and Cmd+O to file save/open
  useEffect(() => {
    editor.onSave(() => {
      saveToFile(editor).catch((err) => {
        // User cancelled the dialog or save failed
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Save failed:", err);
      });
    });
    editor.onOpen(() => {
      openFile(editor).catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Open failed:", err);
      });
    });
  }, [editor]);

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

  if (!loaded) {
    return <div style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>Loading...</div>;
  }

  return (
    <EditorContext.Provider value={editor}>
      <AssetUrlContext.Provider value={assetUrls}>
        <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
          <MindMapCanvas />
          <UpdateBanner />
        </div>
      </AssetUrlContext.Provider>
    </EditorContext.Provider>
  );
}
