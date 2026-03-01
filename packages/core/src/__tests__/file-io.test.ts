// ABOUTME: Tests for file format migration pipeline and save/open dispatch.
// ABOUTME: Red-green tests for chunk 13 (file save/load).

import { describe, it, expect, vi } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import { CURRENT_FORMAT_VERSION, migrateToLatest } from "../serialization/migration";
import type { MindMapFileFormat } from "../serialization/schema";

function makeFileV1(overrides: Partial<MindMapFileFormat> = {}): MindMapFileFormat {
  return {
    version: 1,
    meta: { id: "test", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
    camera: { x: 0, y: 0, zoom: 1 },
    roots: [],
    assets: [],
    ...overrides,
  };
}

describe("file format migration", () => {
  it("current version is 1", () => {
    expect(CURRENT_FORMAT_VERSION).toBe(1);
  });

  it("returns version 1 data unchanged", () => {
    const data = makeFileV1();
    const result = migrateToLatest(data);
    expect(result).toEqual(data);
  });

  it("throws on unsupported future version", () => {
    const data = makeFileV1({ version: 999 });
    expect(() => migrateToLatest(data)).toThrow(/unsupported/i);
  });

  it("defaults missing version to 1", () => {
    const data = makeFileV1();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (data as any).version;
    const result = migrateToLatest(data);
    expect(result.version).toBe(1);
  });

  it("serialize outputs current version", () => {
    const editor = new TestEditor();
    editor.addRoot("test", 0, 0);
    editor.exitEditMode();
    const json = editor.toJSON();
    expect(json.version).toBe(CURRENT_FORMAT_VERSION);
  });
});

describe("save/open dispatch", () => {
  it("Cmd+S triggers save callback", () => {
    const editor = new TestEditor();
    const saveFn = vi.fn();
    editor.onSave(saveFn);
    editor.pressKey("s", { meta: true });
    expect(saveFn).toHaveBeenCalledOnce();
  });

  it("Cmd+O triggers open callback", () => {
    const editor = new TestEditor();
    const openFn = vi.fn();
    editor.onOpen(openFn);
    editor.pressKey("o", { meta: true });
    expect(openFn).toHaveBeenCalledOnce();
  });

  it("Cmd+S without callback is a no-op", () => {
    const editor = new TestEditor();
    // Should not throw
    expect(() => editor.pressKey("s", { meta: true })).not.toThrow();
  });
});
