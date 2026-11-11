// ABOUTME: Tells when the plugin's stylesheet is in force for an element.
// ABOUTME: Obsidian adds a plugin's stylesheet after running its code, so views opened during load start without it.

/** Custom property that styles.css sets on .limn-view. */
const MARKER = "--limn-stylesheet";

/**
 * Call `onLoaded` once the plugin's stylesheet applies to the element, if it does not already.
 * Returns a function that stops waiting.
 */
export function whenStylesLoaded(el: HTMLElement, onLoaded: () => void): () => void {
  const win = el.ownerDocument.defaultView;
  if (!win) return () => {};
  const loaded = () => win.getComputedStyle(el).getPropertyValue(MARKER).trim() !== "";
  if (loaded()) return () => {};
  const observer = new win.MutationObserver(() => {
    if (!loaded()) return;
    observer.disconnect();
    onLoaded();
  });
  observer.observe(el.ownerDocument.head, { childList: true, subtree: true, characterData: true });
  return () => observer.disconnect();
}
