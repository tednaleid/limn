// ABOUTME: DOM-based TextMeasurer using an off-screen element.
// ABOUTME: Measures actual text dimensions for accurate node sizing.

import type { TextMeasurer, NodeStyle } from "@limn/core";
import { parseMarkdownLines, getHost } from "@limn/core";

const FONT_SIZE = 14;
const LINE_HEIGHT = 20;
const PADDING_X = 10;
const PADDING_Y = 6;
// CSS class applied to the off-screen element to switch from single-line
// measure mode (default: white-space: pre) to wrapped reflow mode.
const WRAP_CLASS = "limn-measure-wrap";
let measureEl: HTMLDivElement | null = null;

function getMeasureElement(): HTMLDivElement {
  if (measureEl) return measureEl;
  measureEl = createMeasureElement(getHost().document.body);
  return measureEl;
}

function createMeasureElement(container: HTMLElement): HTMLDivElement {
  const el = getHost().document.createElement("div");
  el.className = "limn-measure";
  // Static base styles (position, visibility, white-space: pre, width: auto,
  // box-sizing, font-family) live in the .limn-measure CSS class in
  // packages/web/src/index.css and packages/obsidian/styles.css. Only the
  // font-size-dependent values are set here, via template literals (which the
  // no-static-styles-assignment rule deliberately ignores per its source).
  el.style.fontSize = `${FONT_SIZE}px`;
  el.style.lineHeight = `${LINE_HEIGHT}px`;
  el.style.padding = `${PADDING_Y}px ${PADDING_X}px`;
  container.appendChild(el);
  return el;
}

function applyStyle(el: HTMLDivElement, style?: NodeStyle): void {
  const fontSize = style?.fontSize ?? FONT_SIZE;
  const lineHeight = Math.round(fontSize * (LINE_HEIGHT / FONT_SIZE));
  const paddingY = Math.round(fontSize * (PADDING_Y / FONT_SIZE));
  // Per-call dynamic values. All right-hand sides are expressions
  // (template literals or function calls) so the static-styles rule does
  // not fire.
  el.style.fontSize = `${fontSize}px`;
  el.style.fontWeight = String(style?.fontWeight ?? 400);
  el.style.lineHeight = `${lineHeight}px`;
  el.style.padding = `${paddingY}px ${PADDING_X}px`;
}

/** Populate an element with styled DOM nodes from markdown text. */
function populateWithMarkdown(el: HTMLDivElement, text: string): void {
  const doc = getHost().document;
  el.textContent = "";
  if (!text) {
    el.appendChild(doc.createTextNode("\u00A0"));
    return;
  }
  const lines = parseMarkdownLines(text);
  lines.forEach((segments, i) => {
    if (i > 0) el.appendChild(doc.createTextNode("\n"));
    if (segments.length === 0) {
      el.appendChild(doc.createTextNode("\u00A0"));
      return;
    }
    for (const seg of segments) {
      let node: Node = doc.createTextNode(seg.text);
      if (seg.style.code) {
        const code = doc.createElement("code");
        code.className = "limn-code";
        code.appendChild(node);
        node = code;
      }
      if (seg.style.bold) { const b = doc.createElement("b"); b.appendChild(node); node = b; }
      if (seg.style.italic) { const em = doc.createElement("i"); em.appendChild(node); node = em; }
      if (seg.style.strikethrough) { const s = doc.createElement("s"); s.appendChild(node); node = s; }
      el.appendChild(node);
    }
  });
}

function buildMeasurer(getEl: () => HTMLDivElement): TextMeasurer {
  return {
    measure(text: string, style?: NodeStyle, literal?: boolean) {
      const el = getEl();
      applyStyle(el, style);
      // Reset to single-line mode: drop wrap class (so white-space falls back
      // to `pre` from CSS) and clear any inline width set by a prior reflow.
      el.classList.remove(WRAP_CLASS);
      el.style.removeProperty("width");
      if (literal) {
        el.textContent = text || "\u00A0";
      } else {
        populateWithMarkdown(el, text);
      }
      // getBoundingClientRect gives sub-pixel precision; offsetWidth rounds
      // to an integer which can cause the textarea to be fractionally too
      // narrow, wrapping text that should fit on one line.
      // The +4 buffer accounts for SVG text rendering wider than DOM measurement.
      const rect = el.getBoundingClientRect();
      const width = Math.ceil(rect.width) + 4;
      const height = Math.max(32, Math.ceil(rect.height));
      return { width, height };
    },

    reflow(text: string, maxWidth: number, style?: NodeStyle, literal?: boolean) {
      const el = getEl();
      applyStyle(el, style);
      // Switch to wrapped mode via class (white-space: pre-wrap; word-break:
      // break-word). Width is dynamic and uses a template literal.
      el.classList.add(WRAP_CLASS);
      el.style.width = `${maxWidth}px`;
      if (literal) {
        el.textContent = text || "\u00A0";
      } else {
        populateWithMarkdown(el, text);
      }
      const height = Math.max(32, Math.ceil(el.offsetHeight));
      return { width: maxWidth, height };
    },
  };
}

/** Default singleton measurer that appends to document.body. */
export const domTextMeasurer: TextMeasurer = buildMeasurer(getMeasureElement);

/** Create a measurer that appends its off-screen element to the given container. */
export function createDomTextMeasurer(container: HTMLElement): TextMeasurer {
  const el = createMeasureElement(container);
  return buildMeasurer(() => el);
}
