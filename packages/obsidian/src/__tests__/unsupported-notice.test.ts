// ABOUTME: Tests for describeIssues, the notice text shown when a note is opened as Markdown.
// ABOUTME: Pure string building; no Obsidian involved.

import { describe, it, expect } from "vitest";
import { describeIssues } from "../markdown/unsupportedNotice";

describe("describeIssues", () => {
  it("names the first lines and what was found", () => {
    expect(describeIssues([{ line: 5, kind: "block-in-item" }, { line: 9, kind: "indented-list" }])).toBe(
      "Limn cannot show this note as a mind map without changing it, so it was opened as Markdown. "
      + "Line 5: a list item contains a numbered list, quote, heading, rule, or table. "
      + "Line 9: bullets are nested under something that is not a bullet.");
  });

  it("lists at most three lines and counts the rest", () => {
    const issues = [1, 2, 3, 4, 5].map((line) => ({ line, kind: "block-in-item" as const }));
    expect(describeIssues(issues)).toMatch(/Line 3: .* And 2 more\.$/);
  });
});
