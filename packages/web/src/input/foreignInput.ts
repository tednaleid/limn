// ABOUTME: Tells whether a DOM event came from an input that Limn does not own.
// ABOUTME: Limn's own edit textarea is marked data-limn-edit and does not count.

/** True for INPUT, a TEXTAREA other than Limn's edit textarea, and contentEditable elements. */
export function isForeignInput(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    (el.tagName === "TEXTAREA" && !el.dataset.limnEdit) ||
    el.isContentEditable === true
  );
}
