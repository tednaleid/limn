// ABOUTME: Tests for the Markdown mind map commands' pure parts and app-only helpers.
// ABOUTME: Note naming, marker content, note creation in the right folder, and marker insertion.

import { describe, it, expect, vi } from "vitest";
import { TFile, WorkspaceLeaf } from "obsidian";
import type { App, Command } from "obsidian";
import type LimnPlugin from "../main";
import {
  nextFreeNotePath, MARKED_NOTE_CONTENT, createMindMapNote, addMindMapMarker, registerMarkdownCommands,
} from "../markdown/commands";
import { VIEW_TYPE_LIMN_MARKDOWN } from "../markdown/routing";

// The real obsidian typings don't declare `lastState` (it's a test-only recorder added by the
// runtime stand-in), so a leaf that reads it is cast to this shape.
type MockLeaf = WorkspaceLeaf & { lastState: unknown };

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

describe("registerMarkdownCommands: open-as-markdown", () => {
  it("only offers the command for a Limn map leaf, and checking never switches it", () => {
    const leaf = new WorkspaceLeaf() as MockLeaf;
    const commands: Command[] = [];
    const plugin = {
      addCommand: vi.fn((command: Command) => { commands.push(command); return command; }),
      registerEvent: vi.fn(),
      app: {
        workspace: {
          on: vi.fn(() => ({})),
          getMostRecentLeaf: () => leaf,
          getActiveViewOfType: () => null,
          getActiveFile: () => null,
        },
      },
    } as unknown as LimnPlugin;

    registerMarkdownCommands(plugin);
    const checkCallback = commands.find((c) => c.id === "open-as-markdown")!.checkCallback!;

    leaf.view = { getViewType: () => "markdown" } as unknown as WorkspaceLeaf["view"];
    expect(checkCallback(true)).toBe(false);
    expect(checkCallback(false)).toBe(false);
    expect(leaf.lastState).toBeNull();

    leaf.view = { getViewType: () => VIEW_TYPE_LIMN_MARKDOWN } as unknown as WorkspaceLeaf["view"];
    expect(checkCallback(true)).toBe(true);
    expect(leaf.lastState).toBeNull();
  });
});
