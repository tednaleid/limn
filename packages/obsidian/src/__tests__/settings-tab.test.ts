// ABOUTME: Tests for the settings tab: the definitions Obsidian's settings search reads, and value changes.
// ABOUTME: Runs against the stand-in obsidian module, so only the tab's own logic is exercised.

import { describe, it, expect, vi } from "vitest";
import type { App } from "obsidian";
import type LimnPlugin from "../main";
import { LimnSettingTab } from "../LimnSettingTab";
import { DEFAULT_SETTINGS } from "../settings";

function makeTab() {
  const plugin = {
    settings: { ...DEFAULT_SETTINGS },
    saveSettings: vi.fn(() => Promise.resolve()),
    applyThemeSettingToMarkdownViews: vi.fn(),
  };
  const tab = new LimnSettingTab({} as App, plugin as unknown as LimnPlugin);
  return { tab, plugin };
}

describe("LimnSettingTab", () => {
  it("defines both settings as dropdowns keyed by their settings field", () => {
    const { tab } = makeTab();
    const controls = tab.getSettingDefinitions().map((item) => ("control" in item ? item.control : undefined));
    expect(controls).toEqual([
      { type: "dropdown", key: "openMarkedNotesAs", options: { mindmap: "Mind map", markdown: "Markdown" } },
      { type: "dropdown", key: "themeMode", options: { system: "System", light: "Light", dark: "Dark" } },
    ]);
  });

  it("reads a control's value from the plugin settings", () => {
    const { tab, plugin } = makeTab();
    plugin.settings.openMarkedNotesAs = "markdown";
    expect(tab.getControlValue("openMarkedNotesAs")).toBe("markdown");
  });

  it("saves a changed value, and applies a theme change to open maps", async () => {
    const { tab, plugin } = makeTab();
    await tab.setControlValue("openMarkedNotesAs", "markdown");
    expect(plugin.settings.openMarkedNotesAs).toBe("markdown");
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.applyThemeSettingToMarkdownViews).not.toHaveBeenCalled();

    await tab.setControlValue("themeMode", "dark");
    expect(plugin.settings.themeMode).toBe("dark");
    expect(plugin.applyThemeSettingToMarkdownViews).toHaveBeenCalledTimes(1);
  });

  it("falls back to the default for a value that is not one of the options", async () => {
    const { tab, plugin } = makeTab();
    plugin.settings.themeMode = "dark";
    await tab.setControlValue("themeMode", "neon");
    expect(plugin.settings.themeMode).toBe("system");
  });
});
