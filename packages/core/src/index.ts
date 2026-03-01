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

export { CURRENT_FORMAT_VERSION } from "./serialization/schema";
export { migrateToLatest } from "./serialization/migration";

export { compressToUrl, decompressFromUrl } from "./export/url";

export {
  subtreeHeight,
  branchDirection,
  positionNewChild,
  positionNewSibling,
  centerChildren,
  shiftSubtree,
  reflowSubtree,
  relayoutSubtree,
  relayoutFromNode,
  relayoutAfterDelete,
  treeBoundingBox,
  resolveTreeOverlap,
  H_OFFSET,
  V_GAP,
} from "./layout/layout";

export { Editor, stubTextMeasurer, ROOT_FONT_SIZE } from "./editor/Editor";
export { nextBranchColorIndex } from "./theme/palette";
export type { ThemeDefinition, ThemeKey } from "./theme/theme";
export {
  THEME_REGISTRY,
  DEFAULT_LIGHT_THEME,
  DEFAULT_DARK_THEME,
  BRANCH_COUNT,
  resolveTheme,
  getThemesByMode,
} from "./theme/theme";
export type { DerivedThemeVars } from "./theme/derive";
export { deriveThemeVars, THEME_CSS_VARS } from "./theme/derive";
export { dispatch } from "./keybindings/dispatch";
export type { Modifiers } from "./keybindings/dispatch";
export { TestEditor } from "./test-editor/TestEditor";
export {
  parseInlineMarkdown,
  parseMarkdownLines,
  stripMarkdown,
  isPlainSegments,
} from "./markdown/inlineMarkdown";
export type { TextStyle, StyledSegment } from "./markdown/inlineMarkdown";

export { SHORTCUT_GROUPS } from "./keybindings/shortcutHelp";
export type { ShortcutEntry, ShortcutGroup } from "./keybindings/shortcutHelp";

export type { PersistenceProvider } from "./persistence/types";
export { AutoSaveController } from "./persistence/AutoSaveController";
export type { AutoSaveOptions } from "./persistence/AutoSaveController";
