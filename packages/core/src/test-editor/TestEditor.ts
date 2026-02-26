// ABOUTME: TestEditor extends Editor for testing without a browser.
// ABOUTME: Provides simulated input and assertion methods.

import { expect } from "vitest";
import { Editor, stubTextMeasurer } from "../editor/Editor";
import { dispatch } from "../keybindings/dispatch";
import type { Modifiers } from "../keybindings/dispatch";
import type { TextMeasurer } from "../model/types";

export class TestEditor extends Editor {
  constructor(textMeasurer: TextMeasurer = stubTextMeasurer) {
    super(textMeasurer);
  }

  // --- Simulated input ---

  pressKey(key: string, modifiers?: Modifiers): this {
    dispatch(this, key, modifiers);
    return this;
  }

  pointerDown(nodeId: string, worldX: number, worldY: number): this {
    this.startDrag(nodeId, worldX, worldY);
    return this;
  }

  pointerMove(worldX: number, worldY: number): this {
    this.updateDrag(worldX, worldY);
    return this;
  }

  pointerUp(): this {
    this.endDrag();
    return this;
  }

  // --- Assertions ---

  expectSelected(nodeId: string): this {
    expect(this.getSelectedId()).toBe(nodeId);
    return this;
  }

  expectEditing(nodeId: string): this {
    expect(this.isEditing()).toBe(true);
    expect(this.getSelectedId()).toBe(nodeId);
    return this;
  }

  expectNotEditing(): this {
    expect(this.isEditing()).toBe(false);
    return this;
  }

  expectCollapsed(nodeId: string): this {
    expect(this.isCollapsed(nodeId)).toBe(true);
    return this;
  }

  expectExpanded(nodeId: string): this {
    expect(this.isCollapsed(nodeId)).toBe(false);
    return this;
  }

  expectNodeCount(count: number): this {
    expect(this.nodeCount).toBe(count);
    return this;
  }

  expectChildren(parentId: string, childIds: string[]): this {
    const children = this.getChildren(parentId).map((n) => n.id);
    expect(children).toEqual(childIds);
    return this;
  }

  expectText(nodeId: string, text: string): this {
    expect(this.getNode(nodeId).text).toBe(text);
    return this;
  }
}
