// ABOUTME: SVG export using XMLSerializer on the rendered SVG element.
// ABOUTME: Triggers a download of the serialized SVG file.

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

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgEl);
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  downloadBlob(blob, "mindmap.svg");
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

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgEl);
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
      if (pngBlob) downloadBlob(pngBlob, "mindmap.png");
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
