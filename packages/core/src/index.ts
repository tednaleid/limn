// ABOUTME: Entry point for the Limn core engine.
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

export {
  serialize,
  deserialize,
  toMarkdown,
  validateFileFormat,
} from "./serialization/serialization";

export type {
  MindMapFileFormat,
  MindMapFileNode,
} from "./serialization/schema";

export { CURRENT_FORMAT_VERSION, migrateToLatest } from "./serialization/migration";

export { compressToUrl, decompressFromUrl } from "./export/url";

export {
  subtreeHeight,
  branchDirection,
  positionNewChild,
  positionNewSibling,
  centerChildren,
  shiftSubtree,
  reflowSubtree,
  relayoutFromNode,
  relayoutAfterDelete,
  treeBoundingBox,
  resolveTreeOverlap,
  H_OFFSET,
  V_GAP,
} from "./layout/layout";

export { Editor, stubTextMeasurer, ROOT_FONT_SIZE } from "./editor/Editor";
export { BRANCH_PALETTE, nextBranchColor } from "./theme/palette";
export { dispatch } from "./keybindings/dispatch";
export type { Modifiers } from "./keybindings/dispatch";
export { TestEditor } from "./test-editor/TestEditor";
