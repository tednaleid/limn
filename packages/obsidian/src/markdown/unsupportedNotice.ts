// ABOUTME: Builds the notice shown when a note holds Markdown the mind map cannot round-trip.
// ABOUTME: Pure string building with no Obsidian dependency.

import type { OutlineIssue } from "@limn/core";

const MAX_LISTED = 3;

const DESCRIPTION: Record<OutlineIssue["kind"], string> = {
  "block-in-item": "a list item contains a numbered list, quote, heading, rule, or table",
  "indented-list": "bullets are nested under something that is not a bullet",
};

export function describeIssues(issues: readonly OutlineIssue[]): string {
  const parts = ["Limn cannot show this note as a mind map without changing it, so it was opened as Markdown."];
  for (const issue of issues.slice(0, MAX_LISTED)) {
    parts.push(`Line ${issue.line}: ${DESCRIPTION[issue.kind]}.`);
  }
  if (issues.length > MAX_LISTED) parts.push(`And ${issues.length - MAX_LISTED} more.`);
  return parts.join(" ");
}
