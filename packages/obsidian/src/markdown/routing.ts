// ABOUTME: Decides which view type a leaf should use for a Markdown note: Obsidian's editor or the mind map.
// ABOUTME: Pure decision logic; leafRouting.ts feeds it from the WorkspaceLeaf wrapper and applies the answer.

import type { OpenMarkedNotesAs } from "../settings";

export const VIEW_TYPE_LIMN_MARKDOWN = "limn-markdown-view";
export const MARKDOWN_VIEW_TYPE = "markdown";
/** Frontmatter key that marks a note as a mind map. */
export const MARKER_KEY = "limn-plugin";

export type NoteViewType = typeof VIEW_TYPE_LIMN_MARKDOWN | typeof MARKDOWN_VIEW_TYPE;

/** True when frontmatter marks the note as a mind map (a truthy `limn-plugin`). */
export function hasMindMapMarker(frontmatter: Record<string, unknown> | undefined): boolean {
  return Boolean(frontmatter?.[MARKER_KEY]);
}

export interface RoutingInput {
  requestedType: string;
  filePath: string | undefined;
  hasMarker: boolean;
  openMarkedNotesAs: OpenMarkedNotesAs;
  /** The user's explicit "Open as ..." choice for this note in this leaf, if any. */
  chosenType: NoteViewType | undefined;
}

/**
 * The view type to actually open. Only Markdown notes requested as `markdown` or as the map view are
 * touched; an explicit choice wins, then the marker and the setting decide in both directions.
 */
export function resolveViewType(input: RoutingInput): string {
  const { requestedType, filePath, hasMarker, openMarkedNotesAs, chosenType } = input;
  if (requestedType !== MARKDOWN_VIEW_TYPE && requestedType !== VIEW_TYPE_LIMN_MARKDOWN) return requestedType;
  if (filePath === undefined || !filePath.endsWith(".md")) return requestedType;
  if (chosenType) return chosenType;
  if (requestedType === MARKDOWN_VIEW_TYPE && hasMarker && openMarkedNotesAs === "mindmap") return VIEW_TYPE_LIMN_MARKDOWN;
  if (requestedType === VIEW_TYPE_LIMN_MARKDOWN && !hasMarker) return MARKDOWN_VIEW_TYPE;
  return requestedType;
}
