// ABOUTME: Unit tests for keystroke overlay key formatting logic.
// ABOUTME: Covers modifier ordering, special key names, and edge cases.

import { describe, test, expect } from "vitest";
import { formatKeystrokeParts } from "../input/formatKeystroke";

describe("formatKeystrokeParts", () => {
  test("single letter key uppercased", () => {
    expect(formatKeystrokeParts(new Set(["a"]))).toEqual(["A"]);
  });

  test("modifier ordering: Ctrl, Opt, Shift, Cmd", () => {
    const held = new Set(["Control", "Alt", "Shift", "Meta", "x"]);
    expect(formatKeystrokeParts(held)).toEqual(["Ctrl", "Opt", "Shift", "Cmd", "X"]);
  });

  test("Meta maps to Cmd", () => {
    const held = new Set(["Meta", "z"]);
    expect(formatKeystrokeParts(held)).toEqual(["Cmd", "Z"]);
  });

  test("Control maps to Ctrl", () => {
    const held = new Set(["Control", "a"]);
    expect(formatKeystrokeParts(held)).toEqual(["Ctrl", "A"]);
  });

  test("Alt maps to Opt", () => {
    const held = new Set(["Alt", "j"]);
    expect(formatKeystrokeParts(held)).toEqual(["Opt", "J"]);
  });

  test("arrow keys use unicode symbols", () => {
    expect(formatKeystrokeParts(new Set(["ArrowUp"]))).toEqual(["\u2191"]);
    expect(formatKeystrokeParts(new Set(["ArrowDown"]))).toEqual(["\u2193"]);
    expect(formatKeystrokeParts(new Set(["ArrowLeft"]))).toEqual(["\u2190"]);
    expect(formatKeystrokeParts(new Set(["ArrowRight"]))).toEqual(["\u2192"]);
  });

  test("space key shows Space", () => {
    expect(formatKeystrokeParts(new Set([" "]))).toEqual(["Space"]);
  });

  test("Escape shows Esc", () => {
    expect(formatKeystrokeParts(new Set(["Escape"]))).toEqual(["Esc"]);
  });

  test("Tab shows Tab", () => {
    expect(formatKeystrokeParts(new Set(["Tab"]))).toEqual(["Tab"]);
  });

  test("Enter shows Enter", () => {
    expect(formatKeystrokeParts(new Set(["Enter"]))).toEqual(["Enter"]);
  });

  test("Backspace shows Backspace", () => {
    expect(formatKeystrokeParts(new Set(["Backspace"]))).toEqual(["Backspace"]);
  });

  test("modifier-only shows ellipsis", () => {
    expect(formatKeystrokeParts(new Set(["Shift"]))).toEqual(["Shift", "..."]);
  });

  test("multiple modifiers only shows ellipsis", () => {
    const held = new Set(["Control", "Shift"]);
    expect(formatKeystrokeParts(held)).toEqual(["Ctrl", "Shift", "..."]);
  });

  test("modifier + non-modifier key does not show ellipsis", () => {
    const held = new Set(["Shift", "Enter"]);
    expect(formatKeystrokeParts(held)).toEqual(["Shift", "Enter"]);
  });

  test("Ctrl+Shift+K combo", () => {
    const held = new Set(["Control", "Shift", "K"]);
    expect(formatKeystrokeParts(held)).toEqual(["Ctrl", "Shift", "K"]);
  });

  test("empty set returns empty array", () => {
    expect(formatKeystrokeParts(new Set())).toEqual([]);
  });

  test("Alt+arrow combo", () => {
    const held = new Set(["Alt", "ArrowUp"]);
    expect(formatKeystrokeParts(held)).toEqual(["Opt", "\u2191"]);
  });
});
