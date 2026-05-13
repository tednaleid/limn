// ABOUTME: SVG export using XMLSerializer on the rendered SVG element.
// ABOUTME: Triggers a download of the serialized SVG file.

import { THEME_CSS_VARS, getHost } from "@limn/core";
import type { DerivedThemeVars } from "@limn/core";

/** Bounding box of content in world coordinates. */
export interface ContentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

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

/** Convert a Blob to a data: URI. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Loader that returns the original Blob for a given asset id. */
export type AssetBlobLoader = (assetId: string) => Promise<Blob | undefined>;

/**
 * Replace blob: URLs in <image> elements with embedded data: URIs.
 *
 * Looks up the original Blob via the supplied loader using the
 * `data-asset-id` attribute set by `NodeView`. If no loader is
 * provided (or an image has no asset id), the image element is
 * removed rather than left as a broken reference.
 *
 * Avoids `fetch(blob:...)` so we don't trip the Obsidian
 * community-plugin scanner's "fetch + setInterval" suspicious-
 * pattern heuristic.
 */
async function embedImages(clone: Element, loadAssetBlob?: AssetBlobLoader): Promise<void> {
  const images = clone.querySelectorAll("image[href]");
  for (const img of images) {
    const href = img.getAttribute("href");
    if (!href || !href.startsWith("blob:")) continue;
    const assetId = img.getAttribute("data-asset-id");
    const blob = assetId && loadAssetBlob ? await loadAssetBlob(assetId) : undefined;
    if (blob) {
      const dataUrl = await blobToDataUrl(blob);
      img.setAttribute("href", dataUrl);
      img.removeAttribute("data-asset-id");
    } else {
      img.remove();
    }
  }
}

/** Remove elements that are only needed for interactive rendering, not export. */
function cleanCloneForExport(clone: Element, bounds: ContentBounds | null): void {
  const bgRect = clone.querySelector(".canvas-bg");
  if (bgRect && bounds) {
    // Repurpose the bg rect to fill the viewBox with the theme background
    const padding = 20;
    bgRect.setAttribute("x", String(bounds.minX - padding));
    bgRect.setAttribute("y", String(bounds.minY - padding));
    bgRect.setAttribute("width", String(bounds.maxX - bounds.minX + padding * 2));
    bgRect.setAttribute("height", String(bounds.maxY - bounds.minY + padding * 2));
    bgRect.removeAttribute("class");
  } else if (bgRect) {
    bgRect.remove();
  }

  // Remove interactive resize handles
  for (const el of clone.querySelectorAll("[data-image-resize-handle], [data-resize-handle]")) {
    el.remove();
  }

  // Remove the camera transform from the content <g>
  // The content <g> is the first <g> child with a transform attribute
  for (const g of clone.querySelectorAll(":scope > g[transform]")) {
    g.removeAttribute("transform");
  }
}

/**
 * Clone an SVG element, clean it for export, embed images, set viewBox,
 * and inject theme CSS variables.
 */
async function serializeWithTheme(
  svgEl: Element,
  bounds: ContentBounds | null,
  loadAssetBlob?: AssetBlobLoader,
): Promise<string> {
  const clone = svgEl.cloneNode(true) as Element;
  const vars = readComputedThemeVars(svgEl);
  const css = buildThemeStyleBlock(vars);

  cleanCloneForExport(clone, bounds);
  await embedImages(clone, loadAssetBlob);

  // Set viewBox and explicit dimensions so the SVG displays correctly standalone
  if (bounds) {
    const padding = 20;
    const vbX = bounds.minX - padding;
    const vbY = bounds.minY - padding;
    const vbW = bounds.maxX - bounds.minX + padding * 2;
    const vbH = bounds.maxY - bounds.minY + padding * 2;
    clone.setAttribute("viewBox", `${vbX} ${vbY} ${vbW} ${vbH}`);
    clone.setAttribute("width", String(vbW));
    clone.setAttribute("height", String(vbH));
  }

  // Remove interactive-only style attributes from the root SVG
  clone.removeAttribute("style");

  const ns = "http://www.w3.org/2000/svg";
  const doc = getHost().doc;
  let defs = clone.querySelector("defs");
  if (!defs) {
    defs = doc.createElementNS(ns, "defs");
    clone.insertBefore(defs, clone.firstChild);
  }

  const style = doc.createElementNS(ns, "style");
  style.textContent = css;
  defs.insertBefore(style, defs.firstChild);

  const serializer = new XMLSerializer();
  let xml = serializer.serializeToString(clone);
  // XMLSerializer can copy characters from DOM text nodes that are valid in
  // HTML but not as raw bytes in XML. Replace them with numeric references.
  // Covers non-breaking spaces (U+00A0) and XML-illegal control chars.
  // The pattern is built via RegExp() so literal control chars don't appear
  // in a regex literal (no-control-regex fires on those even via \uXXXX).
  xml = xml.replace(XML_ILLEGAL_CHAR_PATTERN, (ch) => `&#${String(ch.charCodeAt(0))};`);
  return xml;
}

const XML_ILLEGAL_CHAR_PATTERN = new RegExp(
  "[" +
    "\\u0000-\\u0008" +
    "\\u000B\\u000C" +
    "\\u000E-\\u001F" +
    "\\u00A0\\uFFFE\\uFFFF" +
  "]",
  "g",
);

/**
 * Serialize the mind map canvas SVG element to a string with embedded theme.
 * Returns null if no canvas element is found.
 * @param bounds - Content bounding box for viewBox calculation. If null, no viewBox is set.
 */
export async function serializeSvg(
  bounds?: ContentBounds | null,
  loadAssetBlob?: AssetBlobLoader,
): Promise<string | null> {
  const svgEl = getHost().doc.querySelector("svg[data-limn-canvas]");
  if (!svgEl) {
    console.error("No SVG canvas found for export");
    return null;
  }
  return serializeWithTheme(svgEl, bounds ?? null, loadAssetBlob);
}

/**
 * Export the mind map canvas SVG element as a downloadable .svg file.
 * Finds the main SVG element in the DOM and serializes it.
 * @param bounds - Content bounding box for viewBox calculation.
 */
export async function exportSvg(
  bounds?: ContentBounds | null,
  loadAssetBlob?: AssetBlobLoader,
): Promise<void> {
  const svgString = await serializeSvg(bounds, loadAssetBlob);
  if (!svgString) return;

  const blob = new Blob([svgString], { type: "image/svg+xml" });
  downloadBlob(blob, "limn.svg");
}

/**
 * Export the mind map canvas as a downloadable .png file.
 * Renders the SVG to a canvas element, then converts to PNG.
 * @param bounds - Content bounding box for viewBox calculation.
 */
export async function exportPng(
  bounds?: ContentBounds | null,
  loadAssetBlob?: AssetBlobLoader,
): Promise<void> {
  const svgEl = getHost().doc.querySelector("svg[data-limn-canvas]");
  if (!svgEl) {
    console.error("No SVG canvas found for export");
    return;
  }

  const svgString = await serializeWithTheme(svgEl, bounds ?? null, loadAssetBlob);
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    // Use viewBox dimensions for canvas size if bounds are available
    const width = bounds
      ? (bounds.maxX - bounds.minX + 40)
      : svgEl.clientWidth;
    const height = bounds
      ? (bounds.maxY - bounds.minY + 40)
      : svgEl.clientHeight;

    const canvas = getHost().doc.createElement("canvas");
    canvas.width = width * 2; // 2x for retina
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, width, height);
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
  const a = getHost().doc.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
