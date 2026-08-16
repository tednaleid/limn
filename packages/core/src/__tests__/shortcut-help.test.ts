import { describe, test, expect } from "vitest";
import { SHORTCUT_GROUPS, filterShortcutGroups } from "../keybindings/shortcutHelp";
import type { ShortcutGroup, ShortcutEntry } from "../keybindings/shortcutHelp";
import { FULL_CAPABILITIES, OUTLINE_CAPABILITIES } from "../editor/capabilities";

describe("shortcut help data", () => {
  test("has seven groups", () => {
    expect(SHORTCUT_GROUPS).toHaveLength(7);
  });

  test("group titles match expected order", () => {
    const titles = SHORTCUT_GROUPS.map((g) => g.title);
    expect(titles).toEqual([
      "Navigation",
      "Node Operations",
      "Structure",
      "Positioning",
      "Text Editing",
      "Global",
      "Mouse",
    ]);
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

describe("filterShortcutGroups", () => {
  test("full capabilities keep every group and entry", () => {
    const filtered = filterShortcutGroups(SHORTCUT_GROUPS, FULL_CAPABILITIES);
    expect(filtered).toEqual(SHORTCUT_GROUPS);
  });

  test("outline capabilities drop nudge and color entries and drop a group that becomes empty", () => {
    const filtered = filterShortcutGroups(SHORTCUT_GROUPS, OUTLINE_CAPABILITIES);
    const descriptions = filtered.flatMap((g) => g.entries.map((e) => e.description));
    expect(descriptions).not.toContain("Nudge node");
    expect(descriptions).not.toContain("Cycle branch color forward");
    expect(descriptions).toContain("Reflow children to computed layout");
    expect(descriptions).toContain("Toggle collapse");
    for (const group of filtered) expect(group.entries.length).toBeGreaterThan(0);
  });
});
