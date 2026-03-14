// ABOUTME: Typed JS-Swift bridge for the Limn desktop app via WKWebView.
// ABOUTME: Sends messages to Swift and receives messages via a callback registry.

// -- Message types: JS -> Swift --

export interface ReadyMessage {
  type: "ready";
}

export interface SaveMessage {
  type: "save";
  payload: { json: string }; // plain JSON text (cross-platform compatible)
}

export interface RequestOpenMessage {
  type: "requestOpen";
}

export interface RequestSaveAsMessage {
  type: "requestSaveAs";
  payload: { json: string }; // plain JSON text
}

export interface ExportSvgMessage {
  type: "exportSvg";
  payload: { data: string }; // base64-encoded SVG string
}

export type OutgoingMessage =
  | ReadyMessage
  | SaveMessage
  | RequestOpenMessage
  | RequestSaveAsMessage
  | ExportSvgMessage;

// -- Message types: Swift -> JS --

export interface LoadFileMessage {
  type: "loadFile";
  payload: {
    data: string;       // JSON text (format=json) or base64-encoded ZIP (format=zip)
    filename: string;
    format?: "json" | "zip";  // absent for legacy ZIP messages
    assets?: Record<string, string>;  // assetId -> base64 (sidecar assets, json format only)
  };
}

export interface FileSavedMessage {
  type: "fileSaved";
  payload: { filename: string };
}

export interface FileClosedMessage {
  type: "fileClosed";
}

export type IncomingMessage =
  | LoadFileMessage
  | FileSavedMessage
  | FileClosedMessage;

// -- Bridge API --

// Access the WKWebView bridge objects via globalThis to avoid strict-mode type issues.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

type MessageHandler = (msg: IncomingMessage) => void;

// Store the handler on the global object so it survives Vite HMR module reloads.
// A module-level `let handler` gets reset to null when the module re-executes,
// but the DesktopPersistenceProvider instance (cached by React useMemo) still
// expects its callback to be reachable.
function getHandler(): MessageHandler | null {
  return g.limn?.desktop?._handler ?? null;
}
function setHandler(cb: MessageHandler | null): void {
  if (g.limn?.desktop) g.limn.desktop._handler = cb;
}

/** Returns true if running inside the Limn desktop WKWebView shell. */
export function isDesktop(): boolean {
  return !!g.webkit?.messageHandlers?.limn;
}

/** Send a typed message from JS to Swift. */
export function postToSwift(msg: OutgoingMessage): void {
  g.webkit?.messageHandlers?.limn?.postMessage(msg);
}

/** Register a handler for messages from Swift. Only one handler at a time. */
export function onSwiftMessage(cb: MessageHandler): () => void {
  setHandler(cb);
  return () => {
    if (getHandler() === cb) setHandler(null);
  };
}

/**
 * Called by Swift via evaluateJavaScript.
 * Installed on window.limn.desktop.onMessage so Swift can invoke it.
 */
function handleSwiftMessage(msg: IncomingMessage): void {
  const h = getHandler();
  h?.(msg);
}

// Install the global callback for Swift -> JS communication
if (typeof globalThis !== "undefined") {
  if (!g.limn) g.limn = {};
  if (!g.limn.desktop) g.limn.desktop = {};
  g.limn.desktop.onMessage = handleSwiftMessage;
}
