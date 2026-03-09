// ABOUTME: Tests for DesktopPersistenceProvider message handling and asset caching.
// ABOUTME: Simulates Swift bridge messages to verify persistence behavior.

import { describe, it, expect, afterEach, vi } from "vitest";
import type { MindMapFileFormat } from "@limn/core";

// Ensure globalThis.window exists for the bridge module (node environment)
if (typeof window === "undefined") {
  (globalThis as Record<string, unknown>).window = globalThis;
}

// Provide URL.createObjectURL/revokeObjectURL stubs for node
if (!globalThis.URL.createObjectURL) {
  let counter = 0;
  globalThis.URL.createObjectURL = () => `blob:mock-${++counter}`;
  globalThis.URL.revokeObjectURL = () => {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

const { buildLimnZip } = await import("../persistence/file");
await import("../persistence/desktop-bridge");
const { DesktopPersistenceProvider } = await import("../persistence/desktop-persistence");
import type { IncomingMessage } from "../persistence/desktop-bridge";

const MINIMAL_MAP: MindMapFileFormat = {
  version: 1,
  meta: { id: "test-1", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
  camera: { x: 0, y: 0, zoom: 1 },
  roots: [{ id: "r1", text: "Root", x: 0, y: 0, width: 50, height: 30, children: [] }],
  assets: [],
};

/** Get the onMessage dispatcher installed by desktop-bridge. */
function getDispatcher(): (msg: IncomingMessage) => void {
  return g.limn.desktop.onMessage;
}

/** Build a base64-encoded .limn ZIP from a MindMapFileFormat. */
async function buildBase64Zip(data: MindMapFileFormat, assetBlobs?: Map<string, Blob>): Promise<string> {
  const blob = await buildLimnZip(data, assetBlobs ?? new Map());
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

describe("DesktopPersistenceProvider", () => {
  let provider: InstanceType<typeof DesktopPersistenceProvider>;

  afterEach(() => {
    provider?.dispose();
    delete g.webkit;
  });

  it("load() returns null (desktop loads via messages)", async () => {
    provider = new DesktopPersistenceProvider();
    expect(await provider.load()).toBeNull();
  });

  it("save() sends a save message to Swift", async () => {
    const postMessage = vi.fn();
    g.webkit = { messageHandlers: { limn: { postMessage } } };

    provider = new DesktopPersistenceProvider();
    await provider.save(MINIMAL_MAP);

    expect(postMessage).toHaveBeenCalledTimes(1);
    const msg = postMessage.mock.calls[0]![0];
    expect(msg.type).toBe("save");
    expect(typeof msg.payload.data).toBe("string"); // base64
  });

  it("handles loadFile message and updates filename", async () => {
    provider = new DesktopPersistenceProvider();
    const base64 = await buildBase64Zip(MINIMAL_MAP);
    const dispatch = getDispatcher();

    dispatch({ type: "loadFile", payload: { data: base64, filename: "test.limn" } });

    await vi.waitFor(() => {
      expect(provider.filename).toBe("test.limn");
    });
  });

  it("handles fileSaved message and updates filename", () => {
    provider = new DesktopPersistenceProvider();
    const dispatch = getDispatcher();

    dispatch({ type: "fileSaved", payload: { filename: "saved.limn" } });
    expect(provider.filename).toBe("saved.limn");
  });

  it("handles fileClosed message and clears filename", () => {
    provider = new DesktopPersistenceProvider();
    const dispatch = getDispatcher();

    dispatch({ type: "fileSaved", payload: { filename: "test.limn" } });
    expect(provider.filename).toBe("test.limn");

    dispatch({ type: "fileClosed" });
    expect(provider.filename).toBeNull();
  });

  it("caches assets in memory", async () => {
    provider = new DesktopPersistenceProvider();
    const blob = new Blob(["test image data"], { type: "image/png" });
    await provider.saveAsset("asset-1", blob);

    const loaded = await provider.loadAsset("asset-1");
    expect(loaded).toBeDefined();
    expect(loaded!.size).toBe(blob.size);
  });

  it("generates blob URLs for cached assets", async () => {
    provider = new DesktopPersistenceProvider();
    const blob = new Blob(["test"], { type: "image/png" });
    await provider.saveAsset("a1", blob);

    const urls = await provider.loadAssetUrls(["a1", "missing"]);
    expect(urls.has("a1")).toBe(true);
    expect(urls.get("a1")).toMatch(/^blob:/);
    expect(urls.has("missing")).toBe(false);
  });

  it("reuses existing blob URLs on repeated calls", async () => {
    provider = new DesktopPersistenceProvider();
    const blob = new Blob(["test"], { type: "image/png" });
    await provider.saveAsset("a1", blob);

    const urls1 = await provider.loadAssetUrls(["a1"]);
    const urls2 = await provider.loadAssetUrls(["a1"]);
    expect(urls1.get("a1")).toBe(urls2.get("a1"));
  });

  it("calls external change callback for loadFile without pending request", async () => {
    provider = new DesktopPersistenceProvider();
    const changes: MindMapFileFormat[] = [];
    provider.onExternalChange((data: MindMapFileFormat) => changes.push(data));

    const base64 = await buildBase64Zip(MINIMAL_MAP);
    const dispatch = getDispatcher();

    dispatch({ type: "loadFile", payload: { data: base64, filename: "ext.limn" } });

    await vi.waitFor(() => {
      expect(changes).toHaveLength(1);
    });
    expect(changes[0]!.meta.id).toBe("test-1");
  });

  it("filename survives StrictMode dual-instance (second handler, first reader)", async () => {
    // React StrictMode creates two instances via useMemo. The second instance's
    // onSwiftMessage handler replaces the first's (last-writer-wins). But React
    // keeps the first instance. Filename must be visible from either instance.
    const first = new DesktopPersistenceProvider();
    const second = new DesktopPersistenceProvider(); // replaces global handler
    provider = second; // for cleanup

    const base64 = await buildBase64Zip(MINIMAL_MAP);
    const dispatch = getDispatcher();

    // Dispatch goes through the second instance's handler
    dispatch({ type: "loadFile", payload: { data: base64, filename: "strict.limn" } });

    await vi.waitFor(() => {
      expect(second.filename).toBe("strict.limn");
    });
    // The first instance must also see the filename
    expect(first.filename).toBe("strict.limn");

    first.dispose();
  });

  it("requestOpen resolves with loaded data", async () => {
    const postMessage = vi.fn();
    g.webkit = { messageHandlers: { limn: { postMessage } } };

    provider = new DesktopPersistenceProvider();
    const openPromise = provider.requestOpen();

    expect(postMessage).toHaveBeenCalledWith({ type: "requestOpen" });

    // Simulate Swift responding with a file
    const base64 = await buildBase64Zip(MINIMAL_MAP);
    const dispatch = getDispatcher();
    dispatch({ type: "loadFile", payload: { data: base64, filename: "opened.limn" } });

    const result = await openPromise;
    expect(result).not.toBeNull();
    expect(result!.filename).toBe("opened.limn");
    expect(result!.data.meta.id).toBe("test-1");
  });
});
