// ABOUTME: Re-attaches existing node ids to a freshly parsed forest by matching per parent.
// ABOUTME: Lets external updates keep selection and edit state for nodes that survived.

import type { MindMapNode } from "../model/types";
import type { MindMapStore } from "../store/MindMapStore";
import type { MindMapFileNode } from "./schema";

/**
 * For each parent, match incoming children to existing children first by exact text
 * (first unused sibling), then by index. Matched nodes take the existing id and recurse;
 * unmatched nodes keep the fresh ids they arrived with.
 */
export function reconcileIds(store: MindMapStore, incoming: MindMapFileNode[]): MindMapFileNode[] {
  return reconcileLevel(store, store.getRoots(), incoming);
}

function reconcileLevel(
  store: MindMapStore,
  existing: MindMapNode[],
  incoming: MindMapFileNode[],
): MindMapFileNode[] {
  const used = new Set<string>();
  const matches: (MindMapNode | undefined)[] = incoming.map(() => undefined);

  incoming.forEach((node, i) => {
    const hit = existing.find((e) => !used.has(e.id) && e.text === node.text);
    if (hit) {
      used.add(hit.id);
      matches[i] = hit;
    }
  });

  incoming.forEach((_node, i) => {
    if (matches[i]) return;
    const candidate = existing[i];
    if (candidate && !used.has(candidate.id)) {
      used.add(candidate.id);
      matches[i] = candidate;
    }
  });

  return incoming.map((node, i) => {
    const hit = matches[i];
    if (!hit) return node;
    return {
      ...node,
      id: hit.id,
      children: reconcileLevel(store, store.getChildren(hit.id), node.children),
    };
  });
}
