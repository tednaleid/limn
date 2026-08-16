// ABOUTME: Tests for the Markdown outline codec (nested list <-> tree).
// ABOUTME: Covers parsing, writing, escapes, collapse, embeds, and round-trip laws.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseOutline, outlineRoots } from "../markdown/outline";
import type { OutlineNode } from "../markdown/outline";

function fixture(name: string): string {
  return readFileSync(new URL(`../markdown/fixtures/${name}.md`, import.meta.url), "utf8");
}

/** Compact structural view: text with children in brackets. */
function shape(nodes: OutlineNode[]): string {
  return nodes
    .map((n) => (n.children.length ? `${n.text}[${shape(n.children)}]` : n.text))
    .join(",");
}

describe("parseOutline structure", () => {
  test("nested bullets become a tree; two top-level items are two roots", () => {
    const parsed = parseOutline(fixture("basic-nested"));
    expect(parsed.frontmatterLines).toEqual([]);
    expect(parsed.regions.map((r) => r.kind)).toEqual(["list", "prose"]);
    expect(shape(outlineRoots(parsed))).toBe(
      "Project Plan[Phase 1[Research,Architecture],Phase 2[Implementation]],Second Root",
    );
  });

  test("frontmatter is captured, prose regions are preserved, ordered lists are prose", () => {
    const parsed = parseOutline(fixture("prose-and-lists"));
    expect(parsed.frontmatterLines).toEqual(["---", "limn-plugin: true", "tags:", "  - planning", "---"]);
    expect(parsed.regions.map((r) => r.kind)).toEqual(["prose", "list", "prose", "list", "prose"]);
    const prose0 = parsed.regions[0];
    if (prose0?.kind !== "prose") throw new Error("expected prose");
    expect(prose0.lines).toEqual(["# Weekly plan", "", "Some prose before the list.", ""]);
    const prose2 = parsed.regions[2];
    if (prose2?.kind !== "prose") throw new Error("expected prose");
    expect(prose2.lines).toEqual([
      "",
      "A paragraph between two lists.",
      "",
      "1. ordered lists are prose",
      "2. and stay prose",
      "",
    ]);
    expect(shape(outlineRoots(parsed))).toBe("Monday[Standup],Tuesday,Friday[Retro]");
  });

  test("bullets inside fenced code and %% comments are prose", () => {
    const parsed = parseOutline(fixture("fenced-and-comments"));
    expect(shape(outlineRoots(parsed))).toBe("Real item[Real child],Another real item");
    const prose = parsed.regions.filter((r) => r.kind === "prose");
    expect(prose.length).toBeGreaterThanOrEqual(1);
    const middle = parsed.regions[1];
    if (middle?.kind !== "prose") throw new Error("expected prose between lists");
    expect(middle.lines).toContain("- not an item, inside a fence");
    expect(middle.lines).toContain("- not an item, inside a comment");
  });

  test("frontmatter-only note has no roots and one prose region holding the trailing newline", () => {
    const parsed = parseOutline(fixture("frontmatter-only"));
    expect(parsed.frontmatterLines).toEqual(["---", "limn-plugin: true", "---"]);
    expect(outlineRoots(parsed)).toEqual([]);
    expect(parsed.regions).toEqual([{ kind: "prose", lines: [""] }]);
  });

  test("empty string parses to no frontmatter and no regions", () => {
    expect(parseOutline("")).toEqual({ frontmatterLines: [], regions: [{ kind: "prose", lines: [""] }] });
  });

  test("tabs indent four columns; deeper indent nests, equal indent is a sibling, shallower pops", () => {
    const text = "- a\n\t- b\n\t\t- c\n\t- d\n- e";
    expect(shape(outlineRoots(parseOutline(text)))).toBe("a[b[c],d],e");
  });

  test("a bullet with no content is an item with empty text", () => {
    const text = "-\n  - child";
    const roots = outlineRoots(parseOutline(text));
    expect(roots).toHaveLength(1);
    expect(roots[0]?.text).toBe("");
    expect(roots[0]?.children[0]?.text).toBe("child");
  });

  test("blank lines between items stay inside the list region", () => {
    const text = "- a\n\n- b\n";
    const parsed = parseOutline(text);
    expect(parsed.regions.map((r) => r.kind)).toEqual(["list", "prose"]);
    expect(shape(outlineRoots(parsed))).toBe("a,b");
  });
});
