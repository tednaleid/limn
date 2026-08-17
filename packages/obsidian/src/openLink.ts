// ABOUTME: Opens a link followed from a mind map node inside Obsidian.
// ABOUTME: Wikilinks resolve relative to the note and open in a new tab; URLs open in the browser.

import type { App } from "obsidian";

const WIKILINK = /^\[\[(.+)\]\]$/;

export function openLinkFromMap(app: App, url: string, sourcePath: string): void {
  const wiki = WIKILINK.exec(url);
  if (wiki) {
    void app.workspace.openLinkText(wiki[1] ?? "", sourcePath, "tab");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
