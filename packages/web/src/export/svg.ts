// ABOUTME: SVG export using XMLSerializer on the rendered SVG element.
// ABOUTME: Triggers a download of the serialized SVG file.

import { THEME_CSS_VARS } from "@limn/core";
import type { DerivedThemeVars } from "@limn/core";

/** Build a CSS style block that defines all theme variables on the svg element. */
export function buildThemeStyleBlock(vars: DerivedThemeVars): string {
  const lines = Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");
  return `svg {\n${lines}\n}`;
}

/** Read the current theme CSS variables from a DOM element's computed style. */
function readComputedThemeVars(el: Element): DerivedThemeVars {
  const style = getComputedStyle(el);
  const vars: Record<string, string> = {};
  for (const name of THEME_CSS_VARS) {
    vars[name] = style.getPropertyValue(name).trim();
  }
  return vars as unknown as DerivedThemeVars;
}

/** Clone an SVG element and inject theme CSS variables into a <defs><style> block. */
function serializeWithTheme(svgEl: Element): string {
  const clone = svgEl.cloneNode(true) as Element;
  const vars = readComputedThemeVars(svgEl);
  const css = buildThemeStyleBlock(vars);

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
  const svgEl = document.querySelector("svg[data-limn-canvas]");
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
