// ABOUTME: Tests for the shared image attach helper used by paste and drop.
// ABOUTME: Stubs Image, object URLs, and window so the helper runs in the node test environment.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Editor, stubTextMeasurer } from "@limn/core";
import type { PersistenceProvider } from "@limn/core";

const g = globalThis as Record<string, unknown>;
if (typeof g.window === "undefined") g.window = globalThis;
const win = g.window as Record<string, unknown>;
if (typeof win.dispatchEvent !== "function") win.dispatchEvent = vi.fn();
if (!globalThis.URL.createObjectURL) {
  let counter = 0;
  globalThis.URL.createObjectURL = () => `blob:mock-${++counter}`;
  globalThis.URL.revokeObjectURL = () => {};
}
class FakeImage {
  naturalWidth = 800;
  naturalHeight = 600;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_url: string) {
    queueMicrotask(() => this.onload?.());
  }
}
g.Image = FakeImage;

const { attachImageFile, fitDisplaySize, pastedImageName } = await import("../assets/attachImage");

function fakeProvider(overrides: Partial<PersistenceProvider> = {}): PersistenceProvider {
  return {
    load: () => Promise.resolve(null),
    save: () => Promise.resolve(),
    saveAsset: vi.fn(() => Promise.resolve()),
    loadAsset: () => Promise.resolve(undefined),
    loadAssetUrls: () => Promise.resolve(new Map()),
    onExternalChange: () => () => {},
    dispose: () => {},
    ...overrides,
  };
}

describe("fitDisplaySize", () => {
  it("shrinks wide images to 300 wide keeping the aspect ratio", () => {
    expect(fitDisplaySize(800, 600)).toEqual({ width: 300, height: 225 });
  });
  it("leaves small images alone", () => {
    expect(fitDisplaySize(120, 80)).toEqual({ width: 120, height: 80 });
  });
});

describe("pastedImageName", () => {
  it("uses Obsidian's timestamp style and maps jpeg to jpg", () => {
    const at = new Date(2026, 7, 16, 9, 5, 7);
    expect(pastedImageName("image/png", at)).toBe("Pasted image 20260816090507.png");
    expect(pastedImageName("image/jpeg", at)).toBe("Pasted image 20260816090507.jpg");
    expect(pastedImageName("image/svg+xml", at)).toBe("Pasted image 20260816090507.svg");
  });
});

describe("attachImageFile", () => {
  let editor: Editor;
  const blob = new Blob(["x"], { type: "image/png" });

  beforeEach(() => {
    editor = new Editor(stubTextMeasurer);
    (window.dispatchEvent as ReturnType<typeof vi.fn>).mockClear();
  });

  it("asks the provider for the id when it can import, and attaches at the fitted size", async () => {
    const importAsset = vi.fn(() => Promise.resolve("Pasted image 1.png"));
    const provider = fakeProvider({ importAsset });
    const rootId = editor.addRoot("root", 0, 0);
    editor.exitEditMode();

    await attachImageFile(editor, provider, blob, "Pasted image 1.png", { nodeId: rootId });

    expect(importAsset).toHaveBeenCalledWith("Pasted image 1.png", blob);
    expect(provider.saveAsset).not.toHaveBeenCalled();
    expect(editor.getNode(rootId).image).toEqual({ assetId: "Pasted image 1.png", width: 300, height: 225 });
    expect(editor.getAssets()[0]).toMatchObject({ id: "Pasted image 1.png", width: 800, height: 600, mimeType: "image/png" });
    expect(window.dispatchEvent).toHaveBeenCalledOnce();
  });

  it("falls back to a generated id and saveAsset, and creates a root when there is no target node", async () => {
    const provider = fakeProvider();
    await attachImageFile(editor, provider, blob, "photo.png", { x: 40, y: 50 });

    const roots = editor.getRoots();
    expect(roots).toHaveLength(1);
    const root = roots[0]!;
    expect(root.image?.assetId).toMatch(/^a\d+$/);
    expect(provider.saveAsset).toHaveBeenCalledWith(root.image?.assetId, blob);
    expect(editor.isEditing()).toBe(false);
  });
});
