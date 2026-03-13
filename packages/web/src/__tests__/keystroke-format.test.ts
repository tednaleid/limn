// ABOUTME: Unit tests for keystroke overlay key formatting logic.
// ABOUTME: Covers modifier ordering, special key names, and edge cases.

import { describe, test, expect } from "vitest";
import { formatKeystrokeParts } from "../input/formatKeystroke";

describe("formatKeystrokeParts", () => {
  describe("mac platform", () => {
    const mac = "mac" as const;

    test("single letter key stays lowercase", () => {
      expect(formatKeystrokeParts(new Set(["a"]), mac)).toEqual(["a"]);
    });

    test("modifier ordering: Ctrl, Opt, Shift, Cmd", () => {
      const held = new Set(["Control", "Alt", "Shift", "Meta", "x"]);
      expect(formatKeystrokeParts(held, mac)).toEqual(["Ctrl", "Opt", "Shift", "Cmd", "x"]);
    });

    test("Meta maps to Cmd", () => {
      const held = new Set(["Meta", "z"]);
      expect(formatKeystrokeParts(held, mac)).toEqual(["Cmd", "z"]);
    });

    test("Control maps to Ctrl", () => {
      const held = new Set(["Control", "a"]);
      expect(formatKeystrokeParts(held, mac)).toEqual(["Ctrl", "a"]);
    });

    test("Alt maps to Opt", () => {
      const held = new Set(["Alt", "j"]);
      expect(formatKeystrokeParts(held, mac)).toEqual(["Opt", "j"]);
    });

    test("arrow keys use unicode symbols", () => {
      expect(formatKeystrokeParts(new Set(["ArrowUp"]), mac)).toEqual(["\u2191"]);
      expect(formatKeystrokeParts(new Set(["ArrowDown"]), mac)).toEqual(["\u2193"]);
      expect(formatKeystrokeParts(new Set(["ArrowLeft"]), mac)).toEqual(["\u2190"]);
      expect(formatKeystrokeParts(new Set(["ArrowRight"]), mac)).toEqual(["\u2192"]);
    });

    test("space key shows Space", () => {
      expect(formatKeystrokeParts(new Set([" "]), mac)).toEqual(["Space"]);
    });

    test("Escape shows Esc", () => {
      expect(formatKeystrokeParts(new Set(["Escape"]), mac)).toEqual(["Esc"]);
    });

    test("Tab shows Tab", () => {
      expect(formatKeystrokeParts(new Set(["Tab"]), mac)).toEqual(["Tab"]);
    });

    test("Enter shows Enter", () => {
      expect(formatKeystrokeParts(new Set(["Enter"]), mac)).toEqual(["Enter"]);
    });

    test("Backspace shows Backspace", () => {
      expect(formatKeystrokeParts(new Set(["Backspace"]), mac)).toEqual(["Backspace"]);
    });

    test("modifier-only shows just the modifier", () => {
      expect(formatKeystrokeParts(new Set(["Shift"]), mac)).toEqual(["Shift"]);
    });

    test("multiple modifiers only shows the modifiers", () => {
      const held = new Set(["Control", "Shift"]);
      expect(formatKeystrokeParts(held, mac)).toEqual(["Ctrl", "Shift"]);
    });

    test("modifier + non-modifier key shows both", () => {
      const held = new Set(["Shift", "Enter"]);
      expect(formatKeystrokeParts(held, mac)).toEqual(["Shift", "Enter"]);
    });

    test("Ctrl+Shift+K combo", () => {
      const held = new Set(["Control", "Shift", "K"]);
      expect(formatKeystrokeParts(held, mac)).toEqual(["Ctrl", "Shift", "K"]);
    });

    test("empty set returns empty array", () => {
      expect(formatKeystrokeParts(new Set(), mac)).toEqual([]);
    });

    test("Alt+arrow combo", () => {
      const held = new Set(["Alt", "ArrowUp"]);
      expect(formatKeystrokeParts(held, mac)).toEqual(["Opt", "\u2191"]);
    });
  });

  describe("other platform (Windows/Linux)", () => {
    const other = "other" as const;

    test("Meta maps to Ctrl (not Cmd)", () => {
      const held = new Set(["Meta", "z"]);
      expect(formatKeystrokeParts(held, other)).toEqual(["Ctrl", "z"]);
    });

    test("Alt stays Alt (not Opt)", () => {
      const held = new Set(["Alt", "j"]);
      expect(formatKeystrokeParts(held, other)).toEqual(["Alt", "j"]);
    });

    test("all modifiers on other platform", () => {
      const held = new Set(["Control", "Alt", "Shift", "Meta", "x"]);
      expect(formatKeystrokeParts(held, other)).toEqual(["Ctrl", "Alt", "Shift", "Ctrl", "x"]);
    });

    test("arrow keys unchanged on other platform", () => {
      expect(formatKeystrokeParts(new Set(["ArrowUp"]), other)).toEqual(["\u2191"]);
    });
  });
});
