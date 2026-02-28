// ABOUTME: Round-trip tests for .mindmap ZIP save/load.
// ABOUTME: Verifies buildMindmapZip -> parseMindmapFile preserves all document state.

import { describe, it, expect } from "vitest";
import { buildMindmapZip, parseMindmapFile } from "../persistence/file";
import type { MindMapFileFormat } from "@limn/core";

function makeFile(overrides: Partial<MindMapFileFormat> = {}): MindMapFileFormat {
  return {
    version: 1,
    meta: { id: "test", theme: "default" },
    camera: { x: 0, y: 0, zoom: 1 },
    roots: [],
    assets: [],
    ...overrides,
  };
}

/** Build ZIP from data, parse it back, return the parsed result. */
async function roundTrip(
  data: MindMapFileFormat,
  assetBlobs: Map<string, Blob> = new Map(),
): Promise<{ data: MindMapFileFormat; assetBlobs: Map<string, Blob> }> {
  const zip = await buildMindmapZip(data, assetBlobs);
  return parseMindmapFile(zip);
}

describe("file round-trip", () => {
  it("empty document round-trips", async () => {
    const input = makeFile();
    const { data } = await roundTrip(input);
    expect(data).toEqual(input);
  });

  it("preserves roots with children", async () => {
    const input = makeFile({
      roots: [
        {
          id: "r1",
          text: "Root",
          x: 0,
          y: 0,
          width: 100,
          height: 32,
          children: [
            {
              id: "c1",
              text: "Child",
              x: 200,
              y: 0,
              width: 80,
              height: 32,
              children: [],
            },
          ],
        },
      ],
    });
    const { data } = await roundTrip(input);
    expect(data.roots).toEqual(input.roots);
  });

  it("preserves collapsed state", async () => {
    const input = makeFile({
      roots: [
        {
          id: "r1",
          text: "Root",
          x: 0,
          y: 0,
          width: 100,
          height: 32,
          collapsed: true,
          children: [
            { id: "c1", text: "Hidden", x: 200, y: 0, width: 80, height: 32, children: [] },
          ],
        },
      ],
    });
    const { data } = await roundTrip(input);
    expect(data.roots[0]!.collapsed).toBe(true);
  });

  it("preserves node styles", async () => {
    const style = { fontSize: 18, fontWeight: 700, color: "#ff0000" };
    const input = makeFile({
      roots: [
        {
          id: "r1",
          text: "Styled",
          x: 0,
          y: 0,
          width: 100,
          height: 32,
          style,
          children: [],
        },
      ],
    });
    const { data } = await roundTrip(input);
    expect(data.roots[0]!.style).toEqual(style);
  });

  it("preserves widthConstrained flag", async () => {
    const input = makeFile({
      roots: [
        {
          id: "r1",
          text: "Constrained",
          x: 0,
          y: 0,
          width: 160,
          height: 48,
          widthConstrained: true,
          children: [],
        },
      ],
    });
    const { data } = await roundTrip(input);
    expect(data.roots[0]!.widthConstrained).toBe(true);
  });

  it("preserves multiple roots", async () => {
    const input = makeFile({
      roots: [
        { id: "r1", text: "First", x: 0, y: 0, width: 100, height: 32, children: [] },
        { id: "r2", text: "Second", x: 0, y: 200, width: 100, height: 32, children: [] },
        { id: "r3", text: "Third", x: 0, y: 400, width: 100, height: 32, children: [] },
      ],
    });
    const { data } = await roundTrip(input);
    expect(data.roots).toHaveLength(3);
    expect(data.roots.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
  });

  it("preserves deep nesting (4+ levels)", async () => {
    const input = makeFile({
      roots: [
        {
          id: "r1",
          text: "Level 0",
          x: 0,
          y: 0,
          width: 100,
          height: 32,
          children: [
            {
              id: "l1",
              text: "Level 1",
              x: 200,
              y: 0,
              width: 100,
              height: 32,
              children: [
                {
                  id: "l2",
                  text: "Level 2",
                  x: 400,
                  y: 0,
                  width: 100,
                  height: 32,
                  children: [
                    {
                      id: "l3",
                      text: "Level 3",
                      x: 600,
                      y: 0,
                      width: 100,
                      height: 32,
                      children: [
                        {
                          id: "l4",
                          text: "Level 4",
                          x: 800,
                          y: 0,
                          width: 100,
                          height: 32,
                          children: [],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const { data } = await roundTrip(input);
    const leaf = data.roots[0]!.children[0]!.children[0]!.children[0]!.children[0]!;
    expect(leaf.id).toBe("l4");
    expect(leaf.text).toBe("Level 4");
  });

  it("preserves camera and meta", async () => {
    const input = makeFile({
      meta: { id: "my-map", theme: "dark" },
      camera: { x: 120, y: -50, zoom: 0.85 },
    });
    const { data } = await roundTrip(input);
    expect(data.meta).toEqual(input.meta);
    expect(data.camera).toEqual(input.camera);
  });

  it("round-trips asset metadata and blobs", async () => {
    const input = makeFile({
      roots: [
        {
          id: "r1",
          text: "With Image",
          x: 0,
          y: 0,
          width: 100,
          height: 32,
          image: { assetId: "a1", width: 800, height: 600 },
          children: [],
        },
      ],
      assets: [
        { id: "a1", filename: "photo.png", mimeType: "image/png", width: 800, height: 600 },
      ],
    });

    const blobContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // fake PNG header
    const assetBlobs = new Map([["a1", new Blob([blobContent])]]);

    const result = await roundTrip(input, assetBlobs);

    // Asset metadata preserved
    expect(result.data.assets).toEqual(input.assets);
    expect(result.data.roots[0]!.image).toEqual(input.roots[0]!.image);

    // Asset blob round-tripped
    expect(result.assetBlobs.has("a1")).toBe(true);
    const roundTripped = await result.assetBlobs.get("a1")!.arrayBuffer();
    expect(new Uint8Array(roundTripped)).toEqual(blobContent);
  });

  it("parses legacy plain JSON (non-ZIP)", async () => {
    const input = makeFile({
      roots: [
        { id: "r1", text: "Legacy", x: 0, y: 0, width: 100, height: 32, children: [] },
      ],
    });
    const jsonBlob = new Blob([JSON.stringify(input)], { type: "application/json" });

    const { data, assetBlobs } = await parseMindmapFile(jsonBlob);
    expect(data.roots[0]!.text).toBe("Legacy");
    expect(assetBlobs.size).toBe(0);
  });

  it("preserves multi-line text", async () => {
    const input = makeFile({
      roots: [
        {
          id: "r1",
          text: "Line one\nLine two\nLine three",
          x: 0,
          y: 0,
          width: 160,
          height: 64,
          children: [],
        },
      ],
    });
    const { data } = await roundTrip(input);
    expect(data.roots[0]!.text).toBe("Line one\nLine two\nLine three");
  });

  it("round-trips the v1-complete golden fixture", async () => {
    // Inline the essential structure of the golden fixture
    const input: MindMapFileFormat = {
      version: 1,
      meta: { id: "fixture-v1-complete", theme: "dark" },
      camera: { x: 120, y: -50, zoom: 0.85 },
      roots: [
        {
          id: "r1",
          text: "Project Alpha",
          x: 0,
          y: 0,
          width: 140,
          height: 32,
          style: { fontSize: 18, fontWeight: 700, color: "#1a1a2e" },
          children: [
            {
              id: "r1c1",
              text: "Design",
              x: 250,
              y: -80,
              width: 100,
              height: 32,
              children: [
                {
                  id: "r1c1c1",
                  text: "Wireframes",
                  x: 480,
                  y: -110,
                  width: 110,
                  height: 32,
                  children: [
                    { id: "r1c1c1c1", text: "Mobile", x: 710, y: -110, width: 80, height: 32, children: [] },
                  ],
                },
                {
                  id: "r1c1c2",
                  text: "Mockups",
                  x: 480,
                  y: -50,
                  width: 100,
                  height: 32,
                  image: { assetId: "asset-001", width: 800, height: 600 },
                  children: [],
                },
              ],
            },
            {
              id: "r1c2",
              text: "Development",
              x: 250,
              y: 40,
              width: 120,
              height: 32,
              collapsed: true,
              children: [
                { id: "r1c2c1", text: "Frontend", x: 480, y: 20, width: 100, height: 32, children: [] },
                { id: "r1c2c2", text: "Backend", x: 480, y: 60, width: 100, height: 32, children: [] },
              ],
            },
            {
              id: "r1c3",
              text: "A node with\nmultiple lines",
              x: 250,
              y: 120,
              width: 160,
              height: 48,
              widthConstrained: true,
              children: [],
            },
          ],
        },
        {
          id: "r2",
          text: "Project Beta",
          x: 0,
          y: 300,
          width: 130,
          height: 32,
          children: [
            { id: "r2c1", text: "Research", x: 250, y: 300, width: 100, height: 32, children: [] },
          ],
        },
      ],
      assets: [
        { id: "asset-001", filename: "mockup.png", mimeType: "image/png", width: 800, height: 600 },
      ],
    };

    const blobContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const assetBlobs = new Map([["asset-001", new Blob([blobContent])]]);

    const result = await roundTrip(input, assetBlobs);
    expect(result.data).toEqual(input);
    expect(result.assetBlobs.has("asset-001")).toBe(true);
  });
});
