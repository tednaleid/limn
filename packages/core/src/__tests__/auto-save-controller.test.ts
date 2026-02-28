import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { AutoSaveController } from "../persistence/AutoSaveController";
import type { PersistenceProvider } from "../persistence/types";
import type { MindMapFileFormat } from "../serialization/schema";
import { TestEditor } from "../test-editor/TestEditor";

function createMockProvider(): PersistenceProvider & { saves: MindMapFileFormat[] } {
  const saves: MindMapFileFormat[] = [];
  return {
    saves,
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockImplementation(async (data: MindMapFileFormat) => {
      saves.push(data);
    }),
    saveAsset: vi.fn().mockResolvedValue(undefined),
    loadAsset: vi.fn().mockResolvedValue(undefined),
    loadAssetUrls: vi.fn().mockResolvedValue(new Map()),
    onExternalChange: vi.fn().mockReturnValue(() => {}),
    dispose: vi.fn(),
  };
}

describe("AutoSaveController", () => {
  let editor: TestEditor;

  beforeEach(() => {
    vi.useFakeTimers();
    editor = new TestEditor();
    editor.loadJSON({
      version: 1,
      meta: { id: "test", theme: "default" },
      camera: { x: 0, y: 0, zoom: 1 },
      roots: [
        { id: "r", text: "Root", x: 0, y: 0, width: 100, height: 32, children: [] },
      ],
      assets: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("debounce mode", () => {
    test("saves once after delay when changes stop", () => {
      const provider = createMockProvider();
      const ctrl = new AutoSaveController(editor, provider, { mode: "debounce", delayMs: 500 });

      // Make several rapid changes
      editor.select("r");
      editor.enterEditMode();
      editor.setText("r", "A");
      editor.setText("r", "AB");
      editor.setText("r", "ABC");

      // Not yet saved
      expect(provider.saves).toHaveLength(0);

      // Advance past debounce
      vi.advanceTimersByTime(500);
      expect(provider.saves).toHaveLength(1);
      expect(provider.saves[0].roots[0].text).toBe("ABC");

      ctrl.dispose();
    });

    test("resets timer on new changes within delay", () => {
      const provider = createMockProvider();
      const ctrl = new AutoSaveController(editor, provider, { mode: "debounce", delayMs: 500 });

      editor.setText("r", "A");
      vi.advanceTimersByTime(300);
      expect(provider.saves).toHaveLength(0);

      // Another change resets the timer
      editor.setText("r", "B");
      vi.advanceTimersByTime(300);
      expect(provider.saves).toHaveLength(0);

      // Full delay from last change
      vi.advanceTimersByTime(200);
      expect(provider.saves).toHaveLength(1);
      expect(provider.saves[0].roots[0].text).toBe("B");

      ctrl.dispose();
    });

    test("no saves if no changes", () => {
      const provider = createMockProvider();
      const ctrl = new AutoSaveController(editor, provider, { mode: "debounce", delayMs: 500 });

      vi.advanceTimersByTime(5000);
      expect(provider.saves).toHaveLength(0);

      ctrl.dispose();
    });
  });

  describe("interval mode", () => {
    test("saves at interval boundary when dirty", () => {
      const provider = createMockProvider();
      const ctrl = new AutoSaveController(editor, provider, { mode: "interval", delayMs: 1000 });

      editor.setText("r", "changed");

      // Not yet at interval
      vi.advanceTimersByTime(500);
      expect(provider.saves).toHaveLength(0);

      // At interval boundary
      vi.advanceTimersByTime(500);
      expect(provider.saves).toHaveLength(1);

      ctrl.dispose();
    });

    test("skips interval when not dirty", () => {
      const provider = createMockProvider();
      const ctrl = new AutoSaveController(editor, provider, { mode: "interval", delayMs: 1000 });

      // No changes -- interval fires but nothing to save
      vi.advanceTimersByTime(3000);
      expect(provider.saves).toHaveLength(0);

      ctrl.dispose();
    });

    test("coalesces multiple changes in one interval", () => {
      const provider = createMockProvider();
      const ctrl = new AutoSaveController(editor, provider, { mode: "interval", delayMs: 1000 });

      editor.setText("r", "A");
      editor.setText("r", "B");
      editor.setText("r", "C");

      vi.advanceTimersByTime(1000);
      expect(provider.saves).toHaveLength(1);
      expect(provider.saves[0].roots[0].text).toBe("C");

      ctrl.dispose();
    });
  });

  describe("flush", () => {
    test("saves immediately in debounce mode", async () => {
      const provider = createMockProvider();
      const ctrl = new AutoSaveController(editor, provider, { mode: "debounce", delayMs: 500 });

      editor.setText("r", "flushed");
      await ctrl.flush();
      expect(provider.saves).toHaveLength(1);
      expect(provider.saves[0].roots[0].text).toBe("flushed");

      // Pending timer should be cancelled -- no double save
      vi.advanceTimersByTime(1000);
      expect(provider.saves).toHaveLength(1);

      ctrl.dispose();
    });

    test("saves immediately in interval mode", async () => {
      const provider = createMockProvider();
      const ctrl = new AutoSaveController(editor, provider, { mode: "interval", delayMs: 5000 });

      editor.setText("r", "flushed");
      await ctrl.flush();
      expect(provider.saves).toHaveLength(1);

      // Dirty flag should be cleared -- no double save at interval
      vi.advanceTimersByTime(5000);
      expect(provider.saves).toHaveLength(1);

      ctrl.dispose();
    });
  });

  describe("dispose", () => {
    test("stops debounce saves", () => {
      const provider = createMockProvider();
      const ctrl = new AutoSaveController(editor, provider, { mode: "debounce", delayMs: 500 });

      editor.setText("r", "disposed");
      ctrl.dispose();

      vi.advanceTimersByTime(1000);
      expect(provider.saves).toHaveLength(0);
    });

    test("stops interval saves", () => {
      const provider = createMockProvider();
      const ctrl = new AutoSaveController(editor, provider, { mode: "interval", delayMs: 1000 });

      editor.setText("r", "disposed");
      ctrl.dispose();

      vi.advanceTimersByTime(5000);
      expect(provider.saves).toHaveLength(0);
    });

    test("ignores flush after dispose", async () => {
      const provider = createMockProvider();
      const ctrl = new AutoSaveController(editor, provider, { mode: "debounce", delayMs: 500 });

      ctrl.dispose();
      await ctrl.flush();
      expect(provider.saves).toHaveLength(0);
    });
  });
});
