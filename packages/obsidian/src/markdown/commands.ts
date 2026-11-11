// ABOUTME: Commands and menu items for Markdown-backed mind maps: open as map/Markdown, create, add marker.
// ABOUTME: Pure helpers and app-only functions are separate from the Obsidian wiring so they can be tested.

import { TFile, MarkdownView, type App, type Menu } from "obsidian";
import type LimnPlugin from "../main";
import { VIEW_TYPE_LIMN_MARKDOWN, MARKDOWN_VIEW_TYPE, MARKER_KEY, hasMindMapMarker, type NoteViewType } from "./routing";
import { openLeafAs, openFileAs } from "./leafRouting";

/** Body of a brand-new mind map note: the marker and nothing else. */
export const MARKED_NOTE_CONTENT = `---\n${MARKER_KEY}: true\n---\n`;

/** "Untitled.md", then "Untitled 1.md", ... inside the folder, whichever does not exist yet. */
export function nextFreePath(folder: string, extension: string, exists: (path: string) => boolean): string {
  const prefix = folder === "" || folder === "/" ? "" : `${folder}/`;
  let candidate = `${prefix}Untitled.${extension}`;
  for (let i = 1; exists(candidate); i++) candidate = `${prefix}Untitled ${i}.${extension}`;
  return candidate;
}

/** Create a marked note next to the active file (per Obsidian's new-file location) and open it as a map. */
export async function createMindMapNote(plugin: LimnPlugin): Promise<void> {
  const { app } = plugin;
  const folder = app.fileManager.getNewFileParent(app.workspace.getActiveFile()?.path ?? "");
  const path = nextFreePath(folder.path, "md", (p) => app.vault.getAbstractFileByPath(p) !== null);
  const file = await app.vault.create(path, MARKED_NOTE_CONTENT);
  await openFileAs(plugin, file, undefined, VIEW_TYPE_LIMN_MARKDOWN);
}

/** Add `limn-plugin: true` to the note's frontmatter, creating the frontmatter if needed. */
export async function addMindMapMarker(app: App, file: TFile): Promise<void> {
  await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
    frontmatter[MARKER_KEY] = true;
  });
}

/**
 * The views a note's file menu offers. A pane showing the note offers the other view. With no pane
 * (the file browser), a marked note offers both, since it opens as either depending on the setting;
 * an unmarked note opens as Markdown already, so it offers only the map.
 */
export function fileMenuViewTypes(leafViewType: string | undefined, hasMarker: boolean): NoteViewType[] {
  if (leafViewType === VIEW_TYPE_LIMN_MARKDOWN) return [MARKDOWN_VIEW_TYPE];
  if (leafViewType === undefined && hasMarker) return [VIEW_TYPE_LIMN_MARKDOWN, MARKDOWN_VIEW_TYPE];
  return [VIEW_TYPE_LIMN_MARKDOWN];
}

function addMenuItem(menu: Menu, title: string, icon: string, onClick: () => void): void {
  menu.addItem((item) => item.setTitle(title).setIcon(icon).onClick(onClick));
}

export function registerMarkdownCommands(plugin: LimnPlugin): void {
  const { app } = plugin;

  plugin.addCommand({
    id: "open-as-mindmap",
    name: "Open as mind map",
    checkCallback: (checking) => {
      const view = app.workspace.getActiveViewOfType(MarkdownView);
      if (!view?.file || view.file.extension !== "md") return false;
      if (!checking) void openLeafAs(plugin, view.leaf, VIEW_TYPE_LIMN_MARKDOWN);
      return true;
    },
  });

  plugin.addCommand({
    id: "open-as-markdown",
    name: "Open as Markdown",
    checkCallback: (checking) => {
      // The map view class is not imported here (it pulls in the React tree); the type id is enough.
      const leaf = app.workspace.getMostRecentLeaf();
      if (leaf?.view.getViewType() !== VIEW_TYPE_LIMN_MARKDOWN) return false;
      if (!checking) void openLeafAs(plugin, leaf, MARKDOWN_VIEW_TYPE);
      return true;
    },
  });

  plugin.addCommand({
    id: "create-mindmap-note",
    name: "Create new mind map note",
    callback: () => void createMindMapNote(plugin),
  });

  plugin.addCommand({
    id: "add-mindmap-marker",
    name: "Add mind map marker to note",
    checkCallback: (checking) => {
      const file = app.workspace.getActiveFile();
      if (!file || file.extension !== "md") return false;
      if (!checking) void addMindMapMarker(app, file);
      return true;
    },
  });

  plugin.registerEvent(app.workspace.on("file-menu", (menu, file, _source, leaf) => {
    if (!(file instanceof TFile) || file.extension !== "md") return;
    const hasMarker = hasMindMapMarker(app.metadataCache.getFileCache(file)?.frontmatter);
    for (const type of fileMenuViewTypes(leaf?.view.getViewType(), hasMarker)) {
      const [title, icon] = type === MARKDOWN_VIEW_TYPE ? ["Open as Markdown", "file-text"] : ["Open as mind map", "git-branch"];
      addMenuItem(menu, title, icon, () => void openFileAs(plugin, file, leaf, type));
    }
  }));

  plugin.registerEvent(app.workspace.on("editor-menu", (menu, _editor, info) => {
    if (!(info instanceof MarkdownView) || !info.file) return;
    addMenuItem(menu, "Open as mind map", "git-branch", () => void openLeafAs(plugin, info.leaf, VIEW_TYPE_LIMN_MARKDOWN));
  }));
}
