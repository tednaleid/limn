// ABOUTME: Root React component for Limn.
// ABOUTME: Hosts the SVG canvas with a demo mind map.

import { useMemo, useState, useEffect, useCallback } from "react";
import { Editor } from "@limn/core";
import type { MindMapFileFormat } from "@limn/core";
import { EditorContext } from "./hooks/useEditor";
import { AssetUrlContext, type AssetUrlMap } from "./hooks/useAssetUrls";
import { MindMapCanvas } from "./components/MindMapCanvas";
import { UpdateBanner } from "./components/UpdateBanner";
import { useKeyboardHandler } from "./input/useKeyboardHandler";
import { setupAutoSave, loadFromIDB, saveAssetBlob, loadAllAssetBlobs } from "./persistence/local";
import { saveToFile, openFile } from "./persistence/file";
import { exportSvg } from "./export/svg";
import { decompressFromUrl } from "@limn/core";
import { domTextMeasurer } from "./text/DomTextMeasurer";
import { applyTheme, resolveThemeName } from "./theme/themes";

const DEMO_MAP: MindMapFileFormat = {
  version: 1,
  meta: { id: "demo", theme: "default" },
  camera: { x: 400, y: 300, zoom: 1 },
  roots: [
    {
      id: "root",
      text: "Limn",
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
  const editor = useMemo(() => new Editor(domTextMeasurer), []);
  const [loaded, setLoaded] = useState(false);

  // Load from URL hash, IndexedDB, or fall back to demo map
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#data=")) {
      const compressed = hash.slice(6);
      const data = decompressFromUrl(compressed);
      if (data) {
        editor.loadJSON(data);
        setLoaded(true);
        return;
      }
    }

    loadFromIDB(DOC_ID).then(async (saved) => {
      editor.loadJSON(saved ?? DEMO_MAP);
      // Restore image blob URLs from IndexedDB
      const assets = editor.getAssets();
      if (assets.length > 0) {
        const urls = await loadAllAssetBlobs(assets.map((a) => a.id));
        if (urls.size > 0) {
          setAssetUrls(urls);
        }
      }
      setLoaded(true);
    });
  }, [editor]);

  // Apply theme from document metadata and listen for system preference changes
  useEffect(() => {
    if (!loaded) return;
    const themeName = editor.getTheme();
    applyTheme(resolveThemeName(themeName));

    // Re-apply when system preference changes (for "system"/"default" theme)
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const current = editor.getTheme();
      if (current === "system" || current === "default") {
        applyTheme(resolveThemeName(current));
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [editor, loaded]);

  // Set up auto-save after initial load
  useEffect(() => {
    if (!loaded) return;
    return setupAutoSave(editor, DOC_ID, (data) => {
      editor.loadJSON(data);
    });
  }, [editor, loaded]);

  // Wire Cmd+S, Cmd+O, Shift+Cmd+E to file/export actions
  useEffect(() => {
    editor.onSave(() => {
      saveToFile(editor).catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Save failed:", err);
      });
    });
    editor.onOpen(async () => {
      try {
        await openFile(editor);
        // Restore asset blob URLs from IndexedDB after loading
        const assets = editor.getAssets();
        if (assets.length > 0) {
          const urls = await loadAllAssetBlobs(assets.map((a) => a.id));
          if (urls.size > 0) {
            setAssetUrls(urls);
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Open failed:", err);
      }
    });
    editor.onExport(() => {
      exportSvg();
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
    window.addEventListener("limn:asset-added", handleAssetAdded);
    return () => window.removeEventListener("limn:asset-added", handleAssetAdded);
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
              filename: `pasted-${assetId}.${file.type.split("/")[1]}`,
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
              editor.setNodeImage(rootId, asset, displayWidth, displayHeight);
              editor.exitEditMode();
            }

            setAssetUrls((prev) => {
              const next = new Map(prev);
              next.set(assetId, blobUrl);
              return next;
            });
            saveAssetBlob(assetId, file);
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
    return <div style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>Loading...</div>;
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
