// ABOUTME: Tests for WebPersistenceProvider cross-tab sync.
// ABOUTME: Verifies tabId-based echo loop prevention in BroadcastChannel messages.

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import type { MindMapFileFormat } from "@limn/core";

function makeDoc(text = "Root"): MindMapFileFormat {
  return {
    version: 1,
    meta: { id: "test", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
    camera: { x: 0, y: 0, zoom: 1 },
    roots: [{ id: "r", text, x: 0, y: 0, width: 100, height: 32, children: [] }],
    assets: [],
  };
}

// Mock BroadcastChannel
class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];
  name: string;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    // Broadcast to all other instances with the same name
    for (const instance of MockBroadcastChannel.instances) {
      if (instance !== this && instance.name === this.name && instance.onmessage) {
        instance.onmessage({ data });
      }
    }
  }

  close(): void {
    const idx = MockBroadcastChannel.instances.indexOf(this);
    if (idx >= 0) MockBroadcastChannel.instances.splice(idx, 1);
  }
}

// Mock idb-keyval
const store = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: vi.fn((key: string) => Promise.resolve(store.get(key))),
  set: vi.fn((key: string, value: unknown) => {
    store.set(key, value);
    return Promise.resolve();
  }),
}));

// Inject mock BroadcastChannel before importing the module
(globalThis as Record<string, unknown>).BroadcastChannel = MockBroadcastChannel;

// Dynamic import so the mock is in place
const { WebPersistenceProvider } = await import("../persistence/WebPersistenceProvider");

describe("WebPersistenceProvider cross-tab sync", () => {
  beforeEach(() => {
    store.clear();
    MockBroadcastChannel.instances = [];
  });

  afterEach(() => {
    MockBroadcastChannel.instances.forEach((i) => i.close());
    MockBroadcastChannel.instances = [];
  });

  test("includes tabId in broadcast messages", async () => {
    const provider = new WebPersistenceProvider("doc1");
    const posted: unknown[] = [];

    // Set up a listener to capture posted messages
    const unsub = provider.onExternalChange(() => {});
    expect(MockBroadcastChannel.instances.find((i) => i.name === "limn-sync")).toBeDefined();

    // Create a spy channel to capture outgoing messages
    const spy = new MockBroadcastChannel("limn-sync");
    spy.onmessage = (event) => posted.push(event.data);

    await provider.save(makeDoc());

    expect(posted).toHaveLength(1);
    const msg = posted[0] as Record<string, unknown>;
    expect(msg).toHaveProperty("tabId");
    expect(typeof msg.tabId).toBe("string");
    expect(msg.tabId).not.toBe("");

    spy.close();
    unsub();
    provider.dispose();
  });

  test("ignores broadcast messages from own tab", async () => {
    const provider = new WebPersistenceProvider("doc1");
    const received: MindMapFileFormat[] = [];

    const unsub = provider.onExternalChange((data) => received.push(data));

    // Save from this provider (triggers broadcast)
    await provider.save(makeDoc("Updated"));

    // Wait for any async callbacks
    await new Promise((r) => setTimeout(r, 10));

    // Should NOT have received its own message
    expect(received).toHaveLength(0);

    unsub();
    provider.dispose();
  });

  test("receives broadcast messages from other tabs", async () => {
    const provider1 = new WebPersistenceProvider("doc1");
    const provider2 = new WebPersistenceProvider("doc1");
    const received: MindMapFileFormat[] = [];

    // Both tabs set up external change listeners (as they would in real usage)
    const unsub1 = provider1.onExternalChange(() => {});
    const unsub2 = provider2.onExternalChange((data) => received.push(data));

    // Provider1 saves (triggers broadcast via its channel)
    await provider1.save(makeDoc("From Tab 1"));

    // Wait for async callbacks
    await new Promise((r) => setTimeout(r, 10));

    // Provider2 should receive the update
    expect(received).toHaveLength(1);
    expect(received[0]!.roots[0]!.text).toBe("From Tab 1");

    unsub1();
    unsub2();
    provider1.dispose();
    provider2.dispose();
  });
});
