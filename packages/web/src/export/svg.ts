// ABOUTME: SVG export using XMLSerializer on the rendered SVG element.
// ABOUTME: Triggers a download of the serialized SVG file.

import { THEMES } from "../theme/themes";
import type { Theme } from "../theme/themes";

/** Build a CSS style block that defines all theme variables on the svg element. */
export function buildThemeStyleBlock(theme: Theme): string {
  const vars = Object.entries(theme)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");
  return `svg {\n${vars}\n}`;
}

/** Get the current resolved theme from the document. */
function getCurrentTheme(): Theme {
  const name = document.documentElement.getAttribute("data-theme") ?? "light";
  const theme = THEMES[name] ?? THEMES["light"];
  if (!theme) throw new Error(`Unknown theme: ${name}`);
  return theme;
}

/** Clone an SVG element and inject theme CSS variables into a <defs><style> block. */
function serializeWithTheme(svgEl: Element): string {
  const clone = svgEl.cloneNode(true) as Element;
  const theme = getCurrentTheme();
  const css = buildThemeStyleBlock(theme);

  const ns = "http://www.w3.org/2000/svg";
  let defs = clone.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS(ns, "defs");
    clone.insertBefore(defs, clone.firstChild);
  }

  const style = document.createElementNS(ns, "style");
  style.textContent = css;
  defs.insertBefore(style, defs.firstChild);

  const serializer = new XMLSerializer();
  return serializer.serializeToString(clone);
}

/**
 * Export the mind map canvas SVG element as a downloadable .svg file.
 * Finds the main SVG element in the DOM and serializes it.
 */
export function exportSvg(): void {
  const svgEl = document.querySelector("svg[data-limn-canvas]");
  if (!svgEl) {
    console.error("No SVG canvas found for export");
    return;
  }

  const svgString = serializeWithTheme(svgEl);
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  downloadBlob(blob, "limn.svg");
}

/**
 * Export the mind map canvas as a downloadable .png file.
 * Renders the SVG to a canvas element, then converts to PNG.
 */
export function exportPng(): void {
  const svgEl = document.querySelector("svg[data-limn-canvas]") as SVGSVGElement | null;
  if (!svgEl) {
    console.error("No SVG canvas found for export");
    return;
  }

  const svgString = serializeWithTheme(svgEl);
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = svgEl.clientWidth * 2; // 2x for retina
    canvas.height = svgEl.clientHeight * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    canvas.toBlob((pngBlob) => {
      if (pngBlob) downloadBlob(pngBlob, "limn.png");
    }, "image/png");
  };
  img.src = url;
}

/** Trigger a browser download for a blob. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
