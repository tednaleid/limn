// ABOUTME: Keeps Obsidian's own hotkeys from consuming key chords that the mind map handles itself.
// ABOUTME: Gives a map view a key scope that claims those chords and lets the events continue to the map.

import { Scope, type App, type Modifier, type View } from "obsidian";

/** Chords the map binds that Obsidian also binds by default (Mod+Enter: open link in new tab). */
const MAP_CHORDS: [Modifier[], string][] = [[["Mod"], "Enter"]];

/**
 * While the view is active, Obsidian offers each key event to the view's scope before its hotkeys.
 * A handler that does not return false claims the chord without stopping the event, so the event
 * goes on to the map's key handler.
 */
export function claimMapKeys(app: App, view: View): void {
  const scope = new Scope(app.scope);
  for (const [modifiers, key] of MAP_CHORDS) scope.register(modifiers, key, () => true);
  view.scope = scope;
}
