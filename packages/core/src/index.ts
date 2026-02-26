// ABOUTME: Entry point for the MindForge core engine.
// ABOUTME: Framework-agnostic TS library with no React or browser dependencies.

export const VERSION = "0.0.1";

export type {
  MindMapNode,
  MindMap,
  MindMapMeta,
  Camera,
  Asset,
  ImageRef,
  NodeStyle,
  TextMeasurer,
} from "./model/types";

export { MindMapStore, resetIdCounter } from "./store/MindMapStore";
