// ABOUTME: Settings tab for the Limn plugin.
// ABOUTME: Two settings: how marked notes open, and the theme mode for Markdown-backed mind maps.

import { PluginSettingTab, Setting, type App, type SettingDefinitionItem } from "obsidian";
import { mergeSettings } from "./settings";
import type LimnPlugin from "./main";

interface DropdownSetting {
  key: "openMarkedNotesAs" | "themeMode";
  name: string;
  desc: string;
  options: Record<string, string>;
}

const SETTINGS: DropdownSetting[] = [
  {
    key: "openMarkedNotesAs",
    name: "Open notes with limn-plugin: true as",
    desc: "Notes with this frontmatter key open as a mind map by default. Any note can still be opened either way from its menu.",
    options: { mindmap: "Mind map", markdown: "Markdown" },
  },
  {
    key: "themeMode",
    name: "Theme",
    desc: "Color mode for mind map notes. .limn files keep their own theme.",
    options: { system: "System", light: "Light", dark: "Dark" },
  },
];

export class LimnSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: LimnPlugin) {
    super(app, plugin);
  }

  /** Obsidian 1.13 and later render the tab from these and list them in settings search. */
  getSettingDefinitions(): SettingDefinitionItem[] {
    return SETTINGS.map(({ key, name, desc, options }) => ({ name, desc, control: { type: "dropdown", key, options } }));
  }

  getControlValue(key: string): unknown {
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  /** A value that is not one of the setting's options falls back to its default. */
  async setControlValue(key: string, value: unknown): Promise<void> {
    this.plugin.settings = mergeSettings({ ...this.plugin.settings, [key]: value });
    await this.plugin.saveSettings();
    if (key === "themeMode") this.plugin.applyThemeSettingToMarkdownViews();
  }

  /** Obsidian before 1.13 renders the tab by calling this. */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    for (const { key, name, desc, options } of SETTINGS) {
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addDropdown((dropdown) => dropdown
          .addOptions(options)
          .setValue(String(this.getControlValue(key)))
          .onChange((value) => this.setControlValue(key, value)));
    }
  }
}
