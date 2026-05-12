// ABOUTME: Root React component for Limn.
// ABOUTME: Hosts the SVG canvas with a demo mind map.

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Editor, AutoSaveController, compressToUrl, prepareForShare, MAX_SHARE_URL_LENGTH } from "@limn/core";
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
import { DesktopPersistenceProvider } from "./persistence/desktop-persistence";
import { isDesktop, postToSwift } from "./persistence/desktop-bridge";
import { saveToFile, saveAsToFile, openFile, clearFileHandle, getCurrentFilename } from "./persistence/file";
import { exportSvg, serializeSvg } from "./export/svg";
import { domTextMeasurer } from "./text/DomTextMeasurer";
import { applyThemeFromMeta } from "./theme/themes";
import { limnWindow } from "./limn-window";

const DEMO_MAP: MindMapFileFormat = {
  version: 1,
  meta: { id: "demo", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "dracula" },
  camera: { x: 92.8, y: 800.1, zoom: 1 },
  roots: [
    {
      id: "r1",
      text: "Limn",
      x: 0,
      y: 0,
      width: 65,
      height: 42,
      style: { colorIndex: 0 },
      children: [
        {
          id: "r1c1",
          text: "Keyboard First",
          x: 215,
          y: -177,
          width: 118,
          height: 32,
          style: { colorIndex: 7 },
          children: [
            { id: "r1c1g1", text: "**Arrow keys** or `hjkl`\nto navigate between nodes", x: 483, y: -339.5, width: 199, height: 53, children: [] },
            {
              id: "r1c1g2",
              text: "`Tab` to add a child\n`Shift+Enter` for a sibling",
              x: 483,
              y: -266.5,
              width: 197,
              height: 53,
              collapsed: true,
              children: [
                { id: "n7", text: "new child", x: 830, y: -282, width: 86, height: 32, children: [] },
                { id: "n8", text: "sibling", x: 830, y: -230, width: 67, height: 32, children: [] },
              ],
            },
            { id: "r1c1g2b", text: "With a node selected,\n`Enter` to edit its contents", x: 483, y: -193.5, width: 192, height: 53, children: [] },
            {
              id: "r1c1g3",
              text: "`Space` to collapse/expand",
              x: 483,
              y: -120.5,
              width: 192,
              height: 33,
              collapsed: true,
              children: [
                { id: "r1c1g3a", text: "`Shift+Enter` inserts a\nnewline within a node", x: 825, y: -193, width: 176, height: 53, children: [] },
                { id: "r1c1g3b", text: "`r` reflows children\nto computed positions", x: 825, y: -120, width: 169, height: 53, children: [] },
              ],
            },
            { id: "r1c1g4", text: "Press `?` for all shortcuts", x: 483, y: -67.5, width: 178, height: 33, children: [] },
            { id: "n18", text: "Press `m` to access the menu", x: 483, y: -14.5, width: 203, height: 33, children: [] },
          ],
        },
        {
          id: "r1c2",
          text: "Inline *Markdown*",
          x: 215,
          y: 37.5,
          width: 130,
          height: 32,
          collapsed: true,
          children: [
            { id: "r1c2g1", text: "**bold** and *italic*", x: 495, y: -41.5, width: 117, height: 32, children: [] },
            { id: "r1c2g2", text: "~~strikethrough~~ and `inline code`", x: 495, y: 10.5, width: 235, height: 33, children: [] },
            { id: "r1c2g3", text: "***bold italic*** combined", x: 495, y: 62.5, width: 160, height: 32, children: [] },
            { id: "r1c2g4", text: "Link to [Limn on GitHub](https://github.com/tednaleid/limn)\n`Cmd+Click` to open", x: 495, y: 125.5, width: 172, height: 53, children: [] },
          ],
        },
        {
          id: "r1c3",
          text: "EasyMotion",
          x: 215,
          y: 89.5,
          width: 99,
          height: 32,
          collapsed: true,
          children: [
            { id: "r1c3g1", text: "Press `;` to label\nevery visible node", x: 464, y: 52.5, width: 141, height: 53, children: [] },
            { id: "r1c3g2", text: "Type the label\nto jump instantly", x: 464, y: 126.5, width: 132, height: 52, children: [] },
          ],
        },
        {
          id: "r1c4",
          text: "Organize & Restructure",
          x: 215,
          y: 141.5,
          width: 176,
          height: 32,
          collapsed: true,
          children: [
            { id: "r1c4g1", text: "Drag a node onto another\nto reparent it", x: 541, y: 58.5, width: 190, height: 52, children: [] },
            { id: "r1c4g2", text: "`Alt+Arrows` to reorder\nor indent/outdent", x: 541, y: 130.5, width: 177, height: 53, children: [] },
            { id: "r1c4g3", text: "`Alt+;` to reparent\nvia EasyMotion labels", x: 541, y: 203.5, width: 163, height: 53, children: [] },
          ],
        },
        {
          id: "r1c5",
          text: "Multiple Roots",
          x: 215,
          y: 193.5,
          width: 117,
          height: 32,
          collapsed: true,
          children: [
            {
              id: "r1c5g1",
              text: "To create a new root node",
              x: 482,
              y: 193.5,
              width: 193,
              height: 32,
              children: [
                { id: "r1c5g1a", text: "Double-click canvas or\npress `Enter` with nothing selected", x: 825, y: 193.5, width: 249, height: 53, children: [] },
              ],
            },
          ],
        },
        {
          id: "r1c6",
          text: "Themes & Export",
          x: 215,
          y: 245.5,
          width: 136,
          height: 32,
          collapsed: true,
          children: [
            { id: "r1c6g1", text: "8 built-in color themes", x: 501, y: 68.5, width: 171, height: 32, children: [] },
            { id: "r1c6g2", text: "`Cmd+S` to save\n`Cmd+Shift+E` to export SVG", x: 501, y: 120.5, width: 211, height: 53, children: [] },
            { id: "r1c6g3", text: "Works offline as a\nProgressive Web App (PWA)", x: 501, y: 193.5, width: 208, height: 52, children: [] },
            {
              id: "r1c6g4",
              text: "All storage is local",
              x: 501,
              y: 291.5,
              width: 142,
              height: 32,
              children: [
                { id: "r1c6g4a", text: "Nothing is sent to the cloud", x: 793, y: 265.5, width: 203, height: 32, children: [] },
                { id: "r1c6g4b", text: "Your information is kept private", x: 793, y: 317.5, width: 226, height: 32, children: [] },
              ],
            },
            {
              id: "n11",
              text: "branches can be different colors",
              x: 501,
              y: 396,
              width: 234,
              height: 32,
              style: { colorIndex: 1 },
              children: [
                { id: "n12", text: "just press `c` to rotate through colors", x: 885, y: 369.5, width: 257, height: 33, style: { colorIndex: 2 }, children: [] },
                { id: "n13", text: "`shift-c` chooses colors in reverse order", x: 885, y: 421.5, width: 291, height: 33, style: { colorIndex: 0 }, children: [] },
              ],
            },
          ],
        },
        {
          id: "r1c7",
          text: "Obsidian Plugin",
          x: 215,
          y: 297.5,
          width: 125,
          height: 32,
          collapsed: true,
          children: [
            { id: "r1c7g1", text: "Open .limn files natively\nin Obsidian", x: 490, y: 287.5, width: 178, height: 52, children: [] },
          ],
        },
        {
          id: "n14",
          text: "Native Mac App",
          x: 215,
          y: 349.5,
          width: 127,
          height: 32,
          collapsed: true,
          children: [
            { id: "n15", text: "Written in Swift", x: 492, y: 323.5, width: 123, height: 32, children: [] },
            { id: "n16", text: "Registers `.limn` with MacOS", x: 492, y: 375.5, width: 213, height: 33, children: [] },
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
  const desktop = useMemo(() => isDesktop(), []);

  // Expose editor helpers on window.limn for debug inspection and Swift bridge
  useEffect(() => {
    if (!limnWindow.limn) limnWindow.limn = {};
    const api = limnWindow.limn;
    api.toJSON = () => editor.toJSON();
    api.hasUnsavedChanges = () => editor.hasUnsavedChanges();
    return () => { delete api.toJSON; delete api.hasUnsavedChanges; };
  }, [editor]);
  const provider = useMemo(
    () => desktop ? new DesktopPersistenceProvider() : new WebPersistenceProvider(docId),
    [docId, desktop],
  );
  const [loaded, setLoaded] = useState(false);

  // Load from initialData (shared URL), provider (IndexedDB), or fall back to demo map
  useEffect(() => {
    if (initialData) {
      editor.loadJSON(initialData);
      editor.remeasureAllNodes();
      setLoaded(true);
      return;
    }

    void provider.load().then(async (saved) => {
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
  const autoSaveRef = useRef<AutoSaveController | null>(null);
  useEffect(() => {
    if (!loaded) return;
    const autoSave = new AutoSaveController(editor, provider, { mode: "debounce", delayMs: 500 });
    autoSaveRef.current = autoSave;
    if (!limnWindow.limn) limnWindow.limn = {};
    const api = limnWindow.limn;
    api.flush = () => autoSave.flush();
    const unsubExternal = provider.onExternalChange((data) => {
      editor.applyExternalUpdate(data);
      editor.remeasureAllNodes();
      // Load asset blob URLs (e.g., images from sidecar on desktop session restore)
      const assets = editor.getAssets();
      if (assets.length > 0) {
        void provider.loadAssetUrls(assets.map((a) => a.id)).then((urls) => {
          if (urls.size > 0) setAssetUrls(urls);
        });
      }
    });
    // Tell Swift the web view is ready to receive files (cold-start buffering)
    if (desktop) {
      (provider as DesktopPersistenceProvider).signalReady();
    }
    return () => {
      autoSaveRef.current = null;
      delete api.flush;
      autoSave.dispose();
      unsubExternal();
    };
  }, [editor, provider, loaded, desktop]);

  // File status: current filename and transient flash message
  const [filename, setFilename] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ message: string; isError?: boolean } | null>(null);

  // Wire Cmd+S, Cmd+O, Shift+Cmd+E to file/export actions
  useEffect(() => {
    if (desktop) {
      const dp = provider as DesktopPersistenceProvider;
      editor.onSave(() => {
        if (dp.filename) {
          void dp.save(editor.toJSON()).then(() => {
            editor.markSaved();
            setFilename(dp.filename);
            setFlash({ message: "Saved" });
          });
        } else {
          // Untitled document -- Cmd-S triggers Save As dialog
          void dp.requestSaveAs(editor.toJSON()).then((name) => {
            if (name) {
              editor.markSaved();
              setFilename(name);
              setFlash({ message: "Saved" });
            }
          });
        }
      });
      editor.onSaveAs(() => {
        void dp.requestSaveAs(editor.toJSON()).then((name) => {
          if (name) {
            editor.markSaved();
            setFilename(name);
            setFlash({ message: "Saved" });
          }
        });
      });
      editor.onOpen(() => {
        void dp.requestOpen().then(async (result) => {
          if (!result) return;
          editor.loadJSON(result.data);
          editor.remeasureAllNodes();
          setFilename(result.filename);
          const assets = editor.getAssets();
          if (assets.length > 0) {
            const urls = await dp.loadAssetUrls(assets.map((a) => a.id));
            if (urls.size > 0) setAssetUrls(urls);
          }
        });
      });
    } else {
      editor.onSave(() => {
        void (async () => {
          try {
            const name = await saveToFile(editor, provider);
            editor.markSaved();
            setFilename(name);
            setFlash({ message: "Saved" });
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
              // User cancelled the file picker -- not an error
              return;
            }
            console.error("Save failed:", err);
          }
        })();
      });
      editor.onSaveAs(() => {
        void (async () => {
          try {
            const name = await saveAsToFile(editor, provider);
            editor.markSaved();
            setFilename(name);
            setFlash({ message: "Saved" });
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            console.error("Save As failed:", err);
          }
        })();
      });
      editor.onOpen(() => {
        void (async () => {
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
        })();
      });
    }
    editor.onExport(() => {
      const bounds = editor.getContentBounds();
      if (desktop) {
        void (async () => {
          const svgString = await serializeSvg(bounds);
          if (svgString) {
            postToSwift({ type: "exportSvg", payload: { data: btoa(svgString) } });
          }
        })();
      } else {
        void exportSvg(bounds);
      }
    });
    editor.onThemeChange(() => {
      applyThemeFromMeta(editor.getTheme(), editor.getLightTheme(), editor.getDarkTheme());
    });
    editor.onClear(() => {
      if (!desktop) clearFileHandle();
      setFilename(null);
    });
    editor.onOpenLink((url) => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
    if (!desktop) {
      editor.onShare(() => {
        void (async () => {
          const data = prepareForShare(editor.toJSON());
          const compressed = compressToUrl(data);
          const shareUrl = window.location.origin + window.location.pathname + "#data=" + compressed;
          if (shareUrl.length > MAX_SHARE_URL_LENGTH) {
            setFlash({ message: "Map too large to share as URL", isError: true });
            return;
          }
          try {
            await navigator.clipboard.writeText(shareUrl);
            const hasImages = editor.getAssets().length > 0;
            setFlash({ message: hasImages ? "Share link copied (without images)" : "Share link copied" });
          } catch {
            setFlash({ message: "Failed to copy link", isError: true });
          }
        })();
      });
    }
  }, [editor, provider]);

  // Initialize filename from any previously set file handle
  useEffect(() => {
    if (desktop) {
      setFilename((provider as DesktopPersistenceProvider).filename);
    } else {
      setFilename(getCurrentFilename());
    }
  }, [loaded, desktop, provider]);

  // Flush pending auto-save and warn about unsaved new documents on close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Flush any debounced auto-save so the last 500ms of edits aren't lost
      void autoSaveRef.current?.flush();

      // Warn about unsaved new (untitled) documents
      const hasFile = desktop
        ? (provider as DesktopPersistenceProvider).filename !== null
        : getCurrentFilename() !== null;
      if (!hasFile && editor.hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [editor, provider, desktop]);

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
            void provider.saveAsset(assetId, file);
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
            <HamburgerMenu keystrokeOverlay={showKeystrokeOverlay} showShare={!desktop} />
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
