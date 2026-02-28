// ABOUTME: Tests for inline markdown parser.
// ABOUTME: Verifies bold, italic, code, strikethrough, links, and edge cases.

import { describe, it, expect } from "vitest";
import {
  parseInlineMarkdown,
  parseMarkdownLines,
  stripMarkdown,
  isPlainSegments,
} from "../markdown/inlineMarkdown";
import type { StyledSegment } from "../markdown/inlineMarkdown";

/** Helper to create a plain (unstyled) segment. */
function plain(text: string): StyledSegment {
  return { text, style: { bold: false, italic: false, code: false, strikethrough: false } };
}

/** Helper to create a bold segment. */
function bold(text: string): StyledSegment {
  return { text, style: { bold: true, italic: false, code: false, strikethrough: false } };
}

/** Helper to create an italic segment. */
function italic(text: string): StyledSegment {
  return { text, style: { bold: false, italic: true, code: false, strikethrough: false } };
}

/** Helper to create a code segment. */
function code(text: string): StyledSegment {
  return { text, style: { bold: false, italic: false, code: true, strikethrough: false } };
}

/** Helper to create a strikethrough segment. */
function strike(text: string): StyledSegment {
  return { text, style: { bold: false, italic: false, code: false, strikethrough: true } };
}

/** Helper to create a bold+italic segment. */
function boldItalic(text: string): StyledSegment {
  return { text, style: { bold: true, italic: true, code: false, strikethrough: false } };
}

/** Helper to create a link segment. */
function link(text: string, url: string): StyledSegment {
  return { text, style: { bold: false, italic: false, code: false, strikethrough: false, link: url } };
}

describe("parseInlineMarkdown", () => {
  it("returns plain text as single unstyled segment", () => {
    expect(parseInlineMarkdown("hello world")).toEqual([plain("hello world")]);
  });

  it("returns empty array for empty string", () => {
    expect(parseInlineMarkdown("")).toEqual([]);
  });

  describe("bold", () => {
    it("parses **bold** with asterisks", () => {
      expect(parseInlineMarkdown("**bold**")).toEqual([bold("bold")]);
    });

    it("parses __bold__ with underscores", () => {
      expect(parseInlineMarkdown("__bold__")).toEqual([bold("bold")]);
    });

    it("parses bold in middle of text", () => {
      expect(parseInlineMarkdown("hello **world** end")).toEqual([
        plain("hello "),
        bold("world"),
        plain(" end"),
      ]);
    });
  });

  describe("italic", () => {
    it("parses *italic* with asterisks", () => {
      expect(parseInlineMarkdown("*italic*")).toEqual([italic("italic")]);
    });

    it("parses _italic_ with underscores", () => {
      expect(parseInlineMarkdown("_italic_")).toEqual([italic("italic")]);
    });

    it("parses italic in middle of text", () => {
      expect(parseInlineMarkdown("hello *world* end")).toEqual([
        plain("hello "),
        italic("world"),
        plain(" end"),
      ]);
    });
  });

  describe("bold+italic", () => {
    it("parses ***bold italic*** with triple asterisks", () => {
      expect(parseInlineMarkdown("***bold italic***")).toEqual([boldItalic("bold italic")]);
    });

    it("parses nested bold inside italic", () => {
      expect(parseInlineMarkdown("*italic **bold** more*")).toEqual([
        italic("italic "),
        boldItalic("bold"),
        italic(" more"),
      ]);
    });
  });

  describe("code", () => {
    it("parses `code` with backticks", () => {
      expect(parseInlineMarkdown("`code`")).toEqual([code("code")]);
    });

    it("parses code in middle of text", () => {
      expect(parseInlineMarkdown("use `console.log` here")).toEqual([
        plain("use "),
        code("console.log"),
        plain(" here"),
      ]);
    });

    it("suppresses formatting inside code spans", () => {
      expect(parseInlineMarkdown("`**not bold**`")).toEqual([code("**not bold**")]);
    });
  });

  describe("strikethrough", () => {
    it("parses ~~strikethrough~~", () => {
      expect(parseInlineMarkdown("~~done~~")).toEqual([strike("done")]);
    });

    it("parses strikethrough in middle of text", () => {
      expect(parseInlineMarkdown("was ~~old~~ new")).toEqual([
        plain("was "),
        strike("old"),
        plain(" new"),
      ]);
    });
  });

  describe("links", () => {
    it("parses [text](url)", () => {
      expect(parseInlineMarkdown("[click me](https://example.com)")).toEqual([
        link("click me", "https://example.com"),
      ]);
    });

    it("parses link in middle of text", () => {
      expect(parseInlineMarkdown("see [docs](https://docs.dev) here")).toEqual([
        plain("see "),
        link("docs", "https://docs.dev"),
        plain(" here"),
      ]);
    });

    it("does not parse incomplete link syntax", () => {
      expect(parseInlineMarkdown("[no url]")).toEqual([plain("[no url]")]);
    });

    it("does not parse link with missing close paren", () => {
      expect(parseInlineMarkdown("[text](url")).toEqual([plain("[text](url")]);
    });
  });

  describe("mixed formatting", () => {
    it("handles multiple formats in one line", () => {
      expect(parseInlineMarkdown("**bold** and *italic* and `code`")).toEqual([
        bold("bold"),
        plain(" and "),
        italic("italic"),
        plain(" and "),
        code("code"),
      ]);
    });
  });

  describe("unclosed markers", () => {
    it("renders unclosed bold literally", () => {
      expect(parseInlineMarkdown("**oops")).toEqual([plain("**oops")]);
    });

    it("renders unclosed italic literally", () => {
      expect(parseInlineMarkdown("*oops")).toEqual([plain("*oops")]);
    });

    it("renders unclosed code literally", () => {
      expect(parseInlineMarkdown("`oops")).toEqual([plain("`oops")]);
    });

    it("renders unclosed strikethrough literally", () => {
      expect(parseInlineMarkdown("~~oops")).toEqual([plain("~~oops")]);
    });
  });

  describe("empty delimiters", () => {
    it("renders **** literally", () => {
      expect(parseInlineMarkdown("****")).toEqual([plain("****")]);
    });

    it("renders `` literally", () => {
      expect(parseInlineMarkdown("``")).toEqual([plain("``")]);
    });
  });
});

describe("parseMarkdownLines", () => {
  it("splits by newlines and parses each line", () => {
    const result = parseMarkdownLines("**bold**\n*italic*");
    expect(result).toEqual([
      [bold("bold")],
      [italic("italic")],
    ]);
  });

  it("handles empty lines", () => {
    const result = parseMarkdownLines("hello\n\nworld");
    expect(result).toEqual([
      [plain("hello")],
      [],
      [plain("world")],
    ]);
  });
});

describe("stripMarkdown", () => {
  it("removes bold markers", () => {
    expect(stripMarkdown("**bold**")).toBe("bold");
  });

  it("removes italic markers", () => {
    expect(stripMarkdown("*italic*")).toBe("italic");
  });

  it("removes code markers", () => {
    expect(stripMarkdown("`code`")).toBe("code");
  });

  it("removes strikethrough markers", () => {
    expect(stripMarkdown("~~strike~~")).toBe("strike");
  });

  it("extracts link text", () => {
    expect(stripMarkdown("[click](https://example.com)")).toBe("click");
  });

  it("handles mixed formatting", () => {
    expect(stripMarkdown("**bold** and *italic*")).toBe("bold and italic");
  });

  it("preserves unclosed markers", () => {
    expect(stripMarkdown("**unclosed")).toBe("**unclosed");
  });
});

describe("isPlainSegments", () => {
  it("returns true for single unstyled segment", () => {
    expect(isPlainSegments([plain("hello")])).toBe(true);
  });

  it("returns true for empty array", () => {
    expect(isPlainSegments([])).toBe(true);
  });

  it("returns false for bold segment", () => {
    expect(isPlainSegments([bold("hello")])).toBe(false);
  });

  it("returns false for multiple segments", () => {
    expect(isPlainSegments([plain("a"), plain("b")])).toBe(false);
  });

  it("returns false for link segment", () => {
    expect(isPlainSegments([link("text", "url")])).toBe(false);
  });
});
