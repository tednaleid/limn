import { describe, test, expect, beforeEach } from "vitest";
import { generateEasyMotionLabels } from "../editor/Editor";
import { TestEditor } from "../test-editor/TestEditor";
import type { MindMapFileFormat } from "../serialization/schema";

describe("generateEasyMotionLabels", () => {
  test("N=0 nodes returns empty map", () => {
    const result = generateEasyMotionLabels([]);
    expect(result.size).toBe(0);
  });

  test("N=3 nodes returns single-char labels a, b, c", () => {
    const result = generateEasyMotionLabels(["n1", "n2", "n3"]);
    expect(result.size).toBe(3);
    expect(result.get("a")).toBe("n1");
    expect(result.get("b")).toBe("n2");
    expect(result.get("c")).toBe("n3");
  });

  test("N=26 nodes uses all single chars a-z", () => {
    const ids = Array.from({ length: 26 }, (_, i) => `n${i}`);
    const result = generateEasyMotionLabels(ids);
    expect(result.size).toBe(26);
    expect(result.get("a")).toBe("n0");
    expect(result.get("z")).toBe("n25");
    // All labels should be single characters
    for (const label of result.keys()) {
      expect(label.length).toBe(1);
    }
  });

  test("N=27 nodes: P=1, closest 25 get b-z, farthest 2 get aa, ab", () => {
    const ids = Array.from({ length: 27 }, (_, i) => `n${i}`);
    const result = generateEasyMotionLabels(ids);
    expect(result.size).toBe(27);

    // First 25 nodes (closest) get single-char labels b-z
    for (let i = 0; i < 25; i++) {
      const expectedLabel = String.fromCharCode(98 + i); // 'b' = 98
      expect(result.get(expectedLabel)).toBe(`n${i}`);
    }

    // Last 2 nodes get double-char labels aa, ab
    expect(result.get("aa")).toBe("n25");
    expect(result.get("ab")).toBe("n26");
  });

  test("N=51 nodes: P=1, exactly fills 25 single + 26 double", () => {
    const ids = Array.from({ length: 51 }, (_, i) => `n${i}`);
    const result = generateEasyMotionLabels(ids);
    expect(result.size).toBe(51);

    // First 25 get single-char labels b-z
    for (let i = 0; i < 25; i++) {
      const expectedLabel = String.fromCharCode(98 + i); // 'b' = 98
      expect(result.get(expectedLabel)).toBe(`n${i}`);
    }

    // Next 26 get double-char labels aa-az
    for (let i = 0; i < 26; i++) {
      const expectedLabel = "a" + String.fromCharCode(97 + i);
      expect(result.get(expectedLabel)).toBe(`n${25 + i}`);
    }
  });

  test("N=52 nodes: P=2, closest 24 get c-z, rest get aa-az, ba-bz", () => {
    const ids = Array.from({ length: 52 }, (_, i) => `n${i}`);
    const result = generateEasyMotionLabels(ids);
    expect(result.size).toBe(52);

    // First 24 get single-char labels c-z
    for (let i = 0; i < 24; i++) {
      const expectedLabel = String.fromCharCode(99 + i); // 'c' = 99
      expect(result.get(expectedLabel)).toBe(`n${i}`);
    }

    // Next 26 get double-char labels aa-az
    for (let i = 0; i < 26; i++) {
      const expectedLabel = "a" + String.fromCharCode(97 + i);
      expect(result.get(expectedLabel)).toBe(`n${24 + i}`);
    }

    // Last 2 get double-char labels ba, bb
    expect(result.get("ba")).toBe("n50");
    expect(result.get("bb")).toBe("n51");
  });

  test("all labels are unique", () => {
    // Test with a variety of sizes
    for (const n of [1, 10, 26, 27, 51, 52, 100]) {
      const ids = Array.from({ length: n }, (_, i) => `n${i}`);
      const result = generateEasyMotionLabels(ids);
      const labels = [...result.keys()];
      expect(new Set(labels).size).toBe(labels.length);
      expect(result.size).toBe(n);
    }
  });
});

const NODE_HEIGHT = 32;

/** Fixture: root with three children at known positions. */
function threeNodeMap(): MindMapFileFormat {
  return {
    version: 1,
    meta: { id: "test", theme: "default" },
    camera: { x: 0, y: 0, zoom: 1 },
    roots: [
      {
        id: "root",
        text: "Root",
        x: 0,
        y: 0,
        width: 100,
        height: NODE_HEIGHT,
        children: [
          {
            id: "c1",
            text: "Child 1",
            x: 250,
            y: -52,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
          {
            id: "c2",
            text: "Child 2",
            x: 250,
            y: 0,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
          {
            id: "c3",
            text: "Child 3",
            x: 250,
            y: 52,
            width: 100,
            height: NODE_HEIGHT,
            children: [],
          },
        ],
      },
    ],
    assets: [],
  };
}

describe("EasyMotion mode lifecycle", () => {
  let editor: TestEditor;

  beforeEach(() => {
    editor = new TestEditor();
    editor.loadJSON(threeNodeMap());
  });

  test("enterEasyMotionMode sets isEasyMotionActive to true", () => {
    editor.select("root");
    expect(editor.isEasyMotionActive()).toBe(false);
    editor.enterEasyMotionMode();
    expect(editor.isEasyMotionActive()).toBe(true);
  });

  test("enterEasyMotionMode generates labels for visible nodes except selected", () => {
    editor.select("root");
    editor.enterEasyMotionMode();
    // 4 visible nodes, root is selected -> 3 labels
    expect(editor.getEasyMotionLabel("c1")).toBeDefined();
    expect(editor.getEasyMotionLabel("c2")).toBeDefined();
    expect(editor.getEasyMotionLabel("c3")).toBeDefined();
    expect(editor.getEasyMotionLabel("root")).toBeUndefined();
  });

  test("exitEasyMotionMode clears active state and labels", () => {
    editor.select("root");
    editor.enterEasyMotionMode();
    editor.exitEasyMotionMode();
    expect(editor.isEasyMotionActive()).toBe(false);
    expect(editor.getEasyMotionLabel("c1")).toBeUndefined();
  });

  test("labels are sorted by distance from selected node", () => {
    // Select c2 (at x=250, y=0). Distances:
    // root center=(50,16): dist ~= 201
    // c1 center=(300,-36): dist ~= 61
    // c3 center=(300,68): dist ~= 69
    // Expected order: c1 (closest), c3, root (farthest)
    editor.select("c2");
    editor.enterEasyMotionMode();
    expect(editor.getEasyMotionLabel("c1")).toBe("a"); // closest
    expect(editor.getEasyMotionLabel("c3")).toBe("b"); // next
    expect(editor.getEasyMotionLabel("root")).toBe("c"); // farthest
  });

  test("entering with nothing selected uses viewport center for sort", () => {
    editor.setViewportSize(800, 600);
    editor.setCamera(400, 300, 1);
    editor.deselect();
    editor.enterEasyMotionMode();
    // All 4 nodes should have labels (nothing selected to exclude)
    expect(editor.isEasyMotionActive()).toBe(true);
    let labelCount = 0;
    for (const node of editor.getVisibleNodes()) {
      if (editor.getEasyMotionLabel(node.id) !== undefined) labelCount++;
    }
    expect(labelCount).toBe(4);
  });
});

describe("EasyMotion key handling", () => {
  let editor: TestEditor;

  beforeEach(() => {
    editor = new TestEditor();
    editor.loadJSON(threeNodeMap());
    editor.select("root");
  });

  test("single-char label selects node and exits easymotion", () => {
    editor.enterEasyMotionMode();
    // c1 is closest to root, should get label "a"
    const label = editor.getEasyMotionLabel("c1");
    expect(label).toBeDefined();
    editor.handleEasyMotionKey(label as string);
    expect(editor.getSelectedId()).toBe("c1");
    expect(editor.isEasyMotionActive()).toBe(false);
  });

  test("prefix key stores buffer and stays in easymotion", () => {
    // Need >26 nodes to get prefixes. Create a large map.
    const largeMap: MindMapFileFormat = {
      version: 1,
      meta: { id: "test", theme: "default" },
      camera: { x: 0, y: 0, zoom: 1 },
      roots: Array.from({ length: 28 }, (_, i) => ({
        id: `n${i}`,
        text: `Node ${i}`,
        x: i * 200,
        y: 0,
        width: 100,
        height: NODE_HEIGHT,
        children: [] as MindMapFileFormat["roots"][0]["children"],
      })),
      assets: [],
    };
    editor.loadJSON(largeMap);
    editor.select("n0");
    editor.enterEasyMotionMode();
    // With 27 other nodes, P=1, so "a" is a prefix
    expect(editor.getEasyMotionBuffer()).toBe("");
    editor.handleEasyMotionKey("a");
    expect(editor.isEasyMotionActive()).toBe(true);
    expect(editor.getEasyMotionBuffer()).toBe("a");
  });

  test("second char after prefix selects two-char labeled node and exits", () => {
    const largeMap: MindMapFileFormat = {
      version: 1,
      meta: { id: "test", theme: "default" },
      camera: { x: 0, y: 0, zoom: 1 },
      roots: Array.from({ length: 28 }, (_, i) => ({
        id: `n${i}`,
        text: `Node ${i}`,
        x: i * 200,
        y: 0,
        width: 100,
        height: NODE_HEIGHT,
        children: [] as MindMapFileFormat["roots"][0]["children"],
      })),
      assets: [],
    };
    editor.loadJSON(largeMap);
    editor.select("n0");
    editor.enterEasyMotionMode();
    // Find a node with a two-char label starting with "a"
    const aaNode = editor.getVisibleNodes().find(
      (n) => editor.getEasyMotionLabel(n.id)?.startsWith("a") && editor.getEasyMotionLabel(n.id)?.length === 2,
    );
    expect(aaNode).toBeDefined();
    const fullLabel = editor.getEasyMotionLabel(aaNode?.id ?? "");
    expect(fullLabel?.length).toBe(2);

    editor.handleEasyMotionKey("a"); // prefix
    editor.handleEasyMotionKey(fullLabel?.charAt(1) ?? "a"); // second char
    expect(editor.getSelectedId()).toBe(aaNode?.id);
    expect(editor.isEasyMotionActive()).toBe(false);
  });

  test("invalid key (not a label or prefix) exits easymotion, selection unchanged", () => {
    editor.enterEasyMotionMode();
    const selBefore = editor.getSelectedId();
    // Use a key that is definitely not assigned (only 3 labels: a, b, c)
    editor.handleEasyMotionKey("z");
    expect(editor.isEasyMotionActive()).toBe(false);
    expect(editor.getSelectedId()).toBe(selBefore);
  });

  test("invalid second char after prefix exits easymotion, selection unchanged", () => {
    const largeMap: MindMapFileFormat = {
      version: 1,
      meta: { id: "test", theme: "default" },
      camera: { x: 0, y: 0, zoom: 1 },
      roots: Array.from({ length: 28 }, (_, i) => ({
        id: `n${i}`,
        text: `Node ${i}`,
        x: i * 200,
        y: 0,
        width: 100,
        height: NODE_HEIGHT,
        children: [] as MindMapFileFormat["roots"][0]["children"],
      })),
      assets: [],
    };
    editor.loadJSON(largeMap);
    editor.select("n0");
    editor.enterEasyMotionMode();
    editor.handleEasyMotionKey("a"); // valid prefix
    expect(editor.isEasyMotionActive()).toBe(true);
    // Now enter a key that makes an invalid combo
    // With 27 nodes, only aa and ab exist. "a" + "z" should be invalid since az > 27-25=2 double labels
    editor.handleEasyMotionKey("z");
    expect(editor.isEasyMotionActive()).toBe(false);
    expect(editor.getSelectedId()).toBe("n0");
  });

  test("getEasyMotionBuffer returns current partial input", () => {
    editor.enterEasyMotionMode();
    expect(editor.getEasyMotionBuffer()).toBe("");
  });
});
