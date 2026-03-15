// ABOUTME: Tests for ObsidianPersistenceProvider in-memory asset caching.
// ABOUTME: Verifies save triggers ZIP write, asset cache operations, and cleanup.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObsidianPersistenceProvider } from "../ObsidianPersistenceProvider";
import { MockVault, MockTFile, createTestMap } from "./mocks/obsidian";

function createMockView(filePath: string) {
  const vault = new MockVault();
  const file = new MockTFile(filePath);
  const view = {
    file,
    app: { vault },
    saveToDisk: vi.fn().mockResolvedValue(undefined),
  };
  return { view, vault };
}

describe("ObsidianPersistenceProvider", () => {
  let provider: ObsidianPersistenceProvider;
  let view: ReturnType<typeof createMockView>["view"];
  let vault: MockVault;

  beforeEach(() => {
    ({ view, vault } = createMockView("notes/My Map.limn"));
    provider = new ObsidianPersistenceProvider(view as never);
  });

  describe("load", () => {
    it("returns null (FileView handles loading)", async () => {
      const result = await provider.load();
      expect(result).toBeNull();
    });
  });

  describe("save", () => {
    it("calls saveToDisk on the view", async () => {
      const data = createTestMap();
      await provider.save(data);
      expect(view.saveToDisk).toHaveBeenCalledOnce();
    });
  });

  describe("asset storage (in-memory cache)", () => {
    it("saves and loads a binary asset from cache", async () => {
      const content = new TextEncoder().encode("image data").buffer;
      const blob = new Blob([content], { type: "image/png" });

      await provider.saveAsset("img1", blob);
      const loaded = await provider.loadAsset("img1");

      expect(loaded).toBeInstanceOf(Blob);
      const loadedBuffer = await loaded!.arrayBuffer();
      expect(new Uint8Array(loadedBuffer)).toEqual(new Uint8Array(content as ArrayBuffer));
    });

    it("does not write assets to the vault adapter", async () => {
      const blob = new Blob(["data"]);
      await provider.saveAsset("img1", blob);

      // Assets live in memory, not on disk
      const files = vault.adapter.getFiles();
      expect(files.size).toBe(0);
    });

    it("returns undefined for missing assets", async () => {
      const result = await provider.loadAsset("nonexistent");
      expect(result).toBeUndefined();
    });

    it("loads asset URLs as blob URLs", async () => {
      const blob = new Blob(["data"], { type: "image/png" });
      await provider.saveAsset("img1", blob);
      await provider.saveAsset("img2", blob);

      const urls = await provider.loadAssetUrls(["img1", "img2", "missing"]);
      expect(urls.size).toBe(2);
      expect(urls.has("img1")).toBe(true);
      expect(urls.has("img2")).toBe(true);
      expect(urls.has("missing")).toBe(false);
      expect(urls.get("img1")!.startsWith("blob:")).toBe(true);
    });
  });

  describe("bulk asset operations", () => {
    it("setAssetBlobs populates the cache", async () => {
      const blobs = new Map([
        ["a1", new Blob(["img1"])],
        ["a2", new Blob(["img2"])],
      ]);
      provider.setAssetBlobs(blobs);

      expect(await provider.loadAsset("a1")).toBeDefined();
      expect(await provider.loadAsset("a2")).toBeDefined();
    });

    it("getAssetBlobs returns the cache", async () => {
      await provider.saveAsset("a1", new Blob(["test"]));
      const cache = provider.getAssetBlobs();
      expect(cache.has("a1")).toBe(true);
    });
  });

  describe("external change handling", () => {
    it("onExternalChange returns a no-op unsubscribe", () => {
      const callback = vi.fn();
      const unsub = provider.onExternalChange(callback);
      expect(typeof unsub).toBe("function");
      unsub(); // should not throw
    });
  });

  describe("dispose", () => {
    it("clears asset cache", () => {
      provider.saveAsset("a1", new Blob(["test"]));
      provider.dispose();
      expect(provider.getAssetBlobs().size).toBe(0);
    });

    it("does not throw", () => {
      expect(() => provider.dispose()).not.toThrow();
    });
  });
});
