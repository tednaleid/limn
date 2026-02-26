import { describe, test, expect, beforeEach } from "vitest";
import { MindMapStore, resetIdCounter } from "../store/MindMapStore";
import {
  serialize,
  deserialize,
  toMarkdown,
  validateFileFormat,
} from "../serialization/serialization";
import type { MindMapFileFormat } from "../serialization/schema";

const sampleFile: MindMapFileFormat = {
  version: 1,
  meta: { id: "test-uuid", theme: "default" },
  camera: { x: 0, y: 0, zoom: 1.0 },
  roots: [
    {
      id: "n0",
      text: "Project Plan",
      x: 0,
      y: 0,
      width: 120,
      height: 32,
      children: [
        {
          id: "n1",
          text: "Phase 1",
          x: 250,
          y: -60,
          width: 100,
          height: 32,
          children: [
            {
              id: "n3",
              text: "Research",
              x: 480,
              y: -90,
              width: 100,
              height: 32,
              children: [],
            },
            {
              id: "n4",
              text: "Architecture",
              x: 480,
              y: -30,
              width: 100,
              height: 32,
              children: [],
            },
          ],
        },
        {
          id: "n2",
          text: "Phase 2",
          x: 250,
          y: 60,
          width: 100,
          height: 32,
          collapsed: true,
          children: [
            {
              id: "n5",
              text: "Implementation",
              x: 480,
              y: 60,
              width: 120,
              height: 32,
              children: [],
            },
          ],
        },
      ],
    },
  ],
  assets: [],
};

describe("serialization", () => {
  beforeEach(() => {
    resetIdCounter();
  });

  describe("deserialize", () => {
    test("creates flat store from nested JSON", () => {
      const store = deserialize(sampleFile);
      expect(store.nodeCount).toBe(6);
    });

    test("preserves node text", () => {
      const store = deserialize(sampleFile);
      expect(store.getNode("n0").text).toBe("Project Plan");
      expect(store.getNode("n1").text).toBe("Phase 1");
    });

    test("preserves positions", () => {
      const store = deserialize(sampleFile);
      const n1 = store.getNode("n1");
      expect(n1.x).toBe(250);
      expect(n1.y).toBe(-60);
    });

    test("preserves dimensions", () => {
      const store = deserialize(sampleFile);
      const n0 = store.getNode("n0");
      expect(n0.width).toBe(120);
      expect(n0.height).toBe(32);
    });

    test("sets parentId from nesting", () => {
      const store = deserialize(sampleFile);
      expect(store.getNode("n0").parentId).toBeNull();
      expect(store.getNode("n1").parentId).toBe("n0");
      expect(store.getNode("n3").parentId).toBe("n1");
    });

    test("preserves children order", () => {
      const store = deserialize(sampleFile);
      expect(store.getNode("n0").children).toEqual(["n1", "n2"]);
      expect(store.getNode("n1").children).toEqual(["n3", "n4"]);
    });

    test("preserves collapsed state", () => {
      const store = deserialize(sampleFile);
      expect(store.getNode("n2").collapsed).toBe(true);
      expect(store.getNode("n1").collapsed).toBe(false);
    });

    test("handles empty file", () => {
      const emptyFile: MindMapFileFormat = {
        version: 1,
        meta: { id: "empty", theme: "default" },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [],
        assets: [],
      };
      const store = deserialize(emptyFile);
      expect(store.nodeCount).toBe(0);
      expect(store.getRoots()).toEqual([]);
    });

    test("handles multiple roots", () => {
      const multiRoot: MindMapFileFormat = {
        version: 1,
        meta: { id: "multi", theme: "default" },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [
          {
            id: "r1",
            text: "Root 1",
            x: 0,
            y: 0,
            width: 100,
            height: 32,
            children: [],
          },
          {
            id: "r2",
            text: "Root 2",
            x: 400,
            y: 0,
            width: 100,
            height: 32,
            children: [],
          },
        ],
        assets: [],
      };
      const store = deserialize(multiRoot);
      expect(store.getRoots()).toHaveLength(2);
      expect(store.getRoots().map((n) => n.id)).toEqual(["r1", "r2"]);
    });
  });

  describe("serialize", () => {
    test("produces nested JSON from flat store", () => {
      const store = new MindMapStore();
      const rootId = store.addRoot("Root", 0, 0);
      const childId = store.addChild(rootId, "Child");
      store.setNodePosition(childId, 250, 0);

      const result = serialize(store, {
        id: "test",
        version: 1,
        theme: "default",
      });
      expect(result.version).toBe(1);
      expect(result.roots).toHaveLength(1);
      expect(result.roots[0].text).toBe("Root");
      expect(result.roots[0].children).toHaveLength(1);
      expect(result.roots[0].children[0].text).toBe("Child");
    });

    test("omits collapsed when false", () => {
      const store = new MindMapStore();
      store.addRoot("Root", 0, 0);
      const result = serialize(store, {
        id: "test",
        version: 1,
        theme: "default",
      });
      expect(result.roots[0].collapsed).toBeUndefined();
    });

    test("includes collapsed when true", () => {
      const store = new MindMapStore();
      const rootId = store.addRoot("Root", 0, 0);
      store.toggleCollapse(rootId);
      const result = serialize(store, {
        id: "test",
        version: 1,
        theme: "default",
      });
      expect(result.roots[0].collapsed).toBe(true);
    });

    test("omits widthConstrained when false", () => {
      const store = new MindMapStore();
      store.addRoot("Root", 0, 0);
      const result = serialize(store, {
        id: "test",
        version: 1,
        theme: "default",
      });
      expect(result.roots[0].widthConstrained).toBeUndefined();
    });

    test("includes widthConstrained when true", () => {
      const store = new MindMapStore();
      const rootId = store.addRoot("Root", 0, 0);
      store.setNodeWidth(rootId, 200);
      const result = serialize(store, {
        id: "test",
        version: 1,
        theme: "default",
      });
      expect(result.roots[0].widthConstrained).toBe(true);
    });
  });

  describe("round-trip", () => {
    test("deserialize then serialize preserves structure", () => {
      const store = deserialize(sampleFile);
      const result = serialize(store, sampleFile.meta);
      expect(result.roots).toHaveLength(sampleFile.roots.length);
      expect(result.roots[0].id).toBe(sampleFile.roots[0].id);
      expect(result.roots[0].text).toBe(sampleFile.roots[0].text);
      expect(result.roots[0].children).toHaveLength(
        sampleFile.roots[0].children.length,
      );
    });

    test("round-trip preserves positions", () => {
      const store = deserialize(sampleFile);
      const result = serialize(store, sampleFile.meta);
      expect(result.roots[0].x).toBe(sampleFile.roots[0].x);
      expect(result.roots[0].y).toBe(sampleFile.roots[0].y);
      expect(result.roots[0].children[0].x).toBe(
        sampleFile.roots[0].children[0].x,
      );
    });

    test("round-trip preserves collapsed state", () => {
      const store = deserialize(sampleFile);
      const result = serialize(store, sampleFile.meta);
      expect(result.roots[0].children[1].collapsed).toBe(true);
      expect(result.roots[0].children[0].collapsed).toBeUndefined();
    });
  });

  describe("validateFileFormat", () => {
    test("accepts valid file format", () => {
      const result = validateFileFormat(sampleFile);
      expect(result.success).toBe(true);
    });

    test("rejects missing version", () => {
      const invalid = { ...sampleFile, version: undefined };
      const result = validateFileFormat(invalid);
      expect(result.success).toBe(false);
    });

    test("rejects invalid node (missing text)", () => {
      const invalid = {
        ...sampleFile,
        roots: [{ id: "bad", x: 0, y: 0, width: 100, height: 32 }],
      };
      const result = validateFileFormat(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("toMarkdown", () => {
    test("generates indented outline from store", () => {
      const store = deserialize(sampleFile);
      const md = toMarkdown(store);
      expect(md).toContain("# Project Plan");
      expect(md).toContain("## Phase 1");
      expect(md).toContain("## Phase 2");
      expect(md).toContain("- Research");
      expect(md).toContain("- Architecture");
      expect(md).toContain("- Implementation");
    });

    test("handles empty store", () => {
      const store = new MindMapStore();
      const md = toMarkdown(store);
      expect(md).toBe("");
    });

    test("handles multiple roots", () => {
      const store = new MindMapStore();
      store.addRoot("Root A");
      store.addRoot("Root B");
      const md = toMarkdown(store);
      expect(md).toContain("# Root A");
      expect(md).toContain("# Root B");
    });

    test("supports multi-line node text", () => {
      const store = new MindMapStore();
      store.addRoot("Line 1\nLine 2");
      const md = toMarkdown(store);
      expect(md).toContain("# Line 1\nLine 2");
    });
  });
});
