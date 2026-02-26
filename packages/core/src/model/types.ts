// ABOUTME: Core data model types for MindForge.
// ABOUTME: Framework-agnostic interfaces shared by all packages.

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- placeholder for future font, size, color properties
export interface NodeStyle {}

export interface ImageRef {
  assetId: string;
  width: number;
  height: number;
}

export interface Asset {
  id: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface MindMapNode {
  id: string;
  parentId: string | null;
  text: string;
  children: string[];
  collapsed: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  widthConstrained: boolean;
  style?: NodeStyle;
  image?: ImageRef;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface MindMapMeta {
  id: string;
  version: number;
  theme: string;
}

export interface MindMap {
  roots: string[];
  nodes: Map<string, MindMapNode>;
  assets: Asset[];
  camera: Camera;
  meta: MindMapMeta;
}

export interface TextMeasurer {
  measure(text: string, style?: NodeStyle): { width: number; height: number };
  reflow(
    text: string,
    maxWidth: number,
    style?: NodeStyle,
  ): { width: number; height: number };
}
