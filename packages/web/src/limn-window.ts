// ABOUTME: Typed view of the window.limn / window.webkit globals the web bundle stashes.
// ABOUTME: Replaces ad-hoc `globalThis as any` casts at every access site.

import type { MindMapFileFormat } from "@limn/core";
import type { IncomingMessage } from "./persistence/desktop-bridge";

export interface LimnDesktopState {
  onMessage?: (msg: IncomingMessage) => void;
  _handler?: ((msg: IncomingMessage) => void) | null;
  _pendingLoad?: {
    resolve: (result: { data: MindMapFileFormat; filename: string } | null) => void;
  } | null;
  _pendingSave?: { resolve: (filename: string | null) => void } | null;
  _externalChangeCb?: ((data: MindMapFileFormat) => void) | null;
  _currentFilename?: string | null;
  _assetCache?: Map<string, Blob>;
  _assetUrls?: Map<string, string>;
}

export interface LimnDebugAPI {
  toJSON?: () => unknown;
  hasUnsavedChanges?: () => boolean;
  flush?: () => Promise<void> | void;
  tabId?: string;
  docId?: string;
  revision?: number;
  desktop?: LimnDesktopState;
}

export interface WebkitMessageHandler {
  postMessage: (msg: unknown) => void;
}

export interface LimnWindow {
  limn?: LimnDebugAPI;
  webkit?: { messageHandlers?: { limn?: WebkitMessageHandler } };
}

export const limnWindow = window as unknown as LimnWindow;
