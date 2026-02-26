// ABOUTME: Serialize/deserialize between flat MindMapStore and nested file format.
// ABOUTME: Also provides markdown export and file format validation.

import type { MindMapNode, MindMapMeta } from "../model/types";
import { MindMapStore } from "../store/MindMapStore";
import type { MindMapFileFormat, MindMapFileNode } from "./schema";
import { mindMapFileSchema } from "./schema";

/**
 * Deserialize nested file format into a flat MindMapStore.
 * parentId is inferred from nesting, not stored in the file.
 */
export function deserialize(file: MindMapFileFormat): MindMapStore {
  const store = new MindMapStore();

  function loadNode(fileNode: MindMapFileNode, parentId: string | null): void {
    store.loadNode({
      id: fileNode.id,
      parentId,
      text: fileNode.text,
      children: fileNode.children.map((c) => c.id),
      collapsed: fileNode.collapsed ?? false,
      x: fileNode.x,
      y: fileNode.y,
      width: fileNode.width,
      height: fileNode.height,
      widthConstrained: fileNode.widthConstrained ?? false,
      style: fileNode.style,
      image: fileNode.image,
    });

    for (const child of fileNode.children) {
      loadNode(child, fileNode.id);
    }
  }

  for (const root of file.roots) {
    loadNode(root, null);
    store.addRootId(root.id);
  }

  return store;
}

/**
 * Serialize a flat MindMapStore into the nested file format.
 */
export function serialize(
  store: MindMapStore,
  meta: MindMapMeta,
  camera = { x: 0, y: 0, zoom: 1 },
): MindMapFileFormat {
  function serializeNode(node: MindMapNode): MindMapFileNode {
    const fileNode: MindMapFileNode = {
      id: node.id,
      text: node.text,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      children: store.getChildren(node.id).map(serializeNode),
    };

    if (node.collapsed) fileNode.collapsed = true;
    if (node.widthConstrained) fileNode.widthConstrained = true;
    if (node.style) fileNode.style = node.style;
    if (node.image) fileNode.image = node.image;

    return fileNode;
  }

  return {
    version: meta.version,
    meta: { id: meta.id, theme: meta.theme },
    camera,
    roots: store.getRoots().map(serializeNode),
    assets: [],
  };
}

/**
 * Validate raw JSON against the file format schema.
 */
export function validateFileFormat(data: unknown): {
  success: boolean;
  error?: string;
} {
  const result = mindMapFileSchema.safeParse(data);
  if (result.success) {
    return { success: true };
  }
  return { success: false, error: String(result.error) };
}

/**
 * Export a MindMapStore as a markdown outline.
 * Roots become H1, depth 1 becomes H2, depth 2+ becomes bullet points.
 */
export function toMarkdown(store: MindMapStore): string {
  const lines: string[] = [];

  function renderNode(node: MindMapNode, depth: number): void {
    if (depth === 0) {
      lines.push(`# ${node.text}`);
    } else if (depth === 1) {
      lines.push(`## ${node.text}`);
    } else {
      const indent = "  ".repeat(depth - 2);
      lines.push(`${indent}- ${node.text}`);
    }

    for (const childId of node.children) {
      renderNode(store.getNode(childId), depth + 1);
    }
  }

  for (const root of store.getRoots()) {
    renderNode(root, 0);
  }

  return lines.join("\n");
}
