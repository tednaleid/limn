// ABOUTME: Tests for plugin settings defaults and merging of saved data.
// ABOUTME: Unknown or malformed saved values fall back to the defaults.

import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "../settings";

describe("mergeSettings", () => {
  it("returns the defaults for missing data", () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.openMarkedNotesAs).toBe("mindmap");
    expect(DEFAULT_SETTINGS.themeMode).toBe("system");
  });

  it("keeps known values and ignores unknown or malformed ones", () => {
    expect(mergeSettings({ openMarkedNotesAs: "markdown", themeMode: "dark", extra: 1 }))
      .toEqual({ ...DEFAULT_SETTINGS, openMarkedNotesAs: "markdown", themeMode: "dark" });
    expect(mergeSettings({ openMarkedNotesAs: "kanban", themeMode: 3 })).toEqual(DEFAULT_SETTINGS);
  });
});
