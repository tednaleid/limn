// ABOUTME: Serialize/deserialize between flat MindMapStore and nested file format.
// ABOUTME: Also provides markdown export and file format validation.

import type { MindMapNode, MindMapMeta } from "../model/types";
import { MindMapStore } from "../store/MindMapStore";
import type { MindMapFileFormat, MindMapFileNode } from "./schema";
import { mindMapFileSchema, CURRENT_FORMAT_VERSION } from "./schema";
import type { OutlineNode } from "../markdown/outline";
import { writeSubtree, imageRefToOutline } from "../markdown/outline";

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
    if (node.style) fileNode.style = node.style as Record<string, unknown>;
    if (node.image) fileNode.image = node.image;

    return fileNode;
  }

  return {
    version: CURRENT_FORMAT_VERSION,
    meta: { id: meta.id, mode: meta.mode, lightTheme: meta.lightTheme, darkTheme: meta.darkTheme },
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
  return { success: false, error: result.error.message };
}

function nodeToOutline(store: MindMapStore, node: MindMapNode): OutlineNode {
  const outline: OutlineNode = {
    text: node.text,
    collapsed: node.collapsed && node.children.length > 0,
    children: store.getChildren(node.id).map((child) => nodeToOutline(store, child)),
  };
  if (node.image) outline.image = imageRefToOutline(node.image);
  return outline;
}

/** Nested bullet outline of the store in the Limn Markdown dialect. */
export function toMarkdown(store: MindMapStore): string {
  return writeSubtree(store.getRoots().map((root) => nodeToOutline(store, root)));
}

/** Nested bullet outline of one node and its descendants. */
export function subtreeToMarkdown(store: MindMapStore, nodeId: string): string {
  return writeSubtree([nodeToOutline(store, store.getNode(nodeId))]);
}
