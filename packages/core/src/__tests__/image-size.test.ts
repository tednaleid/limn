// ABOUTME: Tests for drawing images whose stored size is unknown from the asset's natural size.
// ABOUTME: Covers imageDisplaySize, Editor.setAssetNaturalSize, measurement, resize, and undo.

import { describe, it, expect, beforeEach } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import { imageDisplaySize, DEFAULT_IMAGE_DISPLAY_WIDTH } from "../editor/imageSize";
import { OUTLINE_CAPABILITIES } from "../editor/capabilities";
import { resetIdCounter } from "../store/MindMapStore";
import type { Asset } from "../model/types";

beforeEach(() => {
  resetIdCounter();
});

const natural: Asset = { id: "pic.png", filename: "pic.png", mimeType: "image/png", width: 800, height: 600 };
const unknown: Asset = { id: "pic.png", filename: "pic.png", mimeType: "image/png", width: 0, height: 0 };

describe("imageDisplaySize", () => {
  it("uses stored dimensions when both are known", () => {
    expect(imageDisplaySize({ assetId: "pic.png", width: 120, height: 50 }, natural)).toEqual({ width: 120, height: 50 });
  });

  it("derives a missing height from the natural aspect ratio", () => {
    expect(imageDisplaySize({ assetId: "pic.png", width: 400, height: 0 }, natural)).toEqual({ width: 400, height: 300 });
  });

  it("caps a missing width at DEFAULT_IMAGE_DISPLAY_WIDTH and keeps the aspect ratio", () => {
    expect(imageDisplaySize({ assetId: "pic.png", width: 0, height: 0 }, natural))
      .toEqual({ width: DEFAULT_IMAGE_DISPLAY_WIDTH, height: 225 });
    expect(imageDisplaySize({ assetId: "pic.png", width: 0, height: 0 }, { ...natural, width: 200, height: 100 }))
      .toEqual({ width: 200, height: 100 });
  });

  it("is null while a dimension is missing and the natural size is unknown", () => {
    expect(imageDisplaySize({ assetId: "pic.png", width: 0, height: 0 }, unknown)).toBeNull();
    expect(imageDisplaySize({ assetId: "pic.png", width: 300, height: 0 }, undefined)).toBeNull();
  });
});

describe("Editor.setAssetNaturalSize", () => {
  function editorWithBareImage(): TestEditor {
    const editor = new TestEditor();
    editor.setCapabilities(OUTLINE_CAPABILITIES);
    editor.addRoot("root", 0, 0);
    editor.exitEditMode();
    editor.setNodeImage("n0", unknown, 0, 0);
    return editor;
  }

  it("draws nothing and measures text only until the natural size is known", () => {
    const editor = editorWithBareImage();
    expect(editor.getImageDisplaySize("n0")).toBeNull();
    const heightBefore = editor.getNode("n0").height;
    editor.setAssetNaturalSize("pic.png", 800, 600);
    expect(editor.getImageDisplaySize("n0")).toEqual({ width: 300, height: 225 });
    expect(editor.getNode("n0").height).toBe(heightBefore + 225 + 10);
    expect(editor.getNode("n0").width).toBe(300 + 20);
  });

  it("does not touch the stored image reference and is not undoable", () => {
    const editor = editorWithBareImage();
    const undoBefore = editor.canUndo();
    editor.setAssetNaturalSize("pic.png", 800, 600);
    expect(editor.getNode("n0").image).toEqual({ assetId: "pic.png", width: 0, height: 0 });
    expect(editor.canUndo()).toBe(undoBefore);
    expect(editor.getAssets().find((a) => a.id === "pic.png")).toMatchObject({ width: 800, height: 600 });
  });

  it("ignores unknown assets and non-positive sizes", () => {
    const editor = editorWithBareImage();
    const versionBefore = editor.getVersion();
    editor.setAssetNaturalSize("missing.png", 10, 10);
    editor.setAssetNaturalSize("pic.png", 0, 600);
    expect(editor.getVersion()).toBe(versionBefore);
    expect(editor.getImageDisplaySize("n0")).toBeNull();
  });

  it("resize starts from the display size and stores explicit dimensions", () => {
    const editor = editorWithBareImage();
    editor.setAssetNaturalSize("pic.png", 800, 600);
    editor.resizeNode("n0", 20);
    expect(editor.getNode("n0").image).toEqual({ assetId: "pic.png", width: 320, height: 240 });
    editor.startImageResize("n0");
    expect(editor.isResizingImage()).toBe(true);
    editor.updateImageResize(400);
    editor.endImageResize();
    expect(editor.getNode("n0").image).toEqual({ assetId: "pic.png", width: 400, height: 300 });
  });

  it("undo does not forget a natural size learned after the snapshot", () => {
    const editor = editorWithBareImage();
    editor.setText("n0", "renamed");          // snapshot taken while the asset size is unknown
    editor.setAssetNaturalSize("pic.png", 800, 600);
    editor.undo();
    expect(editor.getNode("n0").text).toBe("root");
    expect(editor.getImageDisplaySize("n0")).toEqual({ width: 300, height: 225 });
  });
});
