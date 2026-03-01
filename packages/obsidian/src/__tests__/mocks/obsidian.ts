// ABOUTME: Minimal Obsidian API mocks for unit testing the plugin.
// ABOUTME: Provides mock Vault, VaultAdapter, WorkspaceLeaf, and App.

import type { MindMapFileFormat } from "@limn/core";

/** Mock vault adapter with in-memory file storage. */
export class MockVaultAdapter {
  private files = new Map<string, string | ArrayBuffer>();

  async read(path: string): Promise<string> {
    const data = this.files.get(path);
    if (data === undefined) throw new Error(`File not found: ${path}`);
    if (typeof data !== "string") throw new Error(`Not a text file: ${path}`);
    return data;
  }

  async write(path: string, data: string): Promise<void> {
    this.files.set(path, data);
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    const data = this.files.get(path);
    if (data === undefined) throw new Error(`File not found: ${path}`);
    if (typeof data === "string") throw new Error(`Not a binary file: ${path}`);
    return data;
  }

  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    this.files.set(path, data);
  }

  getFiles(): Map<string, string | ArrayBuffer> {
    return this.files;
  }
}

/** Mock TFile for testing. */
export class MockTFile {
  path: string;
  basename: string;
  extension: string;
  parent: { path: string } | null;

  constructor(path: string) {
    this.path = path;
    this.extension = path.split(".").pop() ?? "";
    const parts = path.split("/");
    const filename = parts.pop() ?? "";
    this.basename = filename.replace(`.${this.extension}`, "");
    this.parent = parts.length > 0 ? { path: parts.join("/") } : { path: "" };
  }
}

/** Mock Vault with in-memory adapter. */
export class MockVault {
  adapter = new MockVaultAdapter();
  private abstractFiles = new Map<string, unknown>();

  getRoot() {
    return { path: "" };
  }

  getAbstractFileByPath(path: string): unknown {
    return this.abstractFiles.get(path) ?? null;
  }

  async create(path: string, data: string): Promise<MockTFile> {
    await this.adapter.write(path, data);
    const file = new MockTFile(path);
    this.abstractFiles.set(path, file);
    return file;
  }

  async createFolder(path: string): Promise<void> {
    this.abstractFiles.set(path, { path });
  }

  async modify(file: MockTFile, data: string): Promise<void> {
    await this.adapter.write(file.path, data);
  }
}

/** Mock App with vault. */
export class MockApp {
  vault = new MockVault();
  workspace = {
    getLeaf: () => new MockWorkspaceLeaf(),
  };
}

/** Mock WorkspaceLeaf that provides a contentEl. */
export class MockWorkspaceLeaf {
  view: unknown = null;
  containerEl: HTMLDivElement;

  constructor() {
    // Use a plain object since we're in a Node test environment
    this.containerEl = {
      children: [],
    } as unknown as HTMLDivElement;
  }
}

/** Create a minimal MindMapFileFormat for testing. */
export function createTestMap(overrides?: Partial<MindMapFileFormat>): MindMapFileFormat {
  return {
    version: 1,
    meta: { id: "test-map", mode: "system", lightTheme: "catppuccin-latte", darkTheme: "catppuccin-mocha" },
    camera: { x: 0, y: 0, zoom: 1 },
    roots: [
      {
        id: "root1",
        text: "Root Node",
        x: 0,
        y: 0,
        width: 100,
        height: 32,
        children: [
          {
            id: "child1",
            text: "Child One",
            x: 250,
            y: -26,
            width: 100,
            height: 32,
            children: [],
          },
          {
            id: "child2",
            text: "Child Two",
            x: 250,
            y: 26,
            width: 100,
            height: 32,
            children: [],
          },
        ],
      },
    ],
    assets: [],
    ...overrides,
  };
}
