import { describe, test, expect } from "vitest";
import { SHORTCUT_GROUPS } from "../keybindings/shortcutHelp";
import type { ShortcutGroup, ShortcutEntry } from "../keybindings/shortcutHelp";

describe("shortcut help data", () => {
  test("has four groups", () => {
    expect(SHORTCUT_GROUPS).toHaveLength(4);
  });

  test("group titles are Navigation, Editing, Global, Mouse", () => {
    const titles = SHORTCUT_GROUPS.map((g) => g.title);
    expect(titles).toEqual(["Navigation", "Editing", "Global", "Mouse"]);
  });

  test("each group has a valid type", () => {
    for (const group of SHORTCUT_GROUPS) {
      expect(["keyboard", "mouse"]).toContain(group.type);
    }
  });

  test("only Mouse group has type mouse", () => {
    for (const group of SHORTCUT_GROUPS) {
      if (group.title === "Mouse") {
        expect(group.type).toBe("mouse");
      } else {
        expect(group.type).toBe("keyboard");
      }
    }
  });

  test("every group has at least one entry", () => {
    for (const group of SHORTCUT_GROUPS) {
      expect(group.entries.length).toBeGreaterThan(0);
    }
  });

  test("every entry has non-empty keys and description", () => {
    for (const group of SHORTCUT_GROUPS) {
      for (const entry of group.entries) {
        expect(entry.keys.length).toBeGreaterThan(0);
        expect(entry.description.length).toBeGreaterThan(0);
      }
    }
  });

  test("altKeys are only on keyboard entries", () => {
    for (const group of SHORTCUT_GROUPS) {
      for (const entry of group.entries) {
        if (entry.altKeys) {
          expect(group.type).toBe("keyboard");
        }
      }
    }
  });

  test("exports types correctly", () => {
    // Type-level checks -- these just need to compile
    const group: ShortcutGroup = SHORTCUT_GROUPS[0];
    const entry: ShortcutEntry = group.entries[0];
    expect(group.title).toBeDefined();
    expect(entry.keys).toBeDefined();
  });
});
