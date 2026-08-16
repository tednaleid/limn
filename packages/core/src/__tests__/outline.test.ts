// ABOUTME: Tests for the Markdown outline codec (nested list <-> tree).
// ABOUTME: Covers parsing, writing, escapes, collapse, embeds, and round-trip laws.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseOutline, outlineRoots, writeOutline, escapeLine, unescapeLine } from "../markdown/outline";
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

  test("tilde fences are opaque like backtick fences", () => {
    const parsed = parseOutline("~~~\n- not an item\n~~~\n- item\n");
    expect(shape(outlineRoots(parsed))).toBe("item");
  });

  test("frontmatter may be closed with three dots", () => {
    const parsed = parseOutline("---\na: 1\n...\n- item\n");
    expect(parsed.frontmatterLines).toEqual(["---", "a: 1", "..."]);
    expect(shape(outlineRoots(parsed))).toBe("item");
  });
});

describe("writeOutline", () => {
  const FIXTURES = ["basic-nested", "prose-and-lists", "fenced-and-comments", "frontmatter-only"];

  test.each(FIXTURES)("%s: writing a parse is idempotent", (name) => {
    const once = writeOutline(parseOutline(fixture(name)));
    const twice = writeOutline(parseOutline(once));
    expect(twice).toBe(once);
  });

  test.each(FIXTURES)("%s: parse(write(parse(x))) has the same structure as parse(x)", (name) => {
    const first = parseOutline(fixture(name));
    const second = parseOutline(writeOutline(first));
    expect(shape(outlineRoots(second))).toBe(shape(outlineRoots(first)));
    expect(second.frontmatterLines).toEqual(first.frontmatterLines);
    expect(second.regions.map((r) => r.kind)).toEqual(first.regions.map((r) => r.kind));
  });

  test("a canonical note is written back byte for byte", () => {
    const text = fixture("basic-nested");
    expect(writeOutline(parseOutline(text))).toBe(text);
  });

  test("prose regions and frontmatter are preserved verbatim, lists are canonicalized", () => {
    const text = "---\na: 1\n---\nIntro\n\n+ one\n    + two\n\n+ three\n\nOutro\n";
    expect(writeOutline(parseOutline(text))).toBe(
      "---\na: 1\n---\nIntro\n\n- one\n  - two\n- three\n\nOutro\n",
    );
  });

  test("an item with empty text but children is written as a bare marker", () => {
    const parsed = parseOutline("-\n  - child\n");
    expect(writeOutline(parsed)).toBe("-\n  - child\n");
  });

  test("an item with empty text and no children is dropped", () => {
    const parsed = parseOutline("- a\n-\n- b\n");
    expect(writeOutline(parsed)).toBe("- a\n- b\n");
  });

  test("a chain of empty items collapses completely in one write, so writing is idempotent", () => {
    expect(writeOutline(parseOutline("-\n  -\n"))).toBe("");
    expect(writeOutline(parseOutline("- a\n  -\n    -\n- b\n"))).toBe("- a\n- b\n");
  });
});

describe("node text", () => {
  test("multi-line text is written as backslash continuation lines and read back", () => {
    const node: OutlineNode = { text: "Alpha\nBeta\nGamma", collapsed: false, children: [] };
    const parsed = { frontmatterLines: [], regions: [{ kind: "list" as const, roots: [node] }] };
    const text = writeOutline(parsed);
    expect(text).toBe("- Alpha\\\n  Beta\\\n  Gamma");
    expect(outlineRoots(parseOutline(text))[0]?.text).toBe("Alpha\nBeta\nGamma");
  });

  test("two trailing spaces are also read as a hard break; trailing whitespace is trimmed", () => {
    const text = "- Alpha  \n  Beta \n- Next";
    const roots = outlineRoots(parseOutline(text));
    expect(roots[0]?.text).toBe("Alpha\nBeta");
    expect(roots[1]?.text).toBe("Next");
  });

  test("continuation lines keep indentation beyond the content column", () => {
    const text = "- code:\\\n    indented\n";
    const roots = outlineRoots(parseOutline(text));
    expect(roots[0]?.text).toBe("code:\n  indented");
    expect(writeOutline(parseOutline(text))).toBe(text);
  });

  test("an unindented non-bullet line ends the list and is prose, not node text", () => {
    const parsed = parseOutline("- item\nlazy line\n- next\n");
    expect(shape(outlineRoots(parsed))).toBe("item,next");
    expect(parsed.regions[1]).toEqual({ kind: "prose", lines: ["lazy line"] });
  });

  test("blank lines inside node text collapse to a single break on write", () => {
    const node: OutlineNode = { text: "a\n\n\nb", collapsed: false, children: [] };
    expect(writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots: [node] }] })).toBe("- a\\\n  b");
  });

  test("leading whitespace on the first line is trimmed on write so the content column stays canonical", () => {
    const node: OutlineNode = { text: "   padded\nsecond", collapsed: false, children: [] };
    const text = writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots: [node] }] });
    expect(text).toBe("- padded\\\n  second");
    expect(outlineRoots(parseOutline(text))[0]?.text).toBe("padded\nsecond");
  });

  test.each([
    ["- looks like a bullet", "\\- looks like a bullet"],
    ["* star", "\\* star"],
    ["+ plus", "\\+ plus"],
    ["-", "\\-"],
    ["# Heading", "\\# Heading"],
    ["### Deep", "\\### Deep"],
    ["#", "\\#"],
    ["> quote", "\\> quote"],
    ["```js", "\\```js"],
    ["~~~", "\\~~~"],
    ["***", "\\***"],
    ["- - -", "\\- - -"],
    ["___", "\\___"],
    ["1. one", "1\\. one"],
    ["12) twelve", "12\\) twelve"],
    ["3.", "3\\."],
  ])("escapes %j as %j and unescapes back", (raw, escaped) => {
    expect(escapeLine(raw)).toBe(escaped);
    expect(unescapeLine(escaped)).toBe(raw);
  });

  test.each(["#tag", "[[Note]]", "[ ] task", "**bold** text", "-not a bullet", "1.5 is a number", "\\*kept\\*"])(
    "leaves %j alone in both directions",
    (raw) => {
      expect(escapeLine(raw)).toBe(raw);
      expect(unescapeLine(raw)).toBe(raw);
    },
  );

  test("an indented continuation line that starts like a bullet is escaped after its own indent", () => {
    const node: OutlineNode = { text: "a\n  - b\n  ***", collapsed: false, children: [] };
    const text = writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots: [node] }] });
    expect(text).toBe("- a\\\n    \\- b\\\n    \\***");
    const back = outlineRoots(parseOutline(text));
    expect(back).toHaveLength(1);
    expect(back[0]?.text).toBe("a\n  - b\n  ***");
    expect(back[0]?.children).toEqual([]);
  });

  test("escapes apply to every line of node text and round-trip through the file", () => {
    const node: OutlineNode = { text: "first\n- second\n# third", collapsed: false, children: [] };
    const text = writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots: [node] }] });
    expect(text).toBe("- first\\\n  \\- second\\\n  \\# third");
    const back = outlineRoots(parseOutline(text));
    expect(shape(back)).toBe("first\n- second\n# third");
    expect(back[0]?.children).toEqual([]);
  });
});

describe("collapse marker and embeds", () => {
  test("star marker on an item with children means collapsed; star or plus on a leaf is open", () => {
    const roots = outlineRoots(parseOutline(fixture("collapse-and-images")));
    expect(roots[0]?.collapsed).toBe(false);
    expect(roots[1]?.collapsed).toBe(true);
    expect(roots[2]?.collapsed).toBe(false);
    expect(roots[3]?.collapsed).toBe(false);
    expect(roots[3]?.children).toHaveLength(1);
  });

  test("collapsed nodes with children write a star; everything else writes a dash", () => {
    const roots: OutlineNode[] = [
      { text: "a", collapsed: true, children: [{ text: "b", collapsed: false, children: [] }] },
      { text: "c", collapsed: true, children: [] },
    ];
    expect(writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots }] })).toBe("* a\n  - b\n- c");
  });

  test("an embed on the last line becomes the node image; width and height are read", () => {
    const roots = outlineRoots(parseOutline(fixture("collapse-and-images")));
    expect(roots[4]?.text).toBe("");
    expect(roots[4]?.image).toEqual({ target: "diagram.png", width: 300, height: undefined });
    expect(roots[5]?.text).toBe("Caption");
    expect(roots[5]?.image).toEqual({ target: "photo.jpg", width: 200, height: 150 });
    expect(roots[6]?.image).toBeUndefined();
    expect(roots[6]?.text).toBe("Text with an embed in the middle ![[inline.png]] stays text");
  });

  test("images write as the last line with width only", () => {
    const roots: OutlineNode[] = [
      { text: "", collapsed: false, image: { target: "a.png", width: 120, height: 80 }, children: [] },
      { text: "two\nlines", collapsed: false, image: { target: "b.png", width: 50 }, children: [] },
      { text: "no size", collapsed: false, image: { target: "c.png" }, children: [] },
    ];
    expect(writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots }] })).toBe(
      "- ![[a.png|120]]\n- two\\\n  lines\\\n  ![[b.png|50]]\n- no size\\\n  ![[c.png]]",
    );
  });

  test("the fixture round-trips idempotently and keeps its structure", () => {
    const text = fixture("collapse-and-images");
    const once = writeOutline(parseOutline(text));
    expect(writeOutline(parseOutline(once))).toBe(once);
    expect(shape(outlineRoots(parseOutline(once)))).toBe(shape(outlineRoots(parseOutline(text))));
  });
});
