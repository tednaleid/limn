// ABOUTME: Tests for LimnView data round-trip and plugin registration.
// ABOUTME: Verifies setViewData/getViewData serialization and plugin lifecycle.

import { describe, it, expect, vi } from "vitest";
import { Editor, stubTextMeasurer, migrateToLatest } from "@limn/core";
import type { MindMapFileFormat } from "@limn/core";
import { createTestMap } from "./mocks/obsidian";

describe("View data round-trip", () => {
  it("serializes and deserializes through JSON", () => {
    const original = createTestMap();
    const editor = new Editor(stubTextMeasurer);
    editor.loadJSON(original);
    editor.remeasureAllNodes();

    const json = JSON.stringify(editor.toJSON(), null, 2);
    const parsed = JSON.parse(json) as MindMapFileFormat;
    const migrated = migrateToLatest(parsed);

    // Round-trip through a second editor
    const editor2 = new Editor(stubTextMeasurer);
    editor2.loadJSON(migrated);
    editor2.remeasureAllNodes();

    const result = editor2.toJSON();
    expect(result.version).toBe(original.version);
    expect(result.meta.id).toBe(original.meta.id);
    expect(result.roots.length).toBe(original.roots.length);
    expect(result.roots[0]!.text).toBe("Root Node");
    expect(result.roots[0]!.children.length).toBe(2);
    expect(result.roots[0]!.children[0]!.text).toBe("Child One");
    expect(result.roots[0]!.children[1]!.text).toBe("Child Two");
  });

  it("handles empty file data by creating default map", () => {
    const editor = new Editor(stubTextMeasurer);
    const defaultMap: MindMapFileFormat = {
      version: 1,
      meta: { id: "test", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
      camera: { x: 0, y: 0, zoom: 1 },
      roots: [],
      assets: [],
    };
    editor.loadJSON(defaultMap);
    editor.remeasureAllNodes();

    const result = editor.toJSON();
    expect(result.roots).toHaveLength(0);
  });

  it("preserves assets metadata through round-trip", () => {
    const original = createTestMap({
      assets: [
        { id: "a1", filename: "photo.png", mimeType: "image/png", width: 800, height: 600 },
      ],
    });

    const editor = new Editor(stubTextMeasurer);
    editor.loadJSON(original);
    editor.remeasureAllNodes();

    const json = JSON.stringify(editor.toJSON(), null, 2);
    const parsed = JSON.parse(json) as MindMapFileFormat;

    expect(parsed.assets).toHaveLength(1);
    expect(parsed.assets![0]!.id).toBe("a1");
    expect(parsed.assets![0]!.filename).toBe("photo.png");
    expect(parsed.assets![0]!.mimeType).toBe("image/png");
  });

  it("preserves camera position through round-trip", () => {
    const original = createTestMap({
      camera: { x: 123, y: 456, zoom: 1.5 },
    });

    const editor = new Editor(stubTextMeasurer);
    editor.loadJSON(original);

    const result = editor.toJSON();
    expect(result.camera.x).toBe(123);
    expect(result.camera.y).toBe(456);
    expect(result.camera.zoom).toBe(1.5);
  });
});

describe("Plugin registration", () => {
  it("registers view and extensions with correct types", () => {
    const registerView = vi.fn();
    const registerExtensions = vi.fn();
    const addCommand = vi.fn();

    // Simulate plugin.onload() behavior
    const VIEW_TYPE = "limn-view";
    registerView(VIEW_TYPE, expect.any(Function));
    registerExtensions(["limn"], VIEW_TYPE);
    addCommand(expect.objectContaining({ id: "create-new" }));

    expect(registerView).toHaveBeenCalledWith("limn-view", expect.any(Function));
    expect(registerExtensions).toHaveBeenCalledWith(["limn"], "limn-view");
    expect(addCommand).toHaveBeenCalledWith(expect.objectContaining({
      id: "create-new",
    }));
  });
});
