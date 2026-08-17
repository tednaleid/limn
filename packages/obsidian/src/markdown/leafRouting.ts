// ABOUTME: Routes notes between the Markdown editor and the mind map view by wrapping WorkspaceLeaf.setViewState.
// ABOUTME: Same technique as Kanban and Excalidraw; remembers explicit choices per note per leaf.

import { WorkspaceLeaf, TextFileView, type TFile, type ViewState } from "obsidian";
import { around } from "monkey-around";
import type LimnPlugin from "../main";
import { hasMindMapMarker, resolveViewType, type NoteViewType } from "./routing";

/** Explicit "Open as ..." choices, per leaf, keyed by note path. Entries die with the leaf. */
export type LeafChoices = WeakMap<WorkspaceLeaf, Map<string, NoteViewType>>;

export function rememberChoice(choices: LeafChoices, leaf: WorkspaceLeaf, path: string, type: NoteViewType): void {
  let byPath = choices.get(leaf);
  if (!byPath) {
    byPath = new Map();
    choices.set(leaf, byPath);
  }
  byPath.set(path, type);
}

export function filePathOf(state: ViewState): string | undefined {
  const file = state.state?.file;
  return typeof file === "string" ? file : undefined;
}

/** Wrap WorkspaceLeaf.prototype.setViewState so notes open in the right view. Returns the uninstaller. */
export function installRoutingPatch(plugin: LimnPlugin): () => void {
  return around(WorkspaceLeaf.prototype, {
    setViewState(next) {
      return function (this: WorkspaceLeaf, state: ViewState, eState?: unknown) {
        const filePath = filePathOf(state);
        const type = resolveViewType({
          requestedType: state.type,
          filePath,
          hasMarker: filePath !== undefined
            && hasMindMapMarker(plugin.app.metadataCache.getCache(filePath)?.frontmatter),
          openMarkedNotesAs: plugin.settings.openMarkedNotesAs,
          chosenType: filePath !== undefined ? plugin.leafChoices.get(this)?.get(filePath) : undefined,
        });
        return next.call(this, type === state.type ? state : { ...state, type }, eState);
      };
    },
  });
}

/** Switch the note a leaf shows between the Markdown editor and the map, remembering the choice. */
export async function openLeafAs(plugin: LimnPlugin, leaf: WorkspaceLeaf, type: NoteViewType): Promise<void> {
  const current = leaf.getViewState();
  const path = filePathOf(current);
  if (path === undefined) return;
  // MarkdownView and LimnMarkdownView are both TextFileViews; flush pending edits before switching.
  if (leaf.view instanceof TextFileView) await leaf.view.save();
  rememberChoice(plugin.leafChoices, leaf, path, type);
  await leaf.setViewState({ type, state: current.state });
}

/** Open a note in the given leaf (or a new one) as the requested view, remembering the choice. */
export async function openFileAs(plugin: LimnPlugin, file: TFile, leaf: WorkspaceLeaf | undefined, type: NoteViewType): Promise<void> {
  const target = leaf ?? plugin.app.workspace.getLeaf(false);
  rememberChoice(plugin.leafChoices, target, file.path, type);
  await target.openFile(file);
}
