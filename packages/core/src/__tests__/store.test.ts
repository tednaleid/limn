import { describe, test, expect, beforeEach } from "vitest";
import { MindMapStore } from "../store/MindMapStore";

describe("MindMapStore", () => {
  let store: MindMapStore;

  beforeEach(() => {
    store = new MindMapStore();
  });

  describe("initial state", () => {
    test("starts with no nodes", () => {
      expect(store.getRoots()).toEqual([]);
      expect(store.getAllNodes()).toEqual([]);
    });

    test("starts with empty canvas", () => {
      expect(store.nodeCount).toBe(0);
    });
  });

  describe("addRoot", () => {
    test("creates a root node with given text and position", () => {
      const id = store.addRoot("Root 1", 100, 200);
      const node = store.getNode(id);
      expect(node.text).toBe("Root 1");
      expect(node.parentId).toBeNull();
      expect(node.x).toBe(100);
      expect(node.y).toBe(200);
      expect(node.children).toEqual([]);
      expect(node.collapsed).toBe(false);
    });

    test("creates a root with default empty text and origin position", () => {
      const id = store.addRoot();
      const node = store.getNode(id);
      expect(node.text).toBe("");
      expect(node.x).toBe(0);
      expect(node.y).toBe(0);
    });

    test("adds root to the roots list", () => {
      const id = store.addRoot("Root");
      expect(store.getRoots().map((n) => n.id)).toContain(id);
    });

    test("supports multiple roots", () => {
      const id1 = store.addRoot("Root 1");
      const id2 = store.addRoot("Root 2");
      const rootIds = store.getRoots().map((n) => n.id);
      expect(rootIds).toContain(id1);
      expect(rootIds).toContain(id2);
      expect(rootIds).toHaveLength(2);
    });

    test("new root has default dimensions", () => {
      const id = store.addRoot("Root");
      const node = store.getNode(id);
      expect(node.width).toBe(100);
      expect(node.height).toBe(32);
      expect(node.widthConstrained).toBe(false);
    });
  });

  describe("addChild", () => {
    test("creates a child node under the given parent", () => {
      const rootId = store.addRoot("Root");
      const childId = store.addChild(rootId, "Child 1");
      const child = store.getNode(childId);
      expect(child.parentId).toBe(rootId);
      expect(child.text).toBe("Child 1");
    });

    test("appends child to parent's children list", () => {
      const rootId = store.addRoot("Root");
      const c1 = store.addChild(rootId, "C1");
      const c2 = store.addChild(rootId, "C2");
      expect(store.getNode(rootId).children).toEqual([c1, c2]);
    });

    test("throws when parent does not exist", () => {
      expect(() => store.addChild("nonexistent", "Child")).toThrow();
    });
  });

  describe("insertChild", () => {
    test("inserts child at specific index", () => {
      const rootId = store.addRoot("Root");
      const c1 = store.addChild(rootId, "C1");
      const c2 = store.addChild(rootId, "C2");
      const inserted = store.insertChild(rootId, 1, "Inserted");
      expect(store.getNode(rootId).children).toEqual([c1, inserted, c2]);
    });

    test("inserts at end when index exceeds children length", () => {
      const rootId = store.addRoot("Root");
      const c1 = store.addChild(rootId, "C1");
      const inserted = store.insertChild(rootId, 99, "Last");
      expect(store.getNode(rootId).children).toEqual([c1, inserted]);
    });

    test("inserts at beginning when index is 0", () => {
      const rootId = store.addRoot("Root");
      const c1 = store.addChild(rootId, "C1");
      const inserted = store.insertChild(rootId, 0, "First");
      expect(store.getNode(rootId).children).toEqual([inserted, c1]);
    });
  });

  describe("deleteNode", () => {
    test("deletes a leaf node", () => {
      const rootId = store.addRoot("Root");
      const childId = store.addChild(rootId, "Child");
      store.deleteNode(childId);
      expect(store.getNode(rootId).children).toEqual([]);
      expect(() => store.getNode(childId)).toThrow();
    });

    test("deletes a node and its entire subtree", () => {
      const rootId = store.addRoot("Root");
      const childId = store.addChild(rootId, "Child");
      const grandchildId = store.addChild(childId, "Grandchild");
      store.deleteNode(childId);
      expect(() => store.getNode(childId)).toThrow();
      expect(() => store.getNode(grandchildId)).toThrow();
      expect(store.getNode(rootId).children).toEqual([]);
    });

    test("deletes a root node and removes it from roots list", () => {
      const r1 = store.addRoot("Root 1");
      const r2 = store.addRoot("Root 2");
      store.deleteNode(r1);
      const rootIds = store.getRoots().map((n) => n.id);
      expect(rootIds).not.toContain(r1);
      expect(rootIds).toContain(r2);
    });

    test("deleting last root results in empty canvas", () => {
      const rootId = store.addRoot("Root");
      store.deleteNode(rootId);
      expect(store.getRoots()).toEqual([]);
      expect(store.nodeCount).toBe(0);
    });

    test("removes deleted node from parent's children list", () => {
      const rootId = store.addRoot("Root");
      const c1 = store.addChild(rootId, "C1");
      const c2 = store.addChild(rootId, "C2");
      const c3 = store.addChild(rootId, "C3");
      store.deleteNode(c2);
      expect(store.getNode(rootId).children).toEqual([c1, c3]);
    });
  });

  describe("setText", () => {
    test("updates node text", () => {
      const id = store.addRoot("Original");
      store.setText(id, "Updated");
      expect(store.getNode(id).text).toBe("Updated");
    });

    test("supports multi-line text", () => {
      const id = store.addRoot("Line 1");
      store.setText(id, "Line 1\nLine 2");
      expect(store.getNode(id).text).toBe("Line 1\nLine 2");
    });
  });

  describe("setNodePosition", () => {
    test("updates node x and y", () => {
      const id = store.addRoot("Root", 0, 0);
      store.setNodePosition(id, 150, 300);
      const node = store.getNode(id);
      expect(node.x).toBe(150);
      expect(node.y).toBe(300);
    });
  });

  describe("setNodeWidth", () => {
    test("sets width and marks as constrained", () => {
      const id = store.addRoot("Root");
      store.setNodeWidth(id, 200);
      const node = store.getNode(id);
      expect(node.width).toBe(200);
      expect(node.widthConstrained).toBe(true);
    });
  });

  describe("toggleCollapse", () => {
    test("toggles collapsed state", () => {
      const id = store.addRoot("Root");
      expect(store.getNode(id).collapsed).toBe(false);
      store.toggleCollapse(id);
      expect(store.getNode(id).collapsed).toBe(true);
      store.toggleCollapse(id);
      expect(store.getNode(id).collapsed).toBe(false);
    });
  });

  describe("moveNode (reparent)", () => {
    test("moves a node to a new parent", () => {
      const r = store.addRoot("Root");
      const c1 = store.addChild(r, "C1");
      const c2 = store.addChild(r, "C2");
      store.addChild(c1, "GC1");

      store.moveNode(c2, c1);
      expect(store.getNode(c2).parentId).toBe(c1);
      expect(store.getNode(c1).children).toContain(c2);
      expect(store.getNode(r).children).not.toContain(c2);
    });

    test("moves a node to a specific index in new parent", () => {
      const r = store.addRoot("Root");
      const c1 = store.addChild(r, "C1");
      const c2 = store.addChild(r, "C2");
      const gc1 = store.addChild(c1, "GC1");

      store.moveNode(c2, c1, 0);
      expect(store.getNode(c1).children).toEqual([c2, gc1]);
    });

    test("prevents moving a node to its own descendant", () => {
      const r = store.addRoot("Root");
      const c1 = store.addChild(r, "C1");
      const gc1 = store.addChild(c1, "GC1");
      expect(() => store.moveNode(c1, gc1)).toThrow();
    });

    test("prevents moving a node to itself", () => {
      const r = store.addRoot("Root");
      const c1 = store.addChild(r, "C1");
      expect(() => store.moveNode(c1, c1)).toThrow();
    });
  });

  describe("reorderNode", () => {
    test("moves node up among siblings", () => {
      const r = store.addRoot("Root");
      const c1 = store.addChild(r, "C1");
      const c2 = store.addChild(r, "C2");
      const c3 = store.addChild(r, "C3");
      store.reorderNode(c2, "up");
      expect(store.getNode(r).children).toEqual([c2, c1, c3]);
    });

    test("moves node down among siblings", () => {
      const r = store.addRoot("Root");
      const c1 = store.addChild(r, "C1");
      const c2 = store.addChild(r, "C2");
      const c3 = store.addChild(r, "C3");
      store.reorderNode(c2, "down");
      expect(store.getNode(r).children).toEqual([c1, c3, c2]);
    });

    test("no-op when moving first child up", () => {
      const r = store.addRoot("Root");
      const c1 = store.addChild(r, "C1");
      const c2 = store.addChild(r, "C2");
      store.reorderNode(c1, "up");
      expect(store.getNode(r).children).toEqual([c1, c2]);
    });

    test("no-op when moving last child down", () => {
      const r = store.addRoot("Root");
      const c1 = store.addChild(r, "C1");
      const c2 = store.addChild(r, "C2");
      store.reorderNode(c2, "down");
      expect(store.getNode(r).children).toEqual([c1, c2]);
    });

    test("no-op on root nodes", () => {
      const r = store.addRoot("Root");
      store.reorderNode(r, "up");
      // Should not throw, just be a no-op
      expect(store.getRoots().map((n) => n.id)).toEqual([r]);
    });
  });

  describe("tree traversal", () => {
    test("getChildren returns ordered children", () => {
      const r = store.addRoot("Root");
      const c1 = store.addChild(r, "C1");
      const c2 = store.addChild(r, "C2");
      const children = store.getChildren(r);
      expect(children.map((n) => n.id)).toEqual([c1, c2]);
    });

    test("getParent returns parent node", () => {
      const r = store.addRoot("Root");
      const c1 = store.addChild(r, "C1");
      expect(store.getParent(c1)?.id).toBe(r);
    });

    test("getParent returns null for root nodes", () => {
      const r = store.addRoot("Root");
      expect(store.getParent(r)).toBeNull();
    });

    test("getSiblings returns all siblings including self", () => {
      const r = store.addRoot("Root");
      const c1 = store.addChild(r, "C1");
      const c2 = store.addChild(r, "C2");
      const c3 = store.addChild(r, "C3");
      const siblings = store.getSiblings(c2);
      expect(siblings.map((n) => n.id)).toEqual([c1, c2, c3]);
    });

    test("getSiblings of root returns all roots", () => {
      const r1 = store.addRoot("R1");
      const r2 = store.addRoot("R2");
      const siblings = store.getSiblings(r1);
      expect(siblings.map((n) => n.id)).toEqual([r1, r2]);
    });

    test("getAncestors returns path from node to root", () => {
      const r = store.addRoot("Root");
      const c1 = store.addChild(r, "C1");
      const gc1 = store.addChild(c1, "GC1");
      const ancestors = store.getAncestors(gc1);
      expect(ancestors.map((n) => n.id)).toEqual([c1, r]);
    });

    test("getAncestors of root returns empty array", () => {
      const r = store.addRoot("Root");
      expect(store.getAncestors(r)).toEqual([]);
    });

    test("getVisibleNodes excludes children of collapsed nodes", () => {
      const r = store.addRoot("Root");
      const c1 = store.addChild(r, "C1");
      store.addChild(c1, "GC1");
      store.addChild(c1, "GC2");
      store.toggleCollapse(c1);
      const visible = store.getVisibleNodes();
      expect(visible.map((n) => n.id)).toContain(r);
      expect(visible.map((n) => n.id)).toContain(c1);
      expect(visible).toHaveLength(2);
    });

    test("getVisibleNodes includes all nodes when nothing collapsed", () => {
      const r = store.addRoot("Root");
      const c1 = store.addChild(r, "C1");
      store.addChild(c1, "GC1");
      const visible = store.getVisibleNodes();
      expect(visible).toHaveLength(3);
    });

    test("getVisibleNodes spans all root trees", () => {
      const r1 = store.addRoot("R1");
      const r2 = store.addRoot("R2");
      store.addChild(r1, "C1");
      store.addChild(r2, "C2");
      const visible = store.getVisibleNodes();
      expect(visible).toHaveLength(4);
    });
  });

  describe("isDescendant", () => {
    test("returns true for child", () => {
      const r = store.addRoot("Root");
      const c1 = store.addChild(r, "C1");
      expect(store.isDescendant(c1, r)).toBe(true);
    });

    test("returns true for grandchild", () => {
      const r = store.addRoot("Root");
      const c1 = store.addChild(r, "C1");
      const gc1 = store.addChild(c1, "GC1");
      expect(store.isDescendant(gc1, r)).toBe(true);
    });

    test("returns false for unrelated nodes", () => {
      const r = store.addRoot("Root");
      const c1 = store.addChild(r, "C1");
      const c2 = store.addChild(r, "C2");
      expect(store.isDescendant(c1, c2)).toBe(false);
    });

    test("returns false for self", () => {
      const r = store.addRoot("Root");
      expect(store.isDescendant(r, r)).toBe(false);
    });
  });
});
