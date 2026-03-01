// ABOUTME: Tests for ObsidianPersistenceProvider vault-based persistence.
// ABOUTME: Verifies save/load round-trips, asset storage, and asset path construction.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObsidianPersistenceProvider } from "../ObsidianPersistenceProvider";
import { MockVault, MockTFile, createTestMap } from "./mocks/obsidian";

function createMockView(filePath: string) {
  const vault = new MockVault();
  const file = new MockTFile(filePath);
  const view = {
    file,
    app: { vault },
    requestSave: vi.fn(),
  };
  return { view, vault };
}

describe("ObsidianPersistenceProvider", () => {
  let provider: ObsidianPersistenceProvider;
  let view: ReturnType<typeof createMockView>["view"];
  let vault: MockVault;

  beforeEach(() => {
    ({ view, vault } = createMockView("notes/My Map.limn"));
    // Cast is safe because tests only exercise the fields/methods we mock
    provider = new ObsidianPersistenceProvider(view as never);
  });

  describe("load", () => {
    it("returns null (TextFileView handles loading)", async () => {
      const result = await provider.load();
      expect(result).toBeNull();
    });
  });

  describe("save", () => {
    it("calls requestSave on the view", async () => {
      const data = createTestMap();
      await provider.save(data);
      expect(view.requestSave).toHaveBeenCalledOnce();
    });
  });

  describe("asset storage", () => {
    it("saves and loads a binary asset", async () => {
      const content = new TextEncoder().encode("image data").buffer;
      const blob = new Blob([content], { type: "image/png" });

      await provider.saveAsset("img1", blob);
      const loaded = await provider.loadAsset("img1");

      expect(loaded).toBeInstanceOf(Blob);
      const loadedBuffer = await loaded!.arrayBuffer();
      expect(new Uint8Array(loadedBuffer)).toEqual(new Uint8Array(content as ArrayBuffer));
    });

    it("stores assets in the sidecar .assets/ folder", async () => {
      const blob = new Blob(["data"]);
      await provider.saveAsset("img1", blob);

      const files = vault.adapter.getFiles();
      expect(files.has("notes/My Map.assets/img1")).toBe(true);
    });

    it("creates the assets folder if it does not exist", async () => {
      const blob = new Blob(["data"]);
      await provider.saveAsset("img1", blob);

      // Verify the folder was created in the vault
      expect(vault.getAbstractFileByPath("notes/My Map.assets")).not.toBeNull();
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
      // blob: URLs start with "blob:"
      expect(urls.get("img1")!.startsWith("blob:")).toBe(true);
    });
  });

  describe("asset path construction", () => {
    it("uses file basename for the sidecar folder", async () => {
      const { view: v } = createMockView("docs/project/design.limn");
      const p = new ObsidianPersistenceProvider(v as never);
      const blob = new Blob(["x"]);
      await p.saveAsset("a1", blob);
      const files = (v.app.vault as MockVault).adapter.getFiles();
      expect(files.has("docs/project/design.assets/a1")).toBe(true);
    });

    it("handles root-level files (no parent directory)", () => {
      const { view: v, vault: vlt } = createMockView("notes.limn");
      // Root-level file has parent.path = ""
      v.file.parent = { path: "" };
      const p = new ObsidianPersistenceProvider(v as never);
      const blob = new Blob(["x"]);
      return p.saveAsset("a1", blob).then(() => {
        const files = vlt.adapter.getFiles();
        expect(files.has("notes.assets/a1")).toBe(true);
      });
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
    it("does not throw", () => {
      expect(() => provider.dispose()).not.toThrow();
    });
  });
});
