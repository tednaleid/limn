// ABOUTME: Pure color math utilities for theme derivation.
// ABOUTME: Hex parsing, mixing, lightening, and rgba output with no external deps.

/** Parse a "#rrggbb" hex string into [r, g, b] (0-255). */
export function parseHex(hex: string): [number, number, number] {
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  if (h.length !== 6) throw new Error(`Invalid hex color: ${hex}`);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Convert [r, g, b] (0-255) back to "#rrggbb". */
export function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    clamp(r).toString(16).padStart(2, "0") +
    clamp(g).toString(16).padStart(2, "0") +
    clamp(b).toString(16).padStart(2, "0")
  );
}

/** Format a hex color as "rgba(r, g, b, a)". */
export function toRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Mix two hex colors by a weight (0 = all colorA, 1 = all colorB).
 * Returns "#rrggbb".
 */
export function mix(colorA: string, colorB: string, weight: number): string {
  const [r1, g1, b1] = parseHex(colorA);
  const [r2, g2, b2] = parseHex(colorB);
  const w = Math.max(0, Math.min(1, weight));
  return toHex(
    r1 + (r2 - r1) * w,
    g1 + (g2 - g1) * w,
    b1 + (b2 - b1) * w,
  );
}

/**
 * Lighten a hex color by blending toward white.
 * Amount 0 = unchanged, 1 = pure white.
 */
export function lighten(hex: string, amount: number): string {
  return mix(hex, "#ffffff", amount);
}
