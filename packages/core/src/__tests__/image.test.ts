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

  it("should include image height in node height", () => {
    const editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.exitEditMode();

    const heightBefore = editor.getNode("n0").height;
    const asset = makeAsset("a1");
    editor.setNodeImage("n0", asset, 400, 300);

    const heightAfter = editor.getNode("n0").height;
    expect(heightAfter).toBe(heightBefore + 300 + 10); // image height + bottom padding
  });

  it("should expand node width to fit image when image is wider than text", () => {
    const editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.exitEditMode();

    const textWidth = editor.getNode("n0").width;
    const asset = makeAsset("a1");
    // Image at 400px wide needs 400 + 2*10 padding = 420, much wider than text
    editor.setNodeImage("n0", asset, 400, 300);

    expect(editor.getNode("n0").width).toBe(400 + 20); // image width + 2 * IMAGE_PADDING_X
    expect(editor.getNode("n0").width).toBeGreaterThan(textWidth);
  });

  it("should keep text width when text is wider than image", () => {
    const editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.exitEditMode();

    const textWidth = editor.getNode("n0").width;
    const asset = makeAsset("a1");
    // Image at 20px wide needs 20 + 20 padding = 40, narrower than text width
    editor.setNodeImage("n0", asset, 20, 15);

    expect(editor.getNode("n0").width).toBe(textWidth);
  });

  it("should remove image height when image is removed", () => {
    const editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.exitEditMode();

    const heightBefore = editor.getNode("n0").height;
    const asset = makeAsset("a1");
    editor.setNodeImage("n0", asset, 400, 300);
    editor.removeNodeImage("n0");

    expect(editor.getNode("n0").height).toBe(heightBefore);
  });

  it("should register the asset in the asset list", () => {
    const editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.exitEditMode();

    const asset = makeAsset("a1");
    editor.setNodeImage("n0", asset, 400, 300);

    expect(editor.getAssets()).toHaveLength(1);
    expect(editor.getAssets()[0]!.id).toBe("a1");
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
    expect(json.assets[0]!.id).toBe("a1");
    expect(json.roots[0]!.image).toEqual({ assetId: "a1", width: 400, height: 300 });

    // Load into a new editor
    const editor2 = new TestEditor();
    editor2.loadJSON(json);

    expect(editor2.getNode("n0").image).toEqual({ assetId: "a1", width: 400, height: 300 });
    expect(editor2.getAssets()).toHaveLength(1);
  });

  it("should not auto-delete empty node that has an image", () => {
    const editor = new TestEditor();
    const rootId = editor.addRoot("", 0, 0);
    // Set image while still in edit mode (empty text)
    editor.setNodeImage(rootId, makeAsset("a1"), 400, 300);
    editor.exitEditMode();

    // Node should survive because it has an image
    const node = editor.getNode(rootId);
    expect(node.image).toBeDefined();
    expect(node.text).toBe("");
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

  it("should update node width after image resize", () => {
    const editor = createNodeWithImage();
    // Original image: 400x300, node width should be 400+20=420
    expect(editor.getNode("n0").width).toBe(420);

    editor.startImageResize("n0");
    editor.updateImageResize(200);
    editor.endImageResize();

    // After resize to 200px wide, node width should be 200+20=220
    expect(editor.getNode("n0").width).toBe(220);
  });

  it("should clear width constraint when image is resized", () => {
    const editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.exitEditMode();

    // Drag node wider, then add image
    editor.startWidthResize("n0");
    editor.updateWidthResize(500);
    editor.endWidthResize();
    expect(editor.getNode("n0").widthConstrained).toBe(true);

    editor.setNodeImage("n0", makeAsset("a1"), 400, 300);
    expect(editor.getNode("n0").width).toBe(500); // constrained width still wider

    // Resize image smaller — node should shrink to follow image, not stay at 500
    editor.startImageResize("n0");
    editor.updateImageResize(200);
    editor.endImageResize();

    expect(editor.getNode("n0").widthConstrained).toBe(false);
    expect(editor.getNode("n0").width).toBe(220); // 200 + 2*10
  });

  it("should relayout children after image resize", () => {
    const editor = createNodeWithImage();
    // Add a child
    const childId = editor.addChild("n0", "child");
    editor.exitEditMode();

    const childXBefore = editor.getNode(childId).x;

    // Resize image significantly smaller
    editor.startImageResize("n0");
    editor.updateImageResize(100);
    editor.endImageResize();

    // Child x should have changed because parent width changed
    expect(editor.getNode(childId).x).not.toBe(childXBefore);
  });
});

describe("image width with constrained nodes", () => {
  beforeEach(() => {
    resetIdCounter();
  });

  it("should expand width-constrained node to fit image", () => {
    const editor = new TestEditor();
    editor.addRoot("root", 0, 0);
    editor.exitEditMode();

    // Set a narrow constrained width via width resize
    editor.startWidthResize("n0");
    editor.updateWidthResize(80);
    editor.endWidthResize();
    expect(editor.getNode("n0").width).toBe(80);

    // Add image wider than 80 - 20 padding = needs 400+20=420
    const asset = makeAsset("a1");
    editor.setNodeImage("n0", asset, 400, 300);

    expect(editor.getNode("n0").width).toBe(420);
  });
});
