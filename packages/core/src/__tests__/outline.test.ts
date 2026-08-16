// ABOUTME: Tests for the Markdown outline codec (nested list <-> tree).
// ABOUTME: Covers parsing, writing, escapes, collapse, embeds, and round-trip laws.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseOutline,
  outlineRoots,
  writeOutline,
  escapeLine,
  unescapeLine,
  writeSubtree,
  parseSubtree,
  outlineToFileNodes,
  fileNodesToOutline,
  OUTLINE_IMAGE_PLACEHOLDER,
} from "../markdown/outline";
import type { OutlineNode } from "../markdown/outline";
import { generateNodeId, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from "../store/MindMapStore";

function fixture(name: string): string {
  return readFileSync(new URL(`../markdown/fixtures/${name}.md`, import.meta.url), "utf8");
}

/** Compact structural view including collapse marker and image, for round-trip laws. */
function detail(nodes: OutlineNode[]): string {
  return nodes
    .map((n) => {
      const image = n.image ? ` !${n.image.target}|${n.image.width}x${n.image.height}` : "";
      const children = n.children.length ? `[${detail(n.children)}]` : "";
      return `${n.collapsed ? "*" : "-"}${n.text}${image}${children}`;
    })
    .join(",");
}

/** Compact structural view: text with children in brackets. */
function shape(nodes: OutlineNode[]): string {
  return nodes
    .map((n) => (n.children.length ? `${n.text}[${shape(n.children)}]` : n.text))
    .join(",");
}

/** Deterministic PRNG so a failing fuzz document can be reproduced. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

  test("an inline %% pair on a content line is text, not a comment delimiter", () => {
    const roots: OutlineNode[] = [
      { text: "todo %% secret", collapsed: false, children: [{ text: "child", collapsed: false, children: [] }] },
      { text: "second", collapsed: false, children: [] },
    ];
    const text = writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots }] });
    expect(shape(outlineRoots(parseOutline(text)))).toBe("todo %% secret[child],second");
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
  const FIXTURES = [
    "basic-nested",
    "prose-and-lists",
    "fenced-and-comments",
    "frontmatter-only",
    "collapse-and-images",
  ];

  test.each(FIXTURES)("%s: writing a parse is idempotent", (name) => {
    const once = writeOutline(parseOutline(fixture(name)));
    const twice = writeOutline(parseOutline(once));
    expect(twice).toBe(once);
  });

  test.each(FIXTURES)("%s: parse(write(parse(x))) has the same structure as parse(x)", (name) => {
    const first = parseOutline(fixture(name));
    const second = parseOutline(writeOutline(first));
    expect(detail(outlineRoots(second))).toBe(detail(outlineRoots(first)));
    expect(second.frontmatterLines).toEqual(first.frontmatterLines);
    expect(second.regions.map((r) => r.kind)).toEqual(first.regions.map((r) => r.kind));
  });

  test("a note with CRLF line endings keeps them", () => {
    const text = "- a\r\n  - b\r\n";
    const parsed = parseOutline(text);
    expect(shape(outlineRoots(parsed))).toBe("a[b]");
    expect(writeOutline(parsed)).toBe(text);
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

  test("writing a parsed document is idempotent for random documents", () => {
    const alphabet = [
      "- a",
      "  - b",
      "    - c",
      "* d",
      "+ e",
      "text",
      "  text",
      "    text",
      "",
      "# h",
      "```",
      "  ```",
      "%%",
      "- x\\",
      "---",
      "1. one",
      "  ![[i.png|3]]",
    ];
    const random = mulberry32(0x5eed);
    for (let i = 0; i < 2000; i++) {
      const count = 1 + Math.floor(random() * 12);
      const doc = Array.from({ length: count }, () => alphabet[Math.floor(random() * alphabet.length)]).join("\n");
      const once = writeOutline(parseOutline(doc));
      expect(writeOutline(parseOutline(once)), `document ${JSON.stringify(doc)}`).toBe(once);
    }
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

  test.each(["\\- literal", "\\# heading", "\\```", "\\\\- x"])(
    "a leading backslash in %j is escaped so unescaping is its inverse",
    (raw) => {
      expect(unescapeLine(escapeLine(raw))).toBe(raw);
      const node: OutlineNode = { text: raw, collapsed: false, children: [] };
      const text = writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots: [node] }] });
      expect(outlineRoots(parseOutline(text))[0]?.text).toBe(raw);
    },
  );

  test("a literal backslash before an ordered marker is escaped so unescaping is its inverse", () => {
    expect(unescapeLine(escapeLine("1\\. one"))).toBe("1\\. one");
    const node: OutlineNode = { text: "1\\. one", collapsed: false, children: [] };
    const text = writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots: [node] }] });
    expect(outlineRoots(parseOutline(text))[0]?.text).toBe("1\\. one");
  });

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

describe("continuation lines and fenced blocks", () => {
  test("a continuation line at the canonical column attaches even when the item is indented", () => {
    const once = writeOutline(parseOutline("  - item\n  note\n"));
    expect(once).toBe("- item\\\n  note\n");
    expect(writeOutline(parseOutline(once))).toBe(once);
  });

  test("an under-indented continuation attaches to the ancestor it fits and closes deeper items", () => {
    const roots = outlineRoots(parseOutline("- Parent\n    - Child\n  note under parent\n"));
    expect(roots).toHaveLength(1);
    expect(roots[0]?.text).toBe("Parent\nnote under parent");
    expect(shape(roots[0]?.children ?? [])).toBe("Child");
  });

  test("a tab after the marker measures the content column from the marker, not from column zero", () => {
    const roots = outlineRoots(parseOutline("-\tfoo\n\tbar\n"));
    expect(roots).toHaveLength(1);
    expect(roots[0]?.text).toBe("foo\nbar");
  });

  test("a fence opened on a continuation line is item text, bullets inside it included", () => {
    const roots = outlineRoots(parseOutline("- item\n  ```js\n  - x\n  ```\n- next\n"));
    expect(roots).toHaveLength(2);
    expect(roots[0]?.text).toBe("item\n```js\n- x\n```");
    expect(roots[0]?.children).toEqual([]);
    expect(roots[1]?.text).toBe("next");
  });

  test("a balanced fence in item text is written back as a fence, with no escapes or hard breaks", () => {
    const text = "- item\n  ```js\n  - x\n  ```\n- next\n";
    expect(writeOutline(parseOutline(text))).toBe(text);
  });

  test("blank lines inside a fenced block are kept, since they are code", () => {
    const text = "- item\n  ```\n  a\n\n  b\n  ```\n";
    const roots = outlineRoots(parseOutline(text));
    expect(roots).toHaveLength(1);
    expect(roots[0]?.text).toBe("item\n```\na\n\nb\n```");
    expect(writeOutline(parseOutline(text))).toBe(text);
  });

  test("an unbalanced fence opener in item text stays escaped", () => {
    const node: OutlineNode = { text: "```\nlonely opener", collapsed: false, children: [] };
    const text = writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots: [node] }] });
    expect(text).toBe("- \\```\\\n  lonely opener");
    expect(outlineRoots(parseOutline(text))[0]?.text).toBe("```\nlonely opener");
  });

  test("a fence on the item's own first line is escaped, since only continuation lines open one", () => {
    const node: OutlineNode = { text: "```js\n- x\n```", collapsed: false, children: [] };
    const text = writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots: [node] }] });
    expect(text).toBe("- \\```js\\\n  \\- x\\\n  \\```");
    const back = outlineRoots(parseOutline(text));
    expect(back[0]?.text).toBe("```js\n- x\n```");
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

  test("images write as the last line with the sizes they have", () => {
    const roots: OutlineNode[] = [
      { text: "", collapsed: false, image: { target: "a.png", width: 120, height: 80 }, children: [] },
      { text: "two\nlines", collapsed: false, image: { target: "b.png", width: 50 }, children: [] },
      { text: "no size", collapsed: false, image: { target: "c.png" }, children: [] },
    ];
    expect(writeOutline({ frontmatterLines: [], regions: [{ kind: "list", roots }] })).toBe(
      "- ![[a.png|120x80]]\n- two\\\n  lines\\\n  ![[b.png|50]]\n- no size\\\n  ![[c.png]]",
    );
  });

  test("a write keeps both dimensions of a sized embed", () => {
    const once = writeOutline(parseOutline(fixture("collapse-and-images")));
    expect(once).toContain("![[photo.jpg|200x150]]");
    expect(once).toContain("![[diagram.png|300]]");
  });
});

describe("subtree helpers and file-node conversion", () => {
  test("writeSubtree and parseSubtree round-trip a forest without frontmatter or prose", () => {
    const nodes: OutlineNode[] = [
      { text: "a", collapsed: false, children: [{ text: "b", collapsed: false, children: [] }] },
      { text: "c", collapsed: false, children: [] },
    ];
    const text = writeSubtree(nodes);
    expect(text).toBe("- a\n  - b\n- c");
    expect(parseSubtree(text)).toEqual(nodes);
  });

  test("parseSubtree ignores prose and returns roots from every list", () => {
    expect(shape(parseSubtree("intro\n- a\n\ntext\n- b"))).toBe("a,b");
  });

  test("outlineToFileNodes assigns ids, placeholder geometry, and maps collapse and images", () => {
    let n = 0;
    const nextId = () => `t${n++}`;
    const nodes: OutlineNode[] = [
      {
        text: "root",
        collapsed: true,
        image: { target: "pic.png", width: 300 },
        children: [{ text: "kid", collapsed: false, children: [] }],
      },
    ];
    const file = outlineToFileNodes(nodes, nextId);
    expect(file).toEqual([
      {
        id: "t0",
        text: "root",
        x: 0,
        y: 0,
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
        collapsed: true,
        image: { assetId: "pic.png", width: 300, height: 300 },
        children: [
          { id: "t1", text: "kid", x: 0, y: 0, width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT, children: [] },
        ],
      },
    ]);
  });

  test("an image with no size gets the square placeholder; an explicit height is kept", () => {
    const [a, b] = outlineToFileNodes(
      [
        { text: "", collapsed: false, image: { target: "a.png" }, children: [] },
        { text: "", collapsed: false, image: { target: "b.png", width: 100, height: 40 }, children: [] },
      ],
      generateNodeId,
    );
    expect(a?.image).toEqual({ assetId: "a.png", width: OUTLINE_IMAGE_PLACEHOLDER, height: OUTLINE_IMAGE_PLACEHOLDER });
    expect(b?.image).toEqual({ assetId: "b.png", width: 100, height: 40 });
  });

  test("an unsized embed stays unsized through outline -> file nodes -> outline", () => {
    const back = fileNodesToOutline(outlineToFileNodes(parseSubtree("- ![[x.png]]\n"), generateNodeId));
    expect(writeSubtree(back)).toBe("- ![[x.png]]");
  });

  test("a sized embed keeps its size through outline -> file nodes -> outline", () => {
    const back = fileNodesToOutline(outlineToFileNodes(parseSubtree("- ![[p.png|200x150]]\n"), generateNodeId));
    expect(writeSubtree(back)).toBe("- ![[p.png|200x150]]");
  });

  test("fileNodesToOutline drops geometry and ids and keeps text, collapse, and image", () => {
    const outline = fileNodesToOutline([
      {
        id: "n9",
        text: "root",
        x: 10,
        y: 20,
        width: 120,
        height: 40,
        collapsed: true,
        image: { assetId: "pic.png", width: 300, height: 200 },
        children: [{ id: "n10", text: "kid", x: 0, y: 0, width: 1, height: 1, children: [] }],
      },
      { id: "n11", text: "collapsed leaf is not collapsed", x: 0, y: 0, width: 1, height: 1, collapsed: true, children: [] },
    ]);
    expect(outline).toEqual([
      {
        text: "root",
        collapsed: true,
        image: { target: "pic.png", width: 300, height: 200 },
        children: [{ text: "kid", collapsed: false, children: [] }],
      },
      { text: "collapsed leaf is not collapsed", collapsed: false, children: [] },
    ]);
  });

  test("generateNodeId yields fresh n-ids that do not collide with loaded ids", () => {
    const a = generateNodeId();
    const b = generateNodeId();
    expect(a).toMatch(/^n\d+$/);
    expect(b).not.toBe(a);
  });
});
