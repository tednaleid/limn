// ABOUTME: Describes which presentation features a document's backing store can hold.
// ABOUTME: Hosts set this once per document; the Editor and dispatch consult it.

export interface DocumentCapabilities {
  /** Free drag offsets, nudge, and setNodePosition. Off means layout is always canonical. */
  freePosition: boolean;
  /** Children may sit left of a root; side flips are meaningful. */
  sides: boolean;
  /** Users may constrain a node's text width. */
  widthResize: boolean;
  /** Users may pick per-node branch colors. */
  nodeColor: boolean;
  /** Collapse state survives a save/load cycle in this store. */
  collapsePersisted: boolean;
}

export const FULL_CAPABILITIES: DocumentCapabilities = {
  freePosition: true,
  sides: true,
  widthResize: true,
  nodeColor: true,
  collapsePersisted: true,
};

/** A Markdown nested list: structure and text only; collapse rides on the bullet marker. */
export const OUTLINE_CAPABILITIES: DocumentCapabilities = {
  freePosition: false,
  sides: false,
  widthResize: false,
  nodeColor: false,
  collapsePersisted: true,
};
