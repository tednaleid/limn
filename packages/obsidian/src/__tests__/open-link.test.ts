// ABOUTME: Tests for opening links from a mind map inside Obsidian.
// ABOUTME: Wikilinks go to workspace.openLinkText in a new tab; URLs go to window.open.

import { describe, it, expect, vi } from "vitest";
import type { App } from "obsidian";
import { openLinkFromMap } from "../openLink";

describe("openLinkFromMap", () => {
  it("opens wikilinks through the workspace, resolved from the note", () => {
    const openLinkText = vi.fn();
    const app = { workspace: { openLinkText } } as unknown as App;
    openLinkFromMap(app, "[[Other#Part]]", "notes/plan.md");
    expect(openLinkText).toHaveBeenCalledWith("Other#Part", "notes/plan.md", "tab");
  });

  it("opens URLs in the browser", () => {
    const g = globalThis as Record<string, unknown>;
    if (typeof g.window === "undefined") g.window = globalThis;
    const win = g.window as Record<string, unknown>;
    const open = vi.fn();
    win.open = open;
    const app = { workspace: { openLinkText: vi.fn() } } as unknown as App;
    openLinkFromMap(app, "https://example.com", "notes/plan.md");
    expect(open).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
  });
});
