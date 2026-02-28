// ABOUTME: Inline markdown parser for mind map node text.
// ABOUTME: Parses bold, italic, code, strikethrough, and links into styled segments.

export interface TextStyle {
  bold: boolean;
  italic: boolean;
  code: boolean;
  strikethrough: boolean;
  link?: string;
}

export interface StyledSegment {
  text: string;
  style: TextStyle;
}

const PLAIN_STYLE: TextStyle = {
  bold: false,
  italic: false,
  code: false,
  strikethrough: false,
};

/**
 * Parse a single line of text into styled segments.
 * Supports: **bold**, *italic*, `code`, ~~strikethrough~~, [text](url).
 * Code spans suppress all inner formatting. Unclosed markers render literally.
 */
export function parseInlineMarkdown(line: string): StyledSegment[] {
  if (line.length === 0) return [];

  // First, find all valid delimiter spans, then build segments.
  // We use a two-pass approach:
  //   Pass 1: find matched delimiter pairs (position + type)
  //   Pass 2: walk through emitting segments with accumulated styles

  const spans = findSpans(line);
  if (spans.length === 0) {
    return [{ text: line, style: { ...PLAIN_STYLE } }];
  }

  return buildSegments(line, spans);
}

/** Parse multi-line text (split by \n) into an array of segment arrays. */
export function parseMarkdownLines(text: string): StyledSegment[][] {
  return text.split("\n").map(parseInlineMarkdown);
}

/** Strip all markdown markers, returning only the display text. */
export function stripMarkdown(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const segments = parseInlineMarkdown(line);
      return segments.map((s) => s.text).join("");
    })
    .join("\n");
}

/** Returns true if segments represent plain unstyled text (or empty). */
export function isPlainSegments(segments: StyledSegment[]): boolean {
  if (segments.length === 0) return true;
  if (segments.length > 1) return false;
  const first = segments[0];
  if (!first) return true;
  const s = first.style;
  return !s.bold && !s.italic && !s.code && !s.strikethrough && !s.link;
}

// --- Internal types and helpers ---

interface Span {
  start: number; // index in line where display text starts (after opening delimiter)
  end: number; // index in line where display text ends (before closing delimiter)
  openLen: number; // length of opening delimiter
  closeLen: number; // length of closing delimiter
  type: "bold" | "italic" | "bolditalic" | "code" | "strikethrough" | "link";
  linkUrl?: string;
}

/**
 * Find all matched delimiter pairs in the line.
 * Returns spans sorted by start position.
 */
function findSpans(line: string): Span[] {
  const spans: Span[] = [];
  const len = line.length;
  let i = 0;

  while (i < len) {
    // Code span: ` ... `
    if (line[i] === "`") {
      const close = line.indexOf("`", i + 1);
      if (close > i + 1) {
        spans.push({ start: i + 1, end: close, openLen: 1, closeLen: 1, type: "code" });
        i = close + 1;
        continue;
      }
    }

    // Link: [text](url)
    if (line[i] === "[") {
      const linkSpan = tryParseLink(line, i);
      if (linkSpan) {
        spans.push(linkSpan);
        i = linkSpan.end + linkSpan.closeLen;
        continue;
      }
    }

    // Strikethrough: ~~ ... ~~
    if (line[i] === "~" && i + 1 < len && line[i + 1] === "~") {
      const close = line.indexOf("~~", i + 2);
      if (close > i + 2) {
        spans.push({ start: i + 2, end: close, openLen: 2, closeLen: 2, type: "strikethrough" });
        i = close + 2;
        continue;
      }
    }

    // Bold+italic: *** ... ***
    if (line[i] === "*" && i + 2 < len && line[i + 1] === "*" && line[i + 2] === "*") {
      const close = findDelimiter(line, "***", i + 3);
      if (close > i + 3) {
        spans.push({ start: i + 3, end: close, openLen: 3, closeLen: 3, type: "bolditalic" });
        i = close + 3;
        continue;
      }
    }

    // Bold: ** ... ** or __ ... __
    if (
      (line[i] === "*" && i + 1 < len && line[i + 1] === "*") ||
      (line[i] === "_" && i + 1 < len && line[i + 1] === "_")
    ) {
      const delim = line.slice(i, i + 2);
      const close = findDelimiter(line, delim, i + 2);
      if (close > i + 2) {
        spans.push({ start: i + 2, end: close, openLen: 2, closeLen: 2, type: "bold" });
        i = close + 2;
        continue;
      }
    }

    // Italic: * ... * or _ ... _
    // Uses smart matching that skips over ** pairs inside the span.
    // Rejects spans whose content is entirely the same delimiter char (e.g., "****").
    if (line[i] === "*" || line[i] === "_") {
      const delim = line.charAt(i);
      const close = findClosingSingleDelim(line, delim, i + 1);
      if (close > i + 1 && !isAllChar(line, delim, i + 1, close)) {
        spans.push({ start: i + 1, end: close, openLen: 1, closeLen: 1, type: "italic" });
        i = close + 1;
        continue;
      }
    }

    i++;
  }

  return spans;
}

/** Check if every character in line[start..end) is the given char. */
function isAllChar(line: string, ch: string, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    if (line[i] !== ch) return false;
  }
  return true;
}

/** Find a delimiter string starting from pos. Returns the index or -1. */
function findDelimiter(line: string, delim: string, fromIndex: number): number {
  const idx = line.indexOf(delim, fromIndex);
  return idx === -1 ? -1 : idx;
}

/**
 * Find a closing single delimiter (e.g., `*` or `_`) that isn't part of a
 * double delimiter pair. Skips over matched `**` / `__` spans so that
 * `*italic **bold** more*` correctly matches the outer `*...*`.
 */
function findClosingSingleDelim(line: string, delim: string, fromIndex: number): number {
  const doubleDelim = delim + delim;
  let i = fromIndex;
  while (i < line.length) {
    if (line[i] === delim && i + 1 < line.length && line[i + 1] === delim) {
      // Found a double delimiter -- try to find its matching close and skip over
      const closeDouble = line.indexOf(doubleDelim, i + 2);
      if (closeDouble !== -1) {
        i = closeDouble + 2;
        continue;
      }
      // No matching double close, skip these two chars
      i += 2;
      continue;
    }
    if (line[i] === delim) {
      return i;
    }
    i++;
  }
  return -1;
}

/** Try to parse a markdown link starting at position i. */
function tryParseLink(line: string, i: number): Span | null {
  // Find closing ]
  const closeBracket = line.indexOf("]", i + 1);
  if (closeBracket === -1 || closeBracket === i + 1) return null;

  // Must be followed by (
  if (closeBracket + 1 >= line.length || line[closeBracket + 1] !== "(") return null;

  // Find closing )
  const closeParen = line.indexOf(")", closeBracket + 2);
  if (closeParen === -1) return null;

  const url = line.slice(closeBracket + 2, closeParen);
  return {
    start: i + 1,
    end: closeBracket,
    openLen: 1,
    closeLen: closeParen - closeBracket + 1,
    type: "link",
    linkUrl: url,
  };
}

/**
 * Build styled segments from the line and matched spans.
 * Handles nested spans (e.g., bold inside italic) by checking containment.
 */
function buildSegments(line: string, spans: Span[]): StyledSegment[] {
  const segments: StyledSegment[] = [];
  let pos = 0;

  for (const span of spans) {
    const openStart = span.start - span.openLen;

    // Text before this span's opening delimiter
    if (openStart > pos) {
      segments.push({ text: line.slice(pos, openStart), style: { ...PLAIN_STYLE } });
    }

    // The span's content
    if (span.type === "code") {
      // Code spans render content literally (no inner parsing)
      segments.push({
        text: line.slice(span.start, span.end),
        style: { ...PLAIN_STYLE, code: true },
      });
    } else if (span.type === "link") {
      segments.push({
        text: line.slice(span.start, span.end),
        style: { ...PLAIN_STYLE, link: span.linkUrl },
      });
    } else {
      // For bold/italic/bolditalic/strikethrough, parse inner content recursively
      const innerText = line.slice(span.start, span.end);
      const innerSegments = parseInlineMarkdown(innerText);

      if (innerSegments.length === 0) {
        // Empty content (e.g., ****) - render delimiters literally
        segments.push({
          text: line.slice(openStart, span.end + span.closeLen),
          style: { ...PLAIN_STYLE },
        });
      } else {
        for (const inner of innerSegments) {
          const style = { ...inner.style };
          if (span.type === "bold") style.bold = true;
          if (span.type === "italic") style.italic = true;
          if (span.type === "bolditalic") {
            style.bold = true;
            style.italic = true;
          }
          if (span.type === "strikethrough") style.strikethrough = true;
          segments.push({ text: inner.text, style });
        }
      }
    }

    pos = span.end + span.closeLen;
  }

  // Remaining text after last span
  if (pos < line.length) {
    segments.push({ text: line.slice(pos), style: { ...PLAIN_STYLE } });
  }

  return segments;
}
