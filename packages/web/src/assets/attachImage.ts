// ABOUTME: Attaches an image file to a node (or a new root) and stores it through the persistence provider.
// ABOUTME: Shared by web paste, canvas drop, and the Obsidian views so naming, sizing, and ids agree.

import type { Editor, PersistenceProvider } from "@limn/core";
import { DEFAULT_IMAGE_DISPLAY_WIDTH } from "@limn/core";
import type { AssetAddedDetail } from "../limn-window";

export interface ImageSize {
  width: number;
  height: number;
}

/** Where a new image goes: onto an existing node, or a new root at a canvas position. */
export type ImageTarget = { nodeId: string } | { x: number; y: number };

/** Display size for a freshly added image: natural size, shrunk to fit DEFAULT_IMAGE_DISPLAY_WIDTH. */
export function fitDisplaySize(naturalWidth: number, naturalHeight: number): ImageSize {
  const scale = Math.min(1, DEFAULT_IMAGE_DISPLAY_WIDTH / naturalWidth);
  return { width: Math.round(naturalWidth * scale), height: Math.round(naturalHeight * scale) };
}

/** File name for a pasted image, in the style Obsidian uses: "Pasted image 20260816090507.png". */
export function pastedImageName(mimeType: string, now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
    + `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const subtype = mimeType.split("/")[1] ?? "png";
  const ext = subtype === "jpeg" ? "jpg" : subtype;
  return `Pasted image ${stamp}.${ext}`;
}

/** The first image file on a clipboard payload, or null. */
export function imageFileFromTransfer(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of data.items) {
    if (item.type.startsWith("image/")) return item.getAsFile();
  }
  return null;
}

/** Natural size of an image blob, decoded through an Image element. */
export function loadImageSize(blob: Blob): Promise<ImageSize> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    img.src = url;
  });
}

/**
 * Store an image and attach it to the target. The provider chooses the asset id when it can
 * (importAsset); otherwise a timestamp id is used and the blob goes through saveAsset. Announces the
 * display URL with a `limn:asset-added` event once the node is updated.
 */
export async function attachImageFile(
  editor: Editor,
  provider: PersistenceProvider,
  file: Blob,
  filename: string,
  target: ImageTarget,
): Promise<void> {
  const natural = await loadImageSize(file);
  let assetId: string;
  if (provider.importAsset) {
    assetId = await provider.importAsset(filename, file);
  } else {
    assetId = `a${Date.now()}`;
    await provider.saveAsset(assetId, file);
  }
  const asset = { id: assetId, filename, mimeType: file.type, width: natural.width, height: natural.height };
  const display = fitDisplaySize(natural.width, natural.height);
  if ("nodeId" in target) {
    editor.setNodeImage(target.nodeId, asset, display.width, display.height);
  } else {
    // setNodeImage before exitEditMode so the image keeps the empty node from being deleted
    const rootId = editor.addRoot("", target.x, target.y);
    editor.setNodeImage(rootId, asset, display.width, display.height);
    editor.exitEditMode();
  }
  const detail: AssetAddedDetail = { assetId, blobUrl: URL.createObjectURL(file) };
  window.dispatchEvent(new CustomEvent("limn:asset-added", { detail }));
}
