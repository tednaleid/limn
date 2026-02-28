// ABOUTME: EasyMotion jump-to-node feature with distance-sorted label assignment.
// ABOUTME: Pure functions operating on EasyMotionState plus a label generation utility.

import type { MindMapNode } from "../model/types";

/** Consolidated EasyMotion state. */
export interface EasyMotionState {
  active: boolean;
  byLabel: Map<string, string>; // label -> nodeId
  byNode: Map<string, string>; // nodeId -> label
  buffer: string;
  prefixes: Set<string>;
}

export function initialEasyMotionState(): EasyMotionState {
  return {
    active: false,
    byLabel: new Map(),
    byNode: new Map(),
    buffer: "",
    prefixes: new Set(),
  };
}

/** Generate easymotion labels for a distance-sorted list of node IDs.
 *  Returns a Map from label string to node ID. Nodes earlier in the array
 *  (closer) get shorter labels. */
export function generateEasyMotionLabels(nodeIds: string[]): Map<string, string> {
  const result = new Map<string, string>();
  const n = nodeIds.length;
  if (n === 0) return result;

  // Number of prefix letters needed for double-char labels
  const P = n <= 26 ? 0 : Math.min(26, Math.ceil((n - 26) / 25));
  const singleCount = 26 - P;

  // Single-char labels: skip the first P letters (reserved as prefixes)
  let nodeIdx = 0;
  for (let i = 0; i < singleCount && nodeIdx < n; i++) {
    const label = String.fromCharCode(97 + P + i); // 'a' + P + i
    const id = nodeIds[nodeIdx++];
    if (id !== undefined) result.set(label, id);
  }

  // Double-char labels: each prefix letter followed by a-z
  for (let p = 0; p < P && nodeIdx < n; p++) {
    const prefix = String.fromCharCode(97 + p); // 'a' + p
    for (let s = 0; s < 26 && nodeIdx < n; s++) {
      const label = prefix + String.fromCharCode(97 + s);
      const id = nodeIds[nodeIdx++];
      if (id !== undefined) result.set(label, id);
    }
  }

  return result;
}

/** Result of handling an easymotion key press. */
export interface EasyMotionKeyResult {
  state: EasyMotionState;
  selectedNodeId: string | null;
}

/** Compute EasyMotion state from visible nodes sorted by distance from a reference point.
 *  Returns inactive state if there are no candidates. */
export function enterEasyMotion(
  visibleNodes: MindMapNode[],
  selectedId: string | null,
  refX: number,
  refY: number,
): EasyMotionState {
  // Filter out the selected node
  const candidates = selectedId
    ? visibleNodes.filter((n) => n.id !== selectedId)
    : visibleNodes;

  if (candidates.length === 0) return initialEasyMotionState();

  // Sort by distance from reference point
  candidates.sort((a, b) => {
    const da = Math.hypot(a.x + a.width / 2 - refX, a.y + a.height / 2 - refY);
    const db = Math.hypot(b.x + b.width / 2 - refX, b.y + b.height / 2 - refY);
    return da - db;
  });

  const nodeIds = candidates.map((n) => n.id);
  const byLabel = generateEasyMotionLabels(nodeIds);

  const byNode = new Map<string, string>();
  for (const [label, id] of byLabel) {
    byNode.set(id, label);
  }

  // Collect single-char prefixes (letters that start double-char labels)
  const prefixes = new Set<string>();
  for (const label of byLabel.keys()) {
    if (label.length === 2) {
      prefixes.add(label.charAt(0));
    }
  }

  return { active: true, byLabel, byNode, buffer: "", prefixes };
}

/** Process a key press in easymotion mode.
 *  Returns new state and optionally the node ID to select. */
export function handleEasyMotionKey(state: EasyMotionState, key: string): EasyMotionKeyResult {
  if (!state.active) return { state, selectedNodeId: null };

  if (state.buffer === "") {
    // First character
    const nodeId = state.byLabel.get(key);
    if (nodeId) {
      // Single-char label match: select and exit
      return { state: initialEasyMotionState(), selectedNodeId: nodeId };
    }
    if (state.prefixes.has(key)) {
      // Valid prefix: buffer it and wait for second char
      return { state: { ...state, buffer: key }, selectedNodeId: null };
    }
    // Invalid key: cancel
    return { state: initialEasyMotionState(), selectedNodeId: null };
  }

  // Second character after prefix
  const fullLabel = state.buffer + key;
  const nodeId = state.byLabel.get(fullLabel);
  if (nodeId) {
    return { state: initialEasyMotionState(), selectedNodeId: nodeId };
  }
  // Invalid combo: cancel
  return { state: initialEasyMotionState(), selectedNodeId: null };
}
