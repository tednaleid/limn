// ABOUTME: PersistenceProvider for the Limn desktop app (macOS WKWebView).
// ABOUTME: Delegates file I/O to Swift via the JS-Swift bridge; assets cached in memory.

import type { PersistenceProvider, MindMapFileFormat } from "@limn/core";
import { migrateToLatest } from "@limn/core";
import { postToSwift, onSwiftMessage } from "./desktop-bridge";
import type { IncomingMessage, LoadFileMessage } from "./desktop-bridge";
import { parseLimnFile } from "./file";

// Pending request state is stored on the global object so it survives
// React StrictMode double-invoking useMemo (which creates two instances,
// but the global handler ends up pointing to the second while React keeps
// the first). By sharing pending state globally, both instances resolve
// correctly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

interface PendingLoad {
  resolve: (result: { data: MindMapFileFormat; filename: string } | null) => void;
}
interface PendingSave {
  resolve: (filename: string | null) => void;
}

function getPendingLoad(): PendingLoad | null {
  return g.limn?.desktop?._pendingLoad ?? null;
}
function setPendingLoad(p: PendingLoad | null): void {
  if (g.limn?.desktop) g.limn.desktop._pendingLoad = p;
}
function getPendingSave(): PendingSave | null {
  return g.limn?.desktop?._pendingSave ?? null;
}
function setPendingSave(p: PendingSave | null): void {
  if (g.limn?.desktop) g.limn.desktop._pendingSave = p;
}
function getExternalChangeCb(): ((data: MindMapFileFormat) => void) | null {
  return g.limn?.desktop?._externalChangeCb ?? null;
}
function setExternalChangeCb(cb: ((data: MindMapFileFormat) => void) | null): void {
  if (g.limn?.desktop) g.limn.desktop._externalChangeCb = cb;
}
function getCurrentFilename(): string | null {
  return g.limn?.desktop?._currentFilename ?? null;
}
function setCurrentFilename(f: string | null): void {
  if (g.limn?.desktop) g.limn.desktop._currentFilename = f;
}

export class DesktopPersistenceProvider implements PersistenceProvider {
  private assetCache = new Map<string, Blob>();
  private assetUrls = new Map<string, string>();
  private unsubBridge: (() => void) | null = null;

  constructor() {
    this.unsubBridge = onSwiftMessage((msg) => this.handleMessage(msg));
  }

  private handleMessage(msg: IncomingMessage): void {
    switch (msg.type) {
      case "loadFile": {
        void this.handleLoadFile(msg).catch((err) => {
          console.error("[desktop] loadFile failed:", err);
          const pending = getPendingLoad();
          if (pending) {
            pending.resolve(null);
            setPendingLoad(null);
          }
        });
        break;
      }
      case "fileSaved": {
        setCurrentFilename(msg.payload.filename);
        const pending = getPendingSave();
        if (pending) {
          pending.resolve(msg.payload.filename);
          setPendingSave(null);
        }
        break;
      }
      case "fileClosed": {
        setCurrentFilename(null);
        break;
      }
    }
  }

  /** Handle a loadFile message from Swift, supporting both JSON and ZIP formats. */
  private async handleLoadFile(msg: LoadFileMessage): Promise<void> {
    let data: MindMapFileFormat;

    if (msg.payload.format === "json") {
      // Plain JSON with optional sidecar assets
      const raw = JSON.parse(msg.payload.data);
      data = migrateToLatest(raw);

      // Load sidecar assets (assetId -> base64)
      if (msg.payload.assets) {
        for (const [assetId, base64] of Object.entries(msg.payload.assets)) {
          const bytes = base64ToBytes(base64);
          const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
          this.assetCache.set(assetId, new Blob([buf]));
        }
      }
    } else {
      // ZIP format (or legacy without format field)
      const bytes = base64ToBytes(msg.payload.data);
      const blob = new Blob([bytes.buffer as ArrayBuffer]);
      const result = await parseLimnFile(blob);
      data = result.data;
      for (const [id, assetBlob] of result.assetBlobs) {
        this.assetCache.set(id, assetBlob);
      }
      // Migrate ZIP assets to sidecar: send each asset to Swift so they
      // get written to the .assets/ directory. The next auto-save will
      // write JSON (not ZIP), completing the migration.
      for (const [id, assetBlob] of result.assetBlobs) {
        void this.saveAsset(id, assetBlob);
      }
    }

    setCurrentFilename(msg.payload.filename);

    const pending = getPendingLoad();
    if (pending) {
      pending.resolve({ data, filename: msg.payload.filename });
      setPendingLoad(null);
    } else {
      // External load (e.g., file opened via Finder while app is running)
      getExternalChangeCb()?.(data);
    }
  }

  get filename(): string | null {
    return getCurrentFilename();
  }

  async load(): Promise<MindMapFileFormat | null> {
    // Desktop app sends loadFile when it has a file to open.
    // If no file is pending, return null (empty canvas).
    return null;
  }

  async save(data: MindMapFileFormat): Promise<void> {
    const json = JSON.stringify(data, null, 2);
    postToSwift({ type: "save", payload: { json } });
  }

  /** Request a file open dialog from Swift. Returns the loaded data or null if cancelled. */
  async requestOpen(): Promise<{ data: MindMapFileFormat; filename: string } | null> {
    return new Promise((resolve) => {
      setPendingLoad({ resolve });
      postToSwift({ type: "requestOpen" });
      // If Swift doesn't respond (user cancelled), we need a timeout
      // to resolve null so the UI doesn't hang. 60s is generous.
      setTimeout(() => {
        const p = getPendingLoad();
        if (p) {
          p.resolve(null);
          setPendingLoad(null);
        }
      }, 60_000);
    });
  }

  /** Request a save-as dialog from Swift. Returns the new filename. */
  async requestSaveAs(data: MindMapFileFormat): Promise<string | null> {
    const json = JSON.stringify(data, null, 2);
    return new Promise((resolve) => {
      setPendingSave({ resolve });
      postToSwift({ type: "requestSaveAs", payload: { json } });
      setTimeout(() => {
        const p = getPendingSave();
        if (p) {
          p.resolve(null);
          setPendingSave(null);
        }
      }, 60_000);
    });
  }

  async saveAsset(assetId: string, blob: Blob): Promise<void> {
    this.assetCache.set(assetId, blob);
    // Write asset to sidecar directory via Swift bridge
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    postToSwift({ type: "saveAsset", payload: { assetId, data: btoa(binary) } });
  }

  async loadAsset(assetId: string): Promise<Blob | undefined> {
    return this.assetCache.get(assetId);
  }

  async loadAssetUrls(assetIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const id of assetIds) {
      // Reuse existing URL if available
      const existing = this.assetUrls.get(id);
      if (existing) {
        result.set(id, existing);
        continue;
      }
      const blob = this.assetCache.get(id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        this.assetUrls.set(id, url);
        result.set(id, url);
      }
    }
    return result;
  }

  /** Signal to Swift that the web view is ready to receive file data. */
  signalReady(): void {
    postToSwift({ type: "ready" });
  }

  onExternalChange(callback: (data: MindMapFileFormat) => void): () => void {
    setExternalChangeCb(callback);
    return () => {
      if (getExternalChangeCb() === callback) setExternalChangeCb(null);
    };
  }

  dispose(): void {
    this.unsubBridge?.();
    this.unsubBridge = null;
    // Revoke all blob URLs
    for (const url of this.assetUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.assetUrls.clear();
    this.assetCache.clear();
  }
}

// -- Helpers --

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

