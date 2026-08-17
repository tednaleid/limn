// ABOUTME: Tests for ObsidianOutlineAssetProvider against a fake vault, metadata cache, and file manager.
// ABOUTME: Covers importAsset link text, resource URL lookup, blob loading, and unknown ids.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { App } from "obsidian";
import { ObsidianOutlineAssetProvider } from "../markdown/ObsidianOutlineAssetProvider";

interface FakeFile { path: string; name: string; bytes: ArrayBuffer }

function fakeApp() {
  const files = new Map<string, FakeFile>();
  const app = {
    fileManager: {
      getAvailablePathForAttachment: vi.fn((filename: string) => Promise.resolve(`attachments/${filename}`)),
    },
    vault: {
      createBinary: vi.fn((path: string, bytes: ArrayBuffer) => {
        const file: FakeFile = { path, name: path.split("/").pop() ?? path, bytes };
        files.set(path, file);
        return Promise.resolve(file);
      }),
      readBinary: vi.fn((file: FakeFile) => Promise.resolve(file.bytes)),
      getResourcePath: vi.fn((file: FakeFile) => `app://vault/${file.path}`),
    },
    metadataCache: {
      fileToLinktext: vi.fn((file: FakeFile) => file.name),
      getFirstLinkpathDest: vi.fn((link: string) =>
        [...files.values()].find((f) => f.name === link || f.path === link) ?? null),
    },
  };
  return { app: app as unknown as App, files };
}

describe("ObsidianOutlineAssetProvider", () => {
  let app: App;
  let files: Map<string, FakeFile>;
  let provider: ObsidianOutlineAssetProvider;

  beforeEach(() => {
    ({ app, files } = fakeApp());
    provider = new ObsidianOutlineAssetProvider(app, () => "notes/plan.md");
  });

  it("importAsset writes the attachment next to the note and returns its link text", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const id = await provider.importAsset("Pasted image 1.png", blob);
    expect(id).toBe("Pasted image 1.png");
    expect(app.fileManager.getAvailablePathForAttachment).toHaveBeenCalledWith("Pasted image 1.png", "notes/plan.md");
    expect(files.get("attachments/Pasted image 1.png")?.bytes.byteLength).toBe(3);
    expect(app.metadataCache.fileToLinktext).toHaveBeenCalledWith(files.get("attachments/Pasted image 1.png"), "notes/plan.md");
  });

  it("loadAssetUrls resolves link texts through the metadata cache and skips unknown ones", async () => {
    await provider.importAsset("pic.png", new Blob([new Uint8Array([9])]));
    const urls = await provider.loadAssetUrls(["pic.png", "missing.png"]);
    expect(urls).toEqual(new Map([["pic.png", "app://vault/attachments/pic.png"]]));
    expect(app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith("pic.png", "notes/plan.md");
  });

  it("loadAsset returns the file bytes as a Blob with a guessed mime type", async () => {
    await provider.importAsset("photo.jpg", new Blob([new Uint8Array([7, 7])]));
    const blob = await provider.loadAsset("photo.jpg");
    expect(blob?.type).toBe("image/jpeg");
    expect(blob?.size).toBe(2);
    expect(await provider.loadAsset("nope.png")).toBeUndefined();
  });

  it("load and save are no-ops", async () => {
    expect(await provider.load()).toBeNull();
    await expect(provider.save()).resolves.toBeUndefined();
  });

  it("saveAsset rejects instead of writing a file: outlines choose their attachment name through importAsset", async () => {
    await expect(provider.saveAsset("a1", new Blob([new Uint8Array([1])]))).rejects.toThrow(/importAsset/);
    expect(app.vault.createBinary).not.toHaveBeenCalled();
  });
});
