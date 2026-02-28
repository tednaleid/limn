// ABOUTME: DOM-based TextMeasurer using an off-screen element.
// ABOUTME: Measures actual text dimensions for accurate node sizing.

import type { TextMeasurer, NodeStyle } from "@limn/core";
import { parseMarkdownLines } from "@limn/core";

const FONT_SIZE = 14;
const FONT_FAMILY = "system-ui, -apple-system, sans-serif";
const LINE_HEIGHT = 20;
const PADDING_X = 10;
const PADDING_Y = 6;
const MIN_WIDTH = 100;

let measureEl: HTMLDivElement | null = null;

function getMeasureElement(): HTMLDivElement {
  if (measureEl) return measureEl;
  measureEl = createMeasureElement(document.body);
  return measureEl;
}

function createMeasureElement(container: HTMLElement): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "limn-measure";
  el.style.position = "absolute";
  el.style.visibility = "hidden";
  el.style.whiteSpace = "pre";
  el.style.fontSize = `${FONT_SIZE}px`;
  el.style.fontFamily = FONT_FAMILY;
  el.style.lineHeight = `${LINE_HEIGHT}px`;
  el.style.padding = `${PADDING_Y}px ${PADDING_X}px`;
  el.style.boxSizing = "border-box";
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

/** Escape HTML special characters for safe innerHTML use. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Convert raw markdown text to HTML for accurate measurement of styled text. */
function markdownToHtml(text: string): string {
  if (!text) return "\u00A0";
  const parsed = parseMarkdownLines(text);
  return parsed
    .map((segments) => {
      if (segments.length === 0) return "\u00A0";
      return segments
        .map((seg) => {
          let html = escapeHtml(seg.text);
          if (seg.style.code) html = `<code style="font-family:monospace">${html}</code>`;
          if (seg.style.bold) html = `<b>${html}</b>`;
          if (seg.style.italic) html = `<i>${html}</i>`;
          if (seg.style.strikethrough) html = `<s>${html}</s>`;
          return html;
        })
        .join("");
    })
    .join("\n");
}

function buildMeasurer(getEl: () => HTMLDivElement): TextMeasurer {
  return {
    measure(text: string, style?: NodeStyle) {
      const el = getEl();
      applyStyle(el, style);
      el.style.whiteSpace = "pre";
      el.style.width = "";
      el.innerHTML = markdownToHtml(text);
      // Buffer accounts for SVG text rendering wider than DOM measurement
      const width = Math.max(MIN_WIDTH, Math.ceil(el.offsetWidth) + 4);
      const height = Math.max(32, Math.ceil(el.offsetHeight));
      return { width, height };
    },

    reflow(text: string, maxWidth: number, style?: NodeStyle) {
      const el = getEl();
      applyStyle(el, style);
      el.style.whiteSpace = "pre-wrap";
      el.style.wordBreak = "break-word";
      el.style.width = `${maxWidth}px`;
      el.innerHTML = markdownToHtml(text);
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
