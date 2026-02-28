// ABOUTME: Width and image resize state machines for mind map nodes.
// ABOUTME: Pure functions operating on WidthResizeState and ImageResizeState.

import type { MindMapNode } from "../model/types";

export const MIN_NODE_WIDTH = 60;
export const MIN_IMAGE_WIDTH = 40;

/** Consolidated width resize state. */
export interface WidthResizeState {
  active: boolean;
  nodeId: string | null;
  startWidth: number;
  changed: boolean;
}

export function initialWidthResizeState(): WidthResizeState {
  return { active: false, nodeId: null, startWidth: 0, changed: false };
}

/** Initialize width resize from a node. */
export function initWidthResize(node: MindMapNode): WidthResizeState {
  return {
    active: true,
    nodeId: node.id,
    startWidth: node.width,
    changed: false,
  };
}

/** Clamp a width value to the minimum node width. */
export function clampNodeWidth(newWidth: number): number {
  return Math.max(MIN_NODE_WIDTH, newWidth);
}

/** Consolidated image resize state. */
export interface ImageResizeState {
  active: boolean;
  nodeId: string | null;
  aspectRatio: number;
  changed: boolean;
}

export function initialImageResizeState(): ImageResizeState {
  return { active: false, nodeId: null, aspectRatio: 1, changed: false };
}

/** Initialize image resize from a node. Returns null if node has no image. */
export function initImageResize(node: MindMapNode): ImageResizeState | null {
  if (!node.image) return null;
  return {
    active: true,
    nodeId: node.id,
    aspectRatio: node.image.height / node.image.width,
    changed: false,
  };
}

/** Compute clamped image dimensions preserving aspect ratio. */
export function computeImageResize(
  aspectRatio: number,
  newWidth: number,
): { width: number; height: number } {
  const clampedWidth = Math.max(MIN_IMAGE_WIDTH, Math.round(newWidth));
  const newHeight = Math.round(clampedWidth * aspectRatio);
  return { width: clampedWidth, height: newHeight };
}
