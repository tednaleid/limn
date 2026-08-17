// ABOUTME: Resolves the size an image is drawn at from its stored size and its asset's natural size.
// ABOUTME: A stored dimension of 0 means "not specified"; the natural size fills it in once known.

import type { Asset, ImageRef } from "../model/types";

/** Widest an image is drawn when the document does not specify a width. */
export const DEFAULT_IMAGE_DISPLAY_WIDTH = 300;

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * The size to draw an image at, or null while it cannot be determined.
 * Stored dimensions win. A missing width falls back to the natural width capped at
 * DEFAULT_IMAGE_DISPLAY_WIDTH; a missing height keeps the natural aspect ratio.
 */
export function imageDisplaySize(image: ImageRef, asset: Asset | undefined): ImageSize | null {
  const natural = asset && asset.width > 0 && asset.height > 0 ? asset : null;
  const width = image.width > 0
    ? image.width
    : natural ? Math.min(natural.width, DEFAULT_IMAGE_DISPLAY_WIDTH) : 0;
  const height = image.height > 0
    ? image.height
    : natural ? Math.round((width * natural.height) / natural.width) : 0;
  return width > 0 && height > 0 ? { width, height } : null;
}
