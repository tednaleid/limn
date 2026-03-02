// ABOUTME: Root React component for Limn.
// ABOUTME: Hosts the SVG canvas with a demo mind map.

import { useMemo, useState, useEffect, useCallback } from "react";
import { Editor, AutoSaveController } from "@limn/core";
import type { MindMapFileFormat } from "@limn/core";
import { EditorContext } from "./hooks/useEditor";
import { PersistenceContext } from "./hooks/usePersistence";
import { AssetUrlContext, type AssetUrlMap } from "./hooks/useAssetUrls";
import { MindMapCanvas } from "./components/MindMapCanvas";
import { UpdateBanner } from "./components/UpdateBanner";
import { HamburgerMenu } from "./components/HamburgerMenu";
import { ToolbarOverlay } from "./components/ToolbarOverlay";
import { KeystrokeOverlay } from "./components/KeystrokeOverlay";
import { FileStatusBar } from "./components/FileStatusBar";
import { useKeyboardHandler } from "./input/useKeyboardHandler";
import { WebPersistenceProvider } from "./persistence/WebPersistenceProvider";
import { saveToFile, saveAsToFile, openFile, clearFileHandle, getCurrentFilename } from "./persistence/file";
import { exportSvg } from "./export/svg";
import { domTextMeasurer } from "./text/DomTextMeasurer";
import { applyThemeFromMeta } from "./theme/themes";

const DEMO_MAP: MindMapFileFormat = {
  version: 1,
  meta: { id: "demo", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
  camera: { x: 253, y: 400, zoom: 0.85 },
  roots: [
    {
      id: "r1",
      text: "Limn",
      x: 0,
      y: 0,
      width: 65,
      height: 42,
      children: [
        {
          id: "r1c1",
          text: "Keyboard First",
          x: 215,
          y: -151,
          width: 118,
          height: 32,
          children: [
            { id: "r1c1g1", text: "**Arrow keys** or `hjkl`\nto navigate between nodes", x: 483, y: -285, width: 199, height: 52, children: [] },
            { id: "r1c1g2", text: "`Tab` to add a child\n`Shift+Enter` for a sibling", x: 483, y: -213, width: 197, height: 52, children: [] },
            { id: "r1c1g2b", text: "With a node selected,\n`Enter` to edit its contents", x: 483, y: -141, width: 192, height: 52, children: [] },
            {
              id: "r1c1g3",
              text: "`Space` to collapse/expand",
              x: 483,
              y: -69,
              width: 192,
              height: 32,
              collapsed: true,
              children: [
                { id: "r1c1g3a", text: "`Shift+Enter` inserts a\nnewline within a node", x: 825, y: -106, width: 176, height: 52, children: [] },
                { id: "r1c1g3b", text: "`r` reflows children\nto computed positions", x: 825, y: -32, width: 169, height: 52, children: [] },
              ],
            },
            { id: "r1c1g4", text: "Press `?` for all shortcuts", x: 483, y: -17, width: 178, height: 32, children: [] },
          ],
        },
        {
          id: "r1c2",
          text: "Inline *Markdown*",
          x: 215,
          y: 35,
          width: 130,
          height: 32,
          collapsed: true,
          children: [
            { id: "r1c2g1", text: "**bold** and *italic*", x: 495, y: -44, width: 117, height: 32, children: [] },
            { id: "r1c2g2", text: "~~strikethrough~~ and `inline code`", x: 495, y: 8, width: 235, height: 32, children: [] },
            { id: "r1c2g3", text: "***bold italic*** combined", x: 495, y: 60, width: 160, height: 32, children: [] },
            { id: "r1c2g4", text: "Link to [Limn on GitHub](https://github.com/tednaleid/limn)\n`Cmd+Click` to open", x: 495, y: 123, width: 172, height: 52, children: [] },
          ],
        },
        {
          id: "r1c3",
          text: "EasyMotion",
          x: 215,
          y: 87,
          width: 99,
          height: 32,
          collapsed: true,
          children: [
            { id: "r1c3g1", text: "Press `;` to label\nevery visible node", x: 464, y: 50, width: 141, height: 52, children: [] },
            { id: "r1c3g2", text: "Type the label\nto jump instantly", x: 464, y: 124, width: 132, height: 52, children: [] },
          ],
        },
        {
          id: "r1c4",
          text: "Organize & Restructure",
          x: 215,
          y: 139,
          width: 176,
          height: 32,
          collapsed: true,
          children: [
            { id: "r1c4g1", text: "Drag a node onto another\nto reparent it", x: 541, y: 65, width: 190, height: 52, children: [] },
            { id: "r1c4g2", text: "`Alt+Arrows` to reorder\nor indent/outdent", x: 541, y: 139, width: 177, height: 52, children: [] },
            { id: "r1c4g3", text: "`Alt+;` to reparent\nvia EasyMotion labels", x: 541, y: 213, width: 163, height: 52, children: [] },
          ],
        },
        {
          id: "r1c5",
          text: "Multiple Roots",
          x: 215,
          y: 191,
          width: 117,
          height: 32,
          collapsed: true,
          children: [
            {
              id: "r1c5g1",
              text: "To create a new root node",
              x: 482,
              y: 191,
              width: 193,
              height: 32,
              children: [
                { id: "r1c5g1a", text: "Double-click canvas or\npress `Enter` with nothing selected", x: 825, y: 191, width: 249, height: 52, children: [] },
              ],
            },
          ],
        },
        {
          id: "r1c6",
          text: "Themes & Export",
          x: 215,
          y: 243,
          width: 136,
          height: 32,
          collapsed: true,
          children: [
            { id: "r1c6g1", text: "8 built-in color themes", x: 501, y: 163, width: 171, height: 32, children: [] },
            { id: "r1c6g2", text: "`Cmd+S` to save\n`Cmd+Shift+E` to export SVG", x: 501, y: 216, width: 211, height: 52, children: [] },
            {
              id: "r1c6g3",
              text: "Works offline as a\nProgressive Web App (PWA)",
              x: 501,
              y: 290,
              width: 208,
              height: 52,
              children: [],
            },
            {
              id: "r1c6g4",
              text: "All storage is local",
              x: 501,
              y: 354,
              width: 142,
              height: 32,
              children: [
                { id: "r1c6g4a", text: "Nothing is sent to the cloud", x: 793, y: 328, width: 203, height: 32, children: [] },
                { id: "r1c6g4b", text: "Your information is kept private", x: 793, y: 380, width: 226, height: 32, children: [] },
              ],
            },
          ],
        },
        {
          id: "r1c7",
          text: "Obsidian Plugin",
          x: 215,
          y: 295,
          width: 125,
          height: 32,
          collapsed: true,
          children: [
            { id: "r1c7g1", text: "Open .limn files natively\nin Obsidian", x: 490, y: 295, width: 178, height: 52, children: [] },
          ],
        },
      ],
    },
  ],
  assets: [],
};

interface AppProps {
  docId: string;
  initialData?: MindMapFileFormat;
}

export function App({ docId, initialData }: AppProps) {
  const editor = useMemo(() => new Editor(domTextMeasurer), []);
  const provider = useMemo(() => new WebPersistenceProvider(docId), [docId]);
  const [loaded, setLoaded] = useState(false);

  // Load from initialData (shared URL), provider (IndexedDB), or fall back to demo map
  useEffect(() => {
    if (initialData) {
      editor.loadJSON(initialData);
      editor.remeasureAllNodes();
      setLoaded(true);
      return;
    }

    provider.load().then(async (saved) => {
      editor.loadJSON(saved ?? DEMO_MAP);
      editor.remeasureAllNodes();
      // Restore image blob URLs
      const assets = editor.getAssets();
      if (assets.length > 0) {
        const urls = await provider.loadAssetUrls(assets.map((a) => a.id));
        if (urls.size > 0) {
          setAssetUrls(urls);
        }
      }
      setLoaded(true);
    });
  }, [editor, provider, initialData]);

  // Apply theme from document metadata and listen for system preference changes
  useEffect(() => {
    if (!loaded) return;
    applyThemeFromMeta(editor.getTheme(), editor.getLightTheme(), editor.getDarkTheme());

    // Re-apply when system preference changes (for "system" mode)
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const current = editor.getTheme();
      if (current === "system") {
        applyThemeFromMeta(current, editor.getLightTheme(), editor.getDarkTheme());
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [editor, loaded]);

  // Set up auto-save and cross-tab sync after initial load
  useEffect(() => {
    if (!loaded) return;
    const autoSave = new AutoSaveController(editor, provider, { mode: "debounce", delayMs: 500 });
    const unsubExternal = provider.onExternalChange((data) => {
      editor.applyExternalUpdate(data);
      editor.remeasureAllNodes();
    });
    return () => {
      autoSave.dispose();
      unsubExternal();
    };
  }, [editor, provider, loaded]);

  // File status: current filename and transient flash message
  const [filename, setFilename] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ message: string; isError?: boolean } | null>(null);

  // Wire Cmd+S, Cmd+O, Shift+Cmd+E to file/export actions
  useEffect(() => {
    editor.onSave(async () => {
      try {
        const name = await saveToFile(editor, provider);
        setFilename(name);
        setFlash({ message: "Saved" });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // User cancelled the file picker -- not an error
          return;
        }
        console.error("Save failed:", err);
      }
    });
    editor.onSaveAs(async () => {
      try {
        const name = await saveAsToFile(editor, provider);
        setFilename(name);
        setFlash({ message: "Saved" });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Save As failed:", err);
      }
    });
    editor.onOpen(async () => {
      try {
        const name = await openFile(editor, provider);
        setFilename(name);
        // Restore asset blob URLs after loading
        const assets = editor.getAssets();
        if (assets.length > 0) {
          const urls = await provider.loadAssetUrls(assets.map((a) => a.id));
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
    editor.onThemeChange(() => {
      applyThemeFromMeta(editor.getTheme(), editor.getLightTheme(), editor.getDarkTheme());
    });
    editor.onClear(() => {
      clearFileHandle();
      setFilename(null);
    });
    editor.onOpenLink((url) => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }, [editor, provider]);

  // Initialize filename from any previously set file handle
  useEffect(() => {
    setFilename(getCurrentFilename());
  }, [loaded]);

  const clearFlash = useCallback(() => setFlash(null), []);

  useKeyboardHandler(editor);

  const [showKeystrokeOverlay, setShowKeystrokeOverlay] = useState(false);
  useEffect(() => {
    const toggle = () => setShowKeystrokeOverlay((v) => !v);
    window.addEventListener("limn:toggle-keystroke-overlay", toggle);
    return () => window.removeEventListener("limn:toggle-keystroke-overlay", toggle);
  }, []);

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
            provider.saveAsset(assetId, file);
          };
          img.src = blobUrl;
          break;
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [editor, provider]);

  if (!loaded) {
    return <div style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>Loading...</div>;
  }

  return (
    <PersistenceContext.Provider value={provider}>
      <EditorContext.Provider value={editor}>
        <AssetUrlContext.Provider value={assetUrls}>
          <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative" }}>
            <MindMapCanvas />
            <HamburgerMenu keystrokeOverlay={showKeystrokeOverlay} />
            <FileStatusBar filename={filename} flash={flash} onFlashDone={clearFlash} />
            <ToolbarOverlay />
            <KeystrokeOverlay enabled={showKeystrokeOverlay} />
            <UpdateBanner />
          </div>
        </AssetUrlContext.Provider>
      </EditorContext.Provider>
    </PersistenceContext.Provider>
  );
}
