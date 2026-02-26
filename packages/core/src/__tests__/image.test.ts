// ABOUTME: Tests for image/asset management on nodes.
// ABOUTME: Covers setNodeImage, removeNodeImage, asset registry, and serialization round-trip.

import { describe, it, expect, beforeEach } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import { resetIdCounter } from "../store/MindMapStore";
import type { Asset } from "../model/types";

function makeAsset(id: string): Asset {
  return {
    id,
    filename: `${id}.png`,
    mimeType: "image/png",
    width: 800,
    height: 600,
  };
}

describe("image support", () => {
  beforeEach(() => {
    resetIdCounter();
  });

  it("should attach an image to a node", () => {
    const editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.exitEditMode();

    const asset = makeAsset("a1");
    editor.setNodeImage("n0", asset, 400, 300);

    const node = editor.getNode("n0");
    expect(node.image).toEqual({ assetId: "a1", width: 400, height: 300 });
  });

  it("should register the asset in the asset list", () => {
    const editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.exitEditMode();

    const asset = makeAsset("a1");
    editor.setNodeImage("n0", asset, 400, 300);

    expect(editor.getAssets()).toHaveLength(1);
    expect(editor.getAssets()[0].id).toBe("a1");
  });

  it("should not duplicate assets when setting same image on multiple nodes", () => {
    const editor = new TestEditor();
    editor.addRoot("root1", 0, 0);
    editor.exitEditMode();
    editor.addRoot("root2", 0, 200);
    editor.exitEditMode();

    const asset = makeAsset("a1");
    editor.setNodeImage("n0", asset, 400, 300);
    editor.setNodeImage("n1", asset, 200, 150);

    expect(editor.getAssets()).toHaveLength(1);
  });

  it("should remove an image from a node", () => {
    const editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.exitEditMode();

    const asset = makeAsset("a1");
    editor.setNodeImage("n0", asset, 400, 300);
    expect(editor.getNode("n0").image).toBeDefined();

    editor.removeNodeImage("n0");
    expect(editor.getNode("n0").image).toBeUndefined();
  });

  it("should be undoable (setNodeImage)", () => {
    const editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.exitEditMode();

    const asset = makeAsset("a1");
    editor.setNodeImage("n0", asset, 400, 300);
    expect(editor.getNode("n0").image).toBeDefined();

    editor.undo();
    expect(editor.getNode("n0").image).toBeUndefined();
  });

  it("should be undoable (removeNodeImage)", () => {
    const editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.exitEditMode();

    const asset = makeAsset("a1");
    editor.setNodeImage("n0", asset, 400, 300);
    editor.removeNodeImage("n0");
    expect(editor.getNode("n0").image).toBeUndefined();

    editor.undo();
    expect(editor.getNode("n0").image).toBeDefined();
    expect(editor.getNode("n0").image!.assetId).toBe("a1");
  });

  it("should round-trip images through serialization", () => {
    const editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.exitEditMode();

    const asset = makeAsset("a1");
    editor.setNodeImage("n0", asset, 400, 300);

    const json = editor.toJSON();
    expect(json.assets).toHaveLength(1);
    expect(json.assets[0].id).toBe("a1");
    expect(json.roots[0].image).toEqual({ assetId: "a1", width: 400, height: 300 });

    // Load into a new editor
    const editor2 = new TestEditor();
    editor2.loadJSON(json);

    expect(editor2.getNode("n0").image).toEqual({ assetId: "a1", width: 400, height: 300 });
    expect(editor2.getAssets()).toHaveLength(1);
  });

  it("should replace an existing image on a node", () => {
    const editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.exitEditMode();

    editor.setNodeImage("n0", makeAsset("a1"), 400, 300);
    editor.setNodeImage("n0", makeAsset("a2"), 200, 150);

    expect(editor.getNode("n0").image!.assetId).toBe("a2");
    // Both assets should be registered
    expect(editor.getAssets()).toHaveLength(2);
  });
});

describe("image resize", () => {
  beforeEach(() => {
    resetIdCounter();
  });

  function createNodeWithImage(): TestEditor {
    const editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.exitEditMode();
    editor.setNodeImage("n0", makeAsset("a1"), 400, 300);
    return editor;
  }

  it("should start and end an image resize", () => {
    const editor = createNodeWithImage();
    editor.startImageResize("n0");
    expect(editor.isResizingImage()).toBe(true);
    editor.endImageResize();
    expect(editor.isResizingImage()).toBe(false);
  });

  it("should scale image proportionally during resize", () => {
    const editor = createNodeWithImage();
    // Original image: 400x300 (4:3 aspect ratio)
    editor.startImageResize("n0");
    editor.updateImageResize(200);
    editor.endImageResize();

    const image = editor.getNode("n0").image!;
    expect(image.width).toBe(200);
    expect(image.height).toBe(150); // 200 * (300/400)
  });

  it("should enforce minimum image width of 40px", () => {
    const editor = createNodeWithImage();
    editor.startImageResize("n0");
    editor.updateImageResize(10);
    editor.endImageResize();

    expect(editor.getNode("n0").image!.width).toBe(40);
  });

  it("should be undoable as a single operation", () => {
    const editor = createNodeWithImage();
    const originalWidth = editor.getNode("n0").image!.width;
    const originalHeight = editor.getNode("n0").image!.height;

    editor.startImageResize("n0");
    editor.updateImageResize(200);
    editor.updateImageResize(100);
    editor.endImageResize();

    expect(editor.getNode("n0").image!.width).toBe(100);

    editor.undo();
    expect(editor.getNode("n0").image!.width).toBe(originalWidth);
    expect(editor.getNode("n0").image!.height).toBe(originalHeight);
  });

  it("should not create undo entry for no-op resize", () => {
    const editor = createNodeWithImage();
    const originalWidth = editor.getNode("n0").image!.width;

    // Do a real resize first
    editor.startImageResize("n0");
    editor.updateImageResize(200);
    editor.endImageResize();

    // No-op resize
    editor.startImageResize("n0");
    editor.endImageResize();

    // Undo should revert the real resize
    editor.undo();
    expect(editor.getNode("n0").image!.width).toBe(originalWidth);
  });
});
