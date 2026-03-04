// ABOUTME: DOM-based TextMeasurer using an off-screen element.
// ABOUTME: Measures actual text dimensions for accurate node sizing.

import type { TextMeasurer, NodeStyle } from "@limn/core";
import { parseMarkdownLines } from "@limn/core";

const FONT_SIZE = 14;
const FONT_FAMILY = "system-ui, -apple-system, sans-serif";
const LINE_HEIGHT = 20;
const PADDING_X = 10;
const PADDING_Y = 6;
let measureEl: HTMLDivElement | null = null;

function getMeasureElement(): HTMLDivElement {
  if (measureEl) return measureEl;
  measureEl = createMeasureElement(document.body);
  return measureEl;
}

function createMeasureElement(container: HTMLElement): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "limn-measure";
  // Inject default styles directly so the element works regardless of stylesheet context
  el.style.cssText = [
    "position:absolute",
    "visibility:hidden",
    "white-space:pre",
    `font-size:${FONT_SIZE}px`,
    `font-family:${FONT_FAMILY}`,
    `line-height:${LINE_HEIGHT}px`,
    `padding:${PADDING_Y}px ${PADDING_X}px`,
    "box-sizing:border-box",
  ].join(";");
  container.appendChild(el);
  return el;
}

function applyStyle(el: HTMLDivElement, style?: NodeStyle): void {
  const fontSize = style?.fontSize ?? FONT_SIZE;
  const lineHeight = Math.round(fontSize * (LINE_HEIGHT / FONT_SIZE));
  const paddingY = Math.round(fontSize * (PADDING_Y / FONT_SIZE));
  el.style.fontSize = `${fontSize}px`;
  el.style.fontWeight = `${style?.fontWeight ?? 400}`;
  el.style.lineHeight = `${lineHeight}px`;
  el.style.padding = `${paddingY}px ${PADDING_X}px`;
}

/** Populate an element with styled DOM nodes from markdown text. */
function populateWithMarkdown(el: HTMLDivElement, text: string): void {
  el.textContent = "";
  if (!text) {
    el.appendChild(document.createTextNode("\u00A0"));
    return;
  }
  const lines = parseMarkdownLines(text);
  lines.forEach((segments, i) => {
    if (i > 0) el.appendChild(document.createTextNode("\n"));
    if (segments.length === 0) {
      el.appendChild(document.createTextNode("\u00A0"));
      return;
    }
    for (const seg of segments) {
      let node: Node = document.createTextNode(seg.text);
      if (seg.style.code) {
        const code = document.createElement("code");
        code.style.fontFamily = "monospace";
        code.appendChild(node);
        node = code;
      }
      if (seg.style.bold) { const b = document.createElement("b"); b.appendChild(node); node = b; }
      if (seg.style.italic) { const em = document.createElement("i"); em.appendChild(node); node = em; }
      if (seg.style.strikethrough) { const s = document.createElement("s"); s.appendChild(node); node = s; }
      el.appendChild(node);
    }
  });
}

function buildMeasurer(getEl: () => HTMLDivElement): TextMeasurer {
  return {
    measure(text: string, style?: NodeStyle, literal?: boolean) {
      const el = getEl();
      applyStyle(el, style);
      el.style.whiteSpace = "pre";
      el.style.width = "";
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
      el.style.whiteSpace = "pre-wrap";
      el.style.wordBreak = "break-word";
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
