// ABOUTME: Settings tab for the Limn plugin.
// ABOUTME: Two settings: how marked notes open, and the theme mode for Markdown-backed mind maps.

import { PluginSettingTab, Setting, type App } from "obsidian";
import { THEME_MODES } from "./settings";
import type LimnPlugin from "./main";

export class LimnSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: LimnPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Open notes with limn-plugin: true as")
      .setDesc("Notes with this frontmatter key open as a mind map by default. Any note can still be opened either way from its menu.")
      .addDropdown((dropdown) => dropdown
        .addOption("mindmap", "Mind map")
        .addOption("markdown", "Markdown")
        .setValue(this.plugin.settings.openMarkedNotesAs)
        .onChange(async (value) => {
          this.plugin.settings.openMarkedNotesAs = value === "markdown" ? "markdown" : "mindmap";
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Theme")
      .setDesc("Color mode for mind map notes. .limn files keep their own theme.")
      .addDropdown((dropdown) => dropdown
        .addOption("system", "System")
        .addOption("light", "Light")
        .addOption("dark", "Dark")
        .setValue(this.plugin.settings.themeMode)
        .onChange(async (value) => {
          this.plugin.settings.themeMode = THEME_MODES.has(value) ? value : "system";
          await this.plugin.saveSettings();
          this.plugin.applyThemeSettingToMarkdownViews();
        }));
  }
}
