// ABOUTME: Obsidian plugin entry point for Limn mind maps.
// ABOUTME: Registers the .limn file extension and LimnView for viewing/editing.

import { Plugin } from "obsidian";
import { LimnView, VIEW_TYPE_LIMN } from "./LimnView";

export default class LimnPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE_LIMN, (leaf) => new LimnView(leaf, this));
    this.registerExtensions(["limn"], VIEW_TYPE_LIMN);

    this.addCommand({
      id: "create-new-limn",
      name: "Create new mind map",
      callback: () => this.createNewFile(),
    });
  }

  onunload() {
    // Views are cleaned up by Obsidian via onClose()
  }

  private async createNewFile(): Promise<void> {
    const folder = this.app.vault.getRoot();
    let name = "Untitled.limn";
    let i = 1;
    while (this.app.vault.getAbstractFileByPath(`${folder.path}${name}`)) {
      name = `Untitled ${i}.limn`;
      i++;
    }
    const file = await this.app.vault.create(`${folder.path}${name}`, "");
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }
}
