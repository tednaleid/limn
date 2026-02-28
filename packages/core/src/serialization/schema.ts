// ABOUTME: Zod schema for the .mindmap file format.
// ABOUTME: Validates file structure on load; defines file format types.

import { z } from "zod/v4";

/** Current file format version. Increment when the schema changes. */
export const CURRENT_FORMAT_VERSION = 1;

const imageRefSchema = z.object({
  assetId: z.string(),
  width: z.number(),
  height: z.number(),
});

const nodeStyleSchema = z.object({}).passthrough();

const fileNodeSchema: z.ZodType<MindMapFileNode> = z.object({
  id: z.string(),
  text: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  widthConstrained: z.boolean().optional(),
  collapsed: z.boolean().optional(),
  style: nodeStyleSchema.optional(),
  image: imageRefSchema.optional(),
  children: z.lazy(() => z.array(fileNodeSchema)),
});

const assetSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  width: z.number(),
  height: z.number(),
});

const cameraSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
});

const metaSchema = z.object({
  id: z.string(),
  theme: z.string(),
});

export const mindMapFileSchema = z.object({
  version: z.number(),
  meta: metaSchema,
  camera: cameraSchema,
  roots: z.array(fileNodeSchema),
  assets: z.array(assetSchema),
});

export interface MindMapFileNode {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  widthConstrained?: boolean;
  collapsed?: boolean;
  style?: Record<string, unknown>;
  image?: { assetId: string; width: number; height: number };
  children: MindMapFileNode[];
}

export interface MindMapFileFormat {
  version: number;
  meta: { id: string; theme: string };
  camera: { x: number; y: number; zoom: number };
  roots: MindMapFileNode[];
  assets: Array<{
    id: string;
    filename: string;
    mimeType: string;
    width: number;
    height: number;
  }>;
}
