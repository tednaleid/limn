// ABOUTME: Tests for the Markdown mind map commands' pure parts and app-only helpers.
// ABOUTME: Note naming, marker content, note creation in the right folder, and marker insertion.

import { describe, it, expect, vi } from "vitest";
import { TFile, WorkspaceLeaf } from "obsidian";
import type { App } from "obsidian";
import type LimnPlugin from "../main";
import { nextFreeNotePath, MARKED_NOTE_CONTENT, createMindMapNote, addMindMapMarker } from "../markdown/commands";
import { VIEW_TYPE_LIMN_MARKDOWN } from "../markdown/routing";

describe("nextFreeNotePath", () => {
  it("counts up from Untitled inside the folder, and handles the vault root", () => {
    const taken = new Set(["Untitled.md", "Untitled 1.md", "notes/Untitled.md"]);
    const exists = (p: string) => taken.has(p);
    expect(nextFreeNotePath("/", exists)).toBe("Untitled 2.md");
    expect(nextFreeNotePath("", exists)).toBe("Untitled 2.md");
    expect(nextFreeNotePath("notes", exists)).toBe("notes/Untitled 1.md");
    expect(nextFreeNotePath("other", exists)).toBe("other/Untitled.md");
  });
});

describe("MARKED_NOTE_CONTENT", () => {
  it("is frontmatter with the marker and nothing else", () => {
    expect(MARKED_NOTE_CONTENT).toBe("---\nlimn-plugin: true\n---\n");
  });
});

describe("createMindMapNote", () => {
  it("creates the marked note in the new-file folder and opens it as a map", async () => {
    const created: Array<{ path: string; content: string }> = [];
    const leaf = new WorkspaceLeaf();
    let opened: unknown = null;
    leaf.openFile = (file: unknown) => { opened = file; return Promise.resolve(); };
    const leafChoices = new WeakMap();
    const plugin = {
      leafChoices,
      app: {
        vault: {
          getAbstractFileByPath: (p: string) => (p === "notes/Untitled.md" ? {} : null),
          create: vi.fn((path: string, content: string) => {
            created.push({ path, content });
            return Promise.resolve(Object.assign(new TFile(), { path, extension: "md" }));
          }),
        },
        fileManager: { getNewFileParent: vi.fn(() => ({ path: "notes" })) },
        workspace: { getActiveFile: () => ({ path: "notes/current.md" }), getLeaf: () => leaf },
      },
    } as unknown as LimnPlugin;

    await createMindMapNote(plugin);

    expect(plugin.app.fileManager.getNewFileParent).toHaveBeenCalledWith("notes/current.md");
    expect(created).toEqual([{ path: "notes/Untitled 1.md", content: MARKED_NOTE_CONTENT }]);
    expect((opened as { path: string }).path).toBe("notes/Untitled 1.md");
    expect(leafChoices.get(leaf)?.get("notes/Untitled 1.md")).toBe(VIEW_TYPE_LIMN_MARKDOWN);
  });
});

describe("addMindMapMarker", () => {
  it("sets limn-plugin: true through processFrontMatter", async () => {
    const fm: Record<string, unknown> = { tags: ["x"] };
    const app = {
      fileManager: {
        processFrontMatter: vi.fn((_file: unknown, fn: (f: Record<string, unknown>) => void) => { fn(fm); return Promise.resolve(); }),
      },
    } as unknown as App;
    const file = Object.assign(new TFile(), { path: "a.md" });
    await addMindMapMarker(app, file);
    expect(fm).toEqual({ tags: ["x"], "limn-plugin": true });
  });
});
