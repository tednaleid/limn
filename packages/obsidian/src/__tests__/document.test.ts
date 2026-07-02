// ABOUTME: Tests that .limn bytes load correctly, including empty files as blank docs.
// ABOUTME: Guards the "new document opens as a valid, editable document" path.

import { describe, it, expect } from "vitest";
import { buildLimnZip } from "@limn/web/persistence/file";
import { Editor, stubTextMeasurer } from "@limn/core";
import type { MindMapFileFormat } from "@limn/core";
import { emptyDocument, loadLimnDocument } from "../document";

describe("loadLimnDocument", () => {
  it("treats a zero-byte file as a new, blank document", async () => {
    const { data, assetBlobs } = await loadLimnDocument(new ArrayBuffer(0));

    expect(data.version).toBe(1);
    expect(data.roots).toHaveLength(0);
    expect(data.assets).toHaveLength(0);
    expect(typeof data.meta.id).toBe("string");
    expect(data.meta.id.length).toBeGreaterThan(0);
    expect(assetBlobs.size).toBe(0);
  });

  it("opens a blank document into an Editor without error", async () => {
    const { data } = await loadLimnDocument(new ArrayBuffer(0));

    const editor = new Editor(stubTextMeasurer);
    editor.loadJSON(data);
    editor.remeasureAllNodes();

    expect(editor.toJSON().roots).toHaveLength(0);
  });

  it("parses real content from a saved .limn ZIP", async () => {
    const doc: MindMapFileFormat = {
      version: 1,
      meta: { id: "m", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
      camera: { x: 0, y: 0, zoom: 1 },
      roots: [{ id: "r1", text: "Hello", x: 0, y: 0, width: 100, height: 32, children: [] }],
      assets: [],
    };
    const bytes = await (await buildLimnZip(doc, new Map())).arrayBuffer();

    const { data } = await loadLimnDocument(bytes);

    expect(data.roots).toHaveLength(1);
    expect(data.roots[0]!.text).toBe("Hello");
  });

  it("round-trips: a new blank doc, once saved, reopens as an empty document", async () => {
    // new file (0 bytes) -> open -> save (buildLimnZip) -> reopen
    const { data: blank } = await loadLimnDocument(new ArrayBuffer(0));
    const bytes = await (await buildLimnZip(blank, new Map())).arrayBuffer();

    const reopened = await loadLimnDocument(bytes);

    expect(reopened.data.roots).toHaveLength(0);
    expect(reopened.data.meta.id).toBe(blank.meta.id);
  });
});

describe("emptyDocument", () => {
  it("gives each new document a distinct id", () => {
    expect(emptyDocument().meta.id).not.toBe(emptyDocument().meta.id);
  });
});
