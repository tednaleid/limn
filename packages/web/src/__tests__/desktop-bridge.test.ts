// ABOUTME: Tests for the JS-Swift desktop bridge message handling.
// ABOUTME: Verifies message dispatch, handler registration, and desktop detection.

import { describe, it, expect, afterEach, vi } from "vitest";

// Ensure globalThis.window exists for the bridge module (node environment)
if (typeof window === "undefined") {
  (globalThis as Record<string, unknown>).window = globalThis;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

const { isDesktop, postToSwift, onSwiftMessage } = await import("../persistence/desktop-bridge");
import type { IncomingMessage } from "../persistence/desktop-bridge";

describe("desktop-bridge", () => {
  describe("isDesktop", () => {
    afterEach(() => {
      delete g.webkit;
    });

    it("returns false when webkit is not present", () => {
      delete g.webkit;
      expect(isDesktop()).toBe(false);
    });

    it("returns false when messageHandlers is missing", () => {
      g.webkit = {};
      expect(isDesktop()).toBe(false);
    });

    it("returns false when limn handler is missing", () => {
      g.webkit = { messageHandlers: {} };
      expect(isDesktop()).toBe(false);
    });

    it("returns true when full bridge path exists", () => {
      g.webkit = { messageHandlers: { limn: { postMessage: vi.fn() } } };
      expect(isDesktop()).toBe(true);
    });
  });

  describe("postToSwift", () => {
    afterEach(() => {
      delete g.webkit;
    });

    it("calls postMessage on the limn handler", () => {
      const postMessage = vi.fn();
      g.webkit = { messageHandlers: { limn: { postMessage } } };

      postToSwift({ type: "ready" });
      expect(postMessage).toHaveBeenCalledWith({ type: "ready" });
    });

    it("does nothing when bridge is not available", () => {
      // Should not throw
      postToSwift({ type: "ready" });
    });
  });

  describe("onSwiftMessage", () => {
    it("receives messages dispatched via window.limn.desktop.onMessage", () => {
      const received: IncomingMessage[] = [];
      const unsub = onSwiftMessage((msg: IncomingMessage) => received.push(msg));

      const onMessage = g.limn.desktop.onMessage as (msg: IncomingMessage) => void;
      onMessage({ type: "fileSaved", payload: { filename: "test.limn" } });
      expect(received).toHaveLength(1);
      expect(received[0]!.type).toBe("fileSaved");

      unsub();
    });

    it("unsubscribes correctly", () => {
      const received: IncomingMessage[] = [];
      const unsub = onSwiftMessage((msg: IncomingMessage) => received.push(msg));
      unsub();

      const onMessage = g.limn.desktop.onMessage as (msg: IncomingMessage) => void;
      onMessage({ type: "fileSaved", payload: { filename: "test.limn" } });
      expect(received).toHaveLength(0);
    });
  });
});
