// ABOUTME: Tests for export functionality: URL sharing and export dispatch.
// ABOUTME: Red-green tests for chunk 15 (export).

import { describe, it, expect, vi } from "vitest";
import { TestEditor } from "../test-editor/TestEditor";
import { compressToUrl, decompressFromUrl } from "../export/url";
import type { MindMapFileFormat } from "../serialization/schema";

function makeFile(overrides: Partial<MindMapFileFormat> = {}): MindMapFileFormat {
  return {
    version: 1,
    meta: { id: "test", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
    camera: { x: 0, y: 0, zoom: 1 },
    roots: [],
    assets: [],
    ...overrides,
  };
}

describe("URL sharing", () => {
  it("round-trips empty map through compress/decompress", () => {
    const data = makeFile();
    const compressed = compressToUrl(data);
    const result = decompressFromUrl(compressed);
    expect(result).toEqual(data);
  });

  it("round-trips map with nodes", () => {
    const data = makeFile({
      roots: [
        {
          id: "r1",
          text: "Root",
          x: 0,
          y: 0,
          width: 100,
          height: 32,
          children: [
            { id: "c1", text: "Child", x: 250, y: 0, width: 100, height: 32, children: [] },
          ],
        },
      ],
    });
    const compressed = compressToUrl(data);
    const result = decompressFromUrl(compressed);
    expect(result).toEqual(data);
  });

  it("compressed string is URL-safe (no +, /, =)", () => {
    const data = makeFile({
      roots: [
        { id: "r1", text: "Hello World!", x: 0, y: 0, width: 100, height: 32, children: [] },
      ],
    });
    const compressed = compressToUrl(data);
    expect(compressed).not.toMatch(/[+/=]/);
  });

  it("returns null for invalid compressed data", () => {
    const result = decompressFromUrl("not-valid-data");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    const result = decompressFromUrl("");
    expect(result).toBeNull();
  });
});

describe("export dispatch", () => {
  it("Shift+Cmd+E triggers export callback", () => {
    const editor = new TestEditor();
    const exportFn = vi.fn();
    editor.onExport(exportFn);
    editor.pressKey("e", { meta: true, shift: true });
    expect(exportFn).toHaveBeenCalledOnce();
  });

  it("Shift+Cmd+E without callback is a no-op", () => {
    const editor = new TestEditor();
    expect(() => editor.pressKey("e", { meta: true, shift: true })).not.toThrow();
  });
});
