// ABOUTME: Unit tests for platform-aware key display names.
// ABOUTME: Verifies Mac vs Windows/Linux modifier name translations.

import { describe, test, expect } from "vitest";
import { displayKey } from "../keybindings/platformKeys";
import type { Platform } from "../keybindings/platformKeys";

describe("displayKey", () => {
  describe("mac platform", () => {
    const mac: Platform = "mac";

    test("Meta maps to Cmd", () => {
      expect(displayKey("Meta", mac)).toBe("Cmd");
    });

    test("Cmd passes through as Cmd", () => {
      expect(displayKey("Cmd", mac)).toBe("Cmd");
    });

    test("Alt maps to Opt", () => {
      expect(displayKey("Alt", mac)).toBe("Opt");
    });

    test("Control maps to Ctrl", () => {
      expect(displayKey("Control", mac)).toBe("Ctrl");
    });

    test("Ctrl passes through as Ctrl", () => {
      expect(displayKey("Ctrl", mac)).toBe("Ctrl");
    });
  });

  describe("other platform (Windows/Linux)", () => {
    const other: Platform = "other";

    test("Meta maps to Ctrl", () => {
      expect(displayKey("Meta", other)).toBe("Ctrl");
    });

    test("Cmd maps to Ctrl", () => {
      expect(displayKey("Cmd", other)).toBe("Ctrl");
    });

    test("Alt stays Alt", () => {
      expect(displayKey("Alt", other)).toBe("Alt");
    });

    test("Control maps to Ctrl", () => {
      expect(displayKey("Control", other)).toBe("Ctrl");
    });

    test("Ctrl passes through as Ctrl", () => {
      expect(displayKey("Ctrl", other)).toBe("Ctrl");
    });
  });

  describe("non-modifier keys (same on both platforms)", () => {
    const platforms: Platform[] = ["mac", "other"];

    test("arrow keys use unicode symbols", () => {
      for (const p of platforms) {
        expect(displayKey("ArrowUp", p)).toBe("\u2191");
        expect(displayKey("ArrowDown", p)).toBe("\u2193");
        expect(displayKey("ArrowLeft", p)).toBe("\u2190");
        expect(displayKey("ArrowRight", p)).toBe("\u2192");
      }
    });

    test("Space key", () => {
      for (const p of platforms) {
        expect(displayKey(" ", p)).toBe("Space");
      }
    });

    test("Escape maps to Esc", () => {
      for (const p of platforms) {
        expect(displayKey("Escape", p)).toBe("Esc");
      }
    });

    test("special keys pass through", () => {
      for (const p of platforms) {
        expect(displayKey("Tab", p)).toBe("Tab");
        expect(displayKey("Enter", p)).toBe("Enter");
        expect(displayKey("Backspace", p)).toBe("Backspace");
        expect(displayKey("Delete", p)).toBe("Delete");
        expect(displayKey("Shift", p)).toBe("Shift");
      }
    });

    test("unknown keys pass through unchanged", () => {
      for (const p of platforms) {
        expect(displayKey("a", p)).toBe("a");
        expect(displayKey("F1", p)).toBe("F1");
        expect(displayKey("Z", p)).toBe("Z");
      }
    });
  });
});
