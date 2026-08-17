// ABOUTME: Keeps an Editor in step with a Markdown note's outline: note text in, note text out.
// ABOUTME: Pure TypeScript with no Obsidian or DOM dependencies so the sync rules are unit-testable.

import {
  parseOutline, writeOutline, writeNodes, outlineToFileNodes, fileNodesToOutline, generateNodeId,
  CURRENT_FORMAT_VERSION,
} from "@limn/core";
import type {
  Editor, Asset, MindMapFileFormat, MindMapFileNode, OutlineNode, OutlineRegion, ParsedOutline,
} from "@limn/core";

/** Theme the map is drawn with; the note stores none, so the host supplies it. */
export interface OutlineTheme {
  mode: string;
  lightTheme: string;
  darkTheme: string;
}

/** The part of TextFileView the document talks to. */
export interface SaveHost {
  /** Text last loaded from or saved to disk. */
  readonly data: string;
  requestSave(): void;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
};

/** Mime type guessed from a file name's extension; unknown extensions are octet-stream. */
export function mimeTypeForName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

/**
 * Adds an empty list region to a note that had none. The region goes after the note's prose,
 * separated by a blank line, and before the note's trailing blank lines so those stay trailing.
 * Returns the new region's index.
 */
function appendListRegion(regions: OutlineRegion[]): number {
  const last = regions[regions.length - 1];
  if (!last || last.kind !== "prose") {
    regions.push({ kind: "list", roots: [] });
    return regions.length - 1;
  }
  let end = last.lines.length;
  while (end > 0 && (last.lines[end - 1] ?? "").trim() === "") end--;
  const content = last.lines.slice(0, end);
  const trailing = last.lines.slice(end);
  regions.pop();
  if (content.length > 0) regions.push({ kind: "prose", lines: [...content, ""] });
  regions.push({ kind: "list", roots: [] });
  const index = regions.length - 1;
  if (trailing.length > 0) regions.push({ kind: "prose", lines: trailing });
  return index;
}

export class OutlineDocument {
  private parsed: ParsedOutline = { frontmatterLines: [], regions: [] };
  /** Index into parsed.regions of the list region each root came from. */
  private regionOfRoot = new Map<string, number>();
  private naturalSizes = new Map<string, { width: number; height: number }>();
  /** Canonical text of the note as last loaded (see attach). */
  private baseline = "";
  /** Exact text last loaded from or written to disk. */
  private diskText = "";
  private loading = false;
  private readonly docId = crypto.randomUUID();

  constructor(readonly editor: Editor, private readonly theme: () => OutlineTheme) {}

  /**
   * Replace the map with the note's outline. `clear` for a fresh file; otherwise the note changed
   * elsewhere and is merged into the current map, keeping ids (and so selection) where nodes match.
   */
  load(text: string, clear: boolean): void {
    if (!clear) this.rememberNaturalSizes();
    const parsed = parseOutline(text);
    const roots: MindMapFileNode[] = [];
    const regionByRootIndex: number[] = [];
    parsed.regions.forEach((region, index) => {
      if (region.kind !== "list") return;
      for (const root of outlineToFileNodes(region.roots, generateNodeId)) {
        roots.push(root);
        regionByRootIndex.push(index);
      }
    });
    const data: MindMapFileFormat = {
      version: CURRENT_FORMAT_VERSION,
      meta: { id: this.docId, ...this.theme() },
      camera: clear ? { x: 0, y: 0, zoom: 1 } : this.editor.getCamera(),
      roots,
      assets: this.assetsFor(roots),
    };
    this.loading = true;
    try {
      if (clear) this.editor.loadJSON(data);
      else this.editor.applyExternalUpdate(data, { reconcileIds: true });
      this.parsed = parsed;
      // Reconciliation renames incoming roots but keeps their order, so the Editor's roots line up
      // with regionByRootIndex one to one.
      this.regionOfRoot = new Map();
      this.editor.getRoots().forEach((root, i) => {
        const region = regionByRootIndex[i];
        if (region !== undefined) this.regionOfRoot.set(root.id, region);
      });
      this.editor.remeasureAllNodes();
      this.editor.relayoutAll();
    } finally {
      this.loading = false;
    }
    this.baseline = this.text();
    this.diskText = text;
  }

  /** The note text for the current map: prose regions verbatim, list regions regenerated. */
  text(): string {
    const regions = this.parsed.regions.slice();
    const converted = this.editor.toJSON().roots.map((root) => ({
      region: this.regionOfRoot.get(root.id),
      outline: fileNodesToOutline([root]),
    }));
    const listIndexes = regions.flatMap((region, i) => (region.kind === "list" ? [i] : []));
    let lastList = listIndexes[listIndexes.length - 1];
    if (lastList === undefined) {
      // No list region to hold the roots yet. Only add one if a root would actually render:
      // an empty node still being edited must not turn prose-only text into a save request.
      const allOutlineRoots = converted.flatMap((c) => c.outline);
      if (writeNodes(allOutlineRoots).length === 0) return writeOutline(this.parsed);
      lastList = appendListRegion(regions);
    }
    const rootsByRegion = new Map<number, OutlineNode[]>();
    for (const { region, outline } of converted) {
      const index = region ?? lastList;
      const list = rootsByRegion.get(index) ?? [];
      list.push(...outline);
      rootsByRegion.set(index, list);
    }
    const out: OutlineRegion[] = regions.map((region, i) =>
      region.kind === "list" ? { kind: "list", roots: rootsByRegion.get(i) ?? [] } : region,
    );
    return writeOutline({ ...this.parsed, regions: out });
  }

  /** Text for the host to write. Unchanged maps hand back the note exactly as it was loaded or
   *  last written, so viewing a note never rewrites it; after a change the map counts as in step
   *  with the note. */
  viewData(): string {
    const text = this.text();
    if (text === this.baseline) return this.diskText;
    this.baseline = text;
    this.diskText = text;
    return text;
  }

  /** Forget the note; the map becomes empty. */
  clear(): void {
    this.parsed = { frontmatterLines: [], regions: [] };
    this.regionOfRoot = new Map();
    this.loading = true;
    try {
      this.editor.loadJSON({
        version: CURRENT_FORMAT_VERSION,
        meta: { id: this.docId, ...this.theme() },
        camera: { x: 0, y: 0, zoom: 1 },
        roots: [],
        assets: [],
      });
    } finally {
      this.loading = false;
    }
    this.baseline = "";
    this.diskText = "";
  }

  /**
   * Ask the host to save whenever the map's text departs from what is on disk. Until the note has
   * been written once, its canonical form also counts as "on disk", so a note that only differs by
   * formatting is not rewritten by a selection or camera change. Returns the unsubscribe function.
   */
  attach(host: SaveHost): () => void {
    return this.editor.subscribe(() => {
      if (this.loading) return;
      const text = this.text();
      if (text !== host.data && text !== this.baseline) host.requestSave();
    });
  }

  hasNaturalSize(assetId: string): boolean {
    return this.naturalSizes.has(assetId);
  }

  /** Record an image's natural size and let the map draw it. Sizes survive later loads. */
  setImageNaturalSize(assetId: string, width: number, height: number): void {
    this.naturalSizes.set(assetId, { width, height });
    this.editor.setAssetNaturalSize(assetId, width, height);
  }

  private rememberNaturalSizes(): void {
    for (const asset of this.editor.getAssets()) {
      if (asset.width > 0 && asset.height > 0) {
        this.naturalSizes.set(asset.id, { width: asset.width, height: asset.height });
      }
    }
  }

  /** One asset per distinct embed target, with the natural size when it is already known. */
  private assetsFor(roots: MindMapFileNode[]): Asset[] {
    const assets = new Map<string, Asset>();
    const visit = (node: MindMapFileNode) => {
      const id = node.image?.assetId;
      if (id !== undefined && !assets.has(id)) {
        const size = this.naturalSizes.get(id);
        assets.set(id, {
          id, filename: id, mimeType: mimeTypeForName(id),
          width: size?.width ?? 0, height: size?.height ?? 0,
        });
      }
      node.children.forEach(visit);
    };
    roots.forEach(visit);
    return [...assets.values()];
  }
}
