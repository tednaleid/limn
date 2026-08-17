// ABOUTME: Tests for note routing: the pure view-type decision and the WorkspaceLeaf.setViewState wrapper.
// ABOUTME: Uses the obsidian runtime stand-in so the real monkey-around wrapper is exercised.

import { describe, it, expect, beforeEach } from "vitest";
import { WorkspaceLeaf, TFile, TextFileView } from "obsidian";
import type LimnPlugin from "../main";
import { resolveViewType, hasMindMapMarker, VIEW_TYPE_LIMN_MARKDOWN, MARKDOWN_VIEW_TYPE } from "../markdown/routing";
import { installRoutingPatch, rememberChoice, openLeafAs, openFileAs, type LeafChoices } from "../markdown/leafRouting";

// The real obsidian typings don't declare `lastState` (it's a test-only recorder added by the
// runtime stand-in), so leaves that read or write it are cast to this shape.
type MockLeaf = WorkspaceLeaf & { lastState: unknown };

const base = { filePath: "a.md", hasMarker: true, openMarkedNotesAs: "mindmap" as const, chosenType: undefined };

describe("resolveViewType", () => {
  it("routes marked notes to the map and unmarked notes to Markdown", () => {
    expect(resolveViewType({ ...base, requestedType: MARKDOWN_VIEW_TYPE })).toBe(VIEW_TYPE_LIMN_MARKDOWN);
    expect(resolveViewType({ ...base, requestedType: MARKDOWN_VIEW_TYPE, hasMarker: false })).toBe(MARKDOWN_VIEW_TYPE);
    expect(resolveViewType({ ...base, requestedType: VIEW_TYPE_LIMN_MARKDOWN, hasMarker: false })).toBe(MARKDOWN_VIEW_TYPE);
    expect(resolveViewType({ ...base, requestedType: VIEW_TYPE_LIMN_MARKDOWN })).toBe(VIEW_TYPE_LIMN_MARKDOWN);
  });

  it("honors the setting to keep marked notes in Markdown, without forcing restored map leaves back", () => {
    expect(resolveViewType({ ...base, requestedType: MARKDOWN_VIEW_TYPE, openMarkedNotesAs: "markdown" })).toBe(MARKDOWN_VIEW_TYPE);
    expect(resolveViewType({ ...base, requestedType: VIEW_TYPE_LIMN_MARKDOWN, openMarkedNotesAs: "markdown" })).toBe(VIEW_TYPE_LIMN_MARKDOWN);
  });

  it("lets an explicit choice win in both directions", () => {
    expect(resolveViewType({ ...base, requestedType: MARKDOWN_VIEW_TYPE, chosenType: MARKDOWN_VIEW_TYPE })).toBe(MARKDOWN_VIEW_TYPE);
    expect(resolveViewType({ ...base, requestedType: MARKDOWN_VIEW_TYPE, hasMarker: false, chosenType: VIEW_TYPE_LIMN_MARKDOWN })).toBe(VIEW_TYPE_LIMN_MARKDOWN);
  });

  it("leaves other files and other view types alone", () => {
    expect(resolveViewType({ ...base, requestedType: MARKDOWN_VIEW_TYPE, filePath: "map.limn" })).toBe(MARKDOWN_VIEW_TYPE);
    expect(resolveViewType({ ...base, requestedType: MARKDOWN_VIEW_TYPE, filePath: undefined })).toBe(MARKDOWN_VIEW_TYPE);
    expect(resolveViewType({ ...base, requestedType: "kanban" })).toBe("kanban");
  });
});

describe("hasMindMapMarker", () => {
  it("is true for a truthy limn-plugin key only", () => {
    expect(hasMindMapMarker({ "limn-plugin": true })).toBe(true);
    expect(hasMindMapMarker({ "limn-plugin": false })).toBe(false);
    expect(hasMindMapMarker({ tags: ["x"] })).toBe(false);
    expect(hasMindMapMarker(undefined)).toBe(false);
  });
});

describe("installRoutingPatch", () => {
  const frontmatter = new Map<string, Record<string, unknown> | undefined>();
  let leafChoices: LeafChoices;
  let plugin: LimnPlugin;
  let uninstall: () => void;

  beforeEach(() => {
    frontmatter.clear();
    frontmatter.set("marked.md", { "limn-plugin": true });
    frontmatter.set("plain.md", { tags: [] });
    leafChoices = new WeakMap();
    plugin = {
      settings: { openMarkedNotesAs: "mindmap" },
      leafChoices,
      app: { metadataCache: { getCache: (path: string) => ({ frontmatter: frontmatter.get(path) }) } },
    } as unknown as LimnPlugin;
    uninstall = installRoutingPatch(plugin);
  });

  it("rewrites the view type through the wrapper and stops after uninstall", async () => {
    const leaf = new WorkspaceLeaf() as MockLeaf;
    await leaf.setViewState({ type: "markdown", state: { file: "marked.md" } });
    expect(leaf.lastState).toEqual({ type: VIEW_TYPE_LIMN_MARKDOWN, state: { file: "marked.md" } });
    await leaf.setViewState({ type: "markdown", state: { file: "plain.md" } });
    expect(leaf.lastState).toEqual({ type: "markdown", state: { file: "plain.md" } });
    uninstall();
    await leaf.setViewState({ type: "markdown", state: { file: "marked.md" } });
    expect(leaf.lastState).toEqual({ type: "markdown", state: { file: "marked.md" } });
  });

  it("uses the remembered choice for that note in that leaf only", async () => {
    const leaf = new WorkspaceLeaf() as MockLeaf;
    const other = new WorkspaceLeaf() as MockLeaf;
    rememberChoice(leafChoices, leaf, "marked.md", MARKDOWN_VIEW_TYPE);
    await leaf.setViewState({ type: "markdown", state: { file: "marked.md" } });
    expect((leaf.lastState as { type: string }).type).toBe("markdown");
    await other.setViewState({ type: "markdown", state: { file: "marked.md" } });
    expect((other.lastState as { type: string }).type).toBe(VIEW_TYPE_LIMN_MARKDOWN);
    await leaf.setViewState({ type: "markdown", state: { file: "plain.md" } });
    expect((leaf.lastState as { type: string }).type).toBe("markdown");
    uninstall();
  });

  it("openLeafAs saves the current view, remembers the choice, and switches the leaf", async () => {
    const leaf = new WorkspaceLeaf() as MockLeaf;
    let saved = 0;
    // TextFileView is abstract in the real typings; the runtime stand-in is concrete, so the
    // constructor is called through a cast rather than `new TextFileView(leaf)` directly.
    const TextFileViewCtor = TextFileView as unknown as new (leaf: WorkspaceLeaf) => TextFileView;
    leaf.view = Object.assign(new TextFileViewCtor(leaf), { save: () => { saved++; return Promise.resolve(); } });
    leaf.lastState = { type: VIEW_TYPE_LIMN_MARKDOWN, state: { file: "marked.md" } };
    await openLeafAs(plugin, leaf, MARKDOWN_VIEW_TYPE);
    expect(saved).toBe(1);
    expect(leafChoices.get(leaf)?.get("marked.md")).toBe(MARKDOWN_VIEW_TYPE);
    expect(leaf.lastState).toEqual({ type: MARKDOWN_VIEW_TYPE, state: { file: "marked.md" } });
    uninstall();
  });

  it("openFileAs remembers the choice on the target leaf and opens the file there", async () => {
    const leaf = new WorkspaceLeaf();
    let opened: unknown = null;
    leaf.openFile = (file: unknown) => { opened = file; return Promise.resolve(); };
    const file = Object.assign(new TFile(), { path: "plain.md", extension: "md" });
    await openFileAs(plugin, file, leaf, VIEW_TYPE_LIMN_MARKDOWN);
    expect(leafChoices.get(leaf)?.get("plain.md")).toBe(VIEW_TYPE_LIMN_MARKDOWN);
    expect(opened).toBe(file);
    uninstall();
  });
});
