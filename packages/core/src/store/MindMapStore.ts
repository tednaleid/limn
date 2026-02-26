// ABOUTME: Flat map-based store for mind map nodes.
// ABOUTME: Provides tree operations maintaining structural invariants.

import type { MindMapNode } from "../model/types";

let nextIdCounter = 0;

function generateId(): string {
  return `n${nextIdCounter++}`;
}

/** Reset ID counter (for test determinism). */
export function resetIdCounter(): void {
  nextIdCounter = 0;
}

const DEFAULT_WIDTH = 100;
const DEFAULT_HEIGHT = 32;

export class MindMapStore {
  private nodes: Map<string, MindMapNode> = new Map();
  private rootIds: string[] = [];

  get nodeCount(): number {
    return this.nodes.size;
  }

  getNode(id: string): MindMapNode {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Node not found: ${id}`);
    return node;
  }

  getRoots(): MindMapNode[] {
    return this.rootIds.map((id) => this.getNode(id));
  }

  getAllNodes(): MindMapNode[] {
    return Array.from(this.nodes.values());
  }

  getChildren(id: string): MindMapNode[] {
    const node = this.getNode(id);
    return node.children.map((childId) => this.getNode(childId));
  }

  getParent(id: string): MindMapNode | null {
    const node = this.getNode(id);
    if (node.parentId === null) return null;
    return this.getNode(node.parentId);
  }

  getSiblings(id: string): MindMapNode[] {
    const node = this.getNode(id);
    if (node.parentId === null) {
      return this.getRoots();
    }
    return this.getChildren(node.parentId);
  }

  getAncestors(id: string): MindMapNode[] {
    const ancestors: MindMapNode[] = [];
    let current = this.getNode(id);
    while (current.parentId !== null) {
      current = this.getNode(current.parentId);
      ancestors.push(current);
    }
    return ancestors;
  }

  getVisibleNodes(): MindMapNode[] {
    const visible: MindMapNode[] = [];
    const visit = (id: string) => {
      const node = this.getNode(id);
      visible.push(node);
      if (!node.collapsed) {
        for (const childId of node.children) {
          visit(childId);
        }
      }
    };
    for (const rootId of this.rootIds) {
      visit(rootId);
    }
    return visible;
  }

  isDescendant(nodeId: string, ancestorId: string): boolean {
    if (nodeId === ancestorId) return false;
    let current = this.getNode(nodeId);
    while (current.parentId !== null) {
      if (current.parentId === ancestorId) return true;
      current = this.getNode(current.parentId);
    }
    return false;
  }

  addRoot(text = "", x = 0, y = 0): string {
    const id = generateId();
    const node: MindMapNode = {
      id,
      parentId: null,
      text,
      children: [],
      collapsed: false,
      x,
      y,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      widthConstrained: false,
    };
    this.nodes.set(id, node);
    this.rootIds.push(id);
    return id;
  }

  addChild(parentId: string, text = ""): string {
    const parent = this.getNode(parentId);
    const id = generateId();
    const node: MindMapNode = {
      id,
      parentId,
      text,
      children: [],
      collapsed: false,
      x: parent.x + 250,
      y: parent.y,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      widthConstrained: false,
    };
    this.nodes.set(id, node);
    parent.children.push(id);
    return id;
  }

  insertChild(parentId: string, index: number, text = ""): string {
    const parent = this.getNode(parentId);
    const id = generateId();
    const node: MindMapNode = {
      id,
      parentId,
      text,
      children: [],
      collapsed: false,
      x: parent.x + 250,
      y: parent.y,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      widthConstrained: false,
    };
    this.nodes.set(id, node);
    const insertAt = Math.min(index, parent.children.length);
    parent.children.splice(insertAt, 0, id);
    return id;
  }

  deleteNode(nodeId: string): void {
    const node = this.getNode(nodeId);

    // Recursively delete all descendants
    const deleteSubtree = (id: string) => {
      const n = this.getNode(id);
      for (const childId of n.children) {
        deleteSubtree(childId);
      }
      this.nodes.delete(id);
    };

    // Remove from parent's children list
    if (node.parentId !== null) {
      const parent = this.getNode(node.parentId);
      parent.children = parent.children.filter((id) => id !== nodeId);
    } else {
      // Remove from roots list
      this.rootIds = this.rootIds.filter((id) => id !== nodeId);
    }

    deleteSubtree(nodeId);
  }

  setText(nodeId: string, text: string): void {
    const node = this.getNode(nodeId);
    node.text = text;
  }

  setNodePosition(nodeId: string, x: number, y: number): void {
    const node = this.getNode(nodeId);
    node.x = x;
    node.y = y;
  }

  setNodeWidth(nodeId: string, width: number): void {
    const node = this.getNode(nodeId);
    node.width = width;
    node.widthConstrained = true;
  }

  toggleCollapse(nodeId: string): void {
    const node = this.getNode(nodeId);
    node.collapsed = !node.collapsed;
  }

  moveNode(nodeId: string, newParentId: string, index?: number): void {
    if (nodeId === newParentId) {
      throw new Error("Cannot move a node to itself");
    }
    if (this.isDescendant(newParentId, nodeId)) {
      throw new Error("Cannot move a node to one of its descendants");
    }

    const node = this.getNode(nodeId);
    const newParent = this.getNode(newParentId);

    // Remove from old parent
    if (node.parentId !== null) {
      const oldParent = this.getNode(node.parentId);
      oldParent.children = oldParent.children.filter((id) => id !== nodeId);
    } else {
      this.rootIds = this.rootIds.filter((id) => id !== nodeId);
    }

    // Add to new parent
    node.parentId = newParentId;
    if (index !== undefined) {
      const insertAt = Math.min(index, newParent.children.length);
      newParent.children.splice(insertAt, 0, nodeId);
    } else {
      newParent.children.push(nodeId);
    }
  }

  reorderNode(nodeId: string, direction: "up" | "down"): void {
    const node = this.getNode(nodeId);
    if (node.parentId === null) return; // No-op for root nodes

    const parent = this.getNode(node.parentId);
    const idx = parent.children.indexOf(nodeId);
    if (idx === -1) return;

    if (direction === "up" && idx > 0) {
      const swapIdx = idx - 1;
      const temp = parent.children[swapIdx];
      parent.children[swapIdx] = parent.children[idx];
      parent.children[idx] = temp;
    } else if (direction === "down" && idx < parent.children.length - 1) {
      const swapIdx = idx + 1;
      const temp = parent.children[swapIdx];
      parent.children[swapIdx] = parent.children[idx];
      parent.children[idx] = temp;
    }
  }
}
