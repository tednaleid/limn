// ABOUTME: Creates a DomTextMeasurer that appends its measurement element to the view container.
// ABOUTME: Wraps the shared DomTextMeasurer factory from @limn/web.

import type { TextMeasurer } from "@limn/core";
import { createDomTextMeasurer as createMeasurer } from "@limn/web/text/DomTextMeasurer";

/**
 * Create a DOM-based text measurer rooted in the given container element.
 * This keeps the measurement div inside the Obsidian view rather than on document.body.
 */
export function createDomTextMeasurer(container: HTMLElement): TextMeasurer {
  return createMeasurer(container);
}
