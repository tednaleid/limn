// ABOUTME: Tests for hash-based document routing logic.
// ABOUTME: Verifies resolveDocId handles all URL hash formats and legacy migration.

import { describe, test, expect, vi, beforeEach } from "vitest";
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

// Mock idb-keyval
const store = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: vi.fn((key: string) => Promise.resolve(store.get(key))),
  set: vi.fn((key: string, value: unknown) => {
    store.set(key, value);
    return Promise.resolve();
  }),
}));

// Mock crypto.randomUUID for deterministic tests
const mockUUID = "test-uuid-1234-5678-abcd";
vi.stubGlobal("crypto", { ...crypto, randomUUID: () => mockUUID });

const { resolveDocId } = await import("../persistence/docRouting");

describe("resolveDocId", () => {
  beforeEach(() => {
    store.clear();
  });

  test("#local-doc=<uuid> returns that uuid", async () => {
    const result = await resolveDocId("#local-doc=abc-123");
    expect(result.docId).toBe("abc-123");
    expect(result.initialData).toBeUndefined();
    expect(result.replaceHash).toBeUndefined();
  });

  test("#data=<compressed> decompresses and returns fresh uuid", async () => {
    const { compressToUrl } = await import("@limn/core");
    const doc = makeDoc("Shared");
    const compressed = compressToUrl(doc);

    const result = await resolveDocId(`#data=${compressed}`);
    expect(result.docId).toBe(mockUUID);
    expect(result.initialData).toBeDefined();
    expect(result.initialData!.roots[0]!.text).toBe("Shared");
    expect(result.replaceHash).toBe(`#local-doc=${mockUUID}`);
  });

  test("#data= with invalid data falls back to fresh uuid", async () => {
    const result = await resolveDocId("#data=invalid-garbage");
    expect(result.docId).toBe(mockUUID);
    expect(result.initialData).toBeUndefined();
    expect(result.replaceHash).toBe(`#local-doc=${mockUUID}`);
  });

  test("no hash with limn:recent redirects to that doc", async () => {
    store.set("limn:recent", "prev-uuid");

    const result = await resolveDocId("");
    expect(result.docId).toBe("prev-uuid");
    expect(result.initialData).toBeUndefined();
    expect(result.replaceHash).toBe("#local-doc=prev-uuid");
  });

  test("no hash, no recent, with legacy demo data migrates it", async () => {
    const doc = makeDoc("Legacy Demo");
    store.set("limn:doc:demo", { data: doc, savedAt: Date.now() });

    const result = await resolveDocId("");
    expect(result.docId).toBe(mockUUID);
    expect(result.initialData).toBeUndefined();
    expect(result.replaceHash).toBe(`#local-doc=${mockUUID}`);

    // Verify migration: data was copied to new key
    const migrated = store.get(`limn:doc:${mockUUID}`) as { data: MindMapFileFormat };
    expect(migrated.data.roots[0]!.text).toBe("Legacy Demo");

    // Verify recent was set
    expect(store.get("limn:recent")).toBe(mockUUID);
  });

  test("no hash, no recent, no legacy generates fresh uuid", async () => {
    const result = await resolveDocId("");
    expect(result.docId).toBe(mockUUID);
    expect(result.initialData).toBeUndefined();
    expect(result.replaceHash).toBe(`#local-doc=${mockUUID}`);
  });
});
