// ABOUTME: Typed JS-Swift bridge for the Limn desktop app via WKWebView.
// ABOUTME: Sends messages to Swift and receives messages via a callback registry.

// -- Message types: JS -> Swift --

export interface ReadyMessage {
  type: "ready";
}

export interface SaveMessage {
  type: "save";
  payload: { data: string }; // base64-encoded ZIP bytes
}

export interface RequestOpenMessage {
  type: "requestOpen";
}

export interface RequestSaveAsMessage {
  type: "requestSaveAs";
  payload: { data: string }; // base64-encoded ZIP bytes
}

export type OutgoingMessage =
  | ReadyMessage
  | SaveMessage
  | RequestOpenMessage
  | RequestSaveAsMessage;

// -- Message types: Swift -> JS --

export interface LoadFileMessage {
  type: "loadFile";
  payload: { data: string; filename: string }; // base64-encoded ZIP bytes
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

let handler: MessageHandler | null = null;

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
  handler = cb;
  return () => {
    if (handler === cb) handler = null;
  };
}

/**
 * Called by Swift via evaluateJavaScript.
 * Installed on window.limn.desktop.onMessage so Swift can invoke it.
 */
function handleSwiftMessage(msg: IncomingMessage): void {
  handler?.(msg);
}

// Install the global callback for Swift -> JS communication
if (typeof globalThis !== "undefined") {
  if (!g.limn) g.limn = {};
  if (!g.limn.desktop) g.limn.desktop = {};
  g.limn.desktop.onMessage = handleSwiftMessage;
}
