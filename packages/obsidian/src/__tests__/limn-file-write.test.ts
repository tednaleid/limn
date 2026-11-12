// ABOUTME: Tests for writing a .limn file's bytes only while the file is still the one in the vault.
// ABOUTME: Covers a file deleted, or replaced by a new file of the same name, while the bytes are built.

import { describe, it, expect, vi } from "vitest";
import { writeIfCurrent } from "../limnFileWrite";
import { MockTFile } from "./mocks/obsidian";

function vaultHolding(file: MockTFile | null) {
  return { current: file, getAbstractFileByPath(_path: string) { return this.current; } };
}

const BYTES = new ArrayBuffer(4);

describe("writeIfCurrent", () => {
  it("writes the built bytes when the file is still in the vault", async () => {
    const file = new MockTFile("Map.limn");
    const write = vi.fn().mockResolvedValue(undefined);
    const wrote = await writeIfCurrent(vaultHolding(file), file as never, () => Promise.resolve(BYTES), write);
    expect(wrote).toBe(true);
    expect(write).toHaveBeenCalledWith(BYTES);
  });

  it("builds nothing and writes nothing when the file is already gone", async () => {
    const file = new MockTFile("Map.limn");
    const build = vi.fn().mockResolvedValue(BYTES);
    const write = vi.fn().mockResolvedValue(undefined);
    const wrote = await writeIfCurrent(vaultHolding(null), file as never, build, write);
    expect(wrote).toBe(false);
    expect(build).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("writes nothing when the file is deleted while the bytes are built", async () => {
    const file = new MockTFile("Map.limn");
    const vault = vaultHolding(file);
    const write = vi.fn().mockResolvedValue(undefined);
    const build = () => { vault.current = null; return Promise.resolve(BYTES); };
    expect(await writeIfCurrent(vault, file as never, build, write)).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("writes nothing when a new file of the same name replaces it while the bytes are built", async () => {
    const file = new MockTFile("Map.limn");
    const vault = vaultHolding(file);
    const write = vi.fn().mockResolvedValue(undefined);
    const build = () => { vault.current = new MockTFile("Map.limn"); return Promise.resolve(BYTES); };
    expect(await writeIfCurrent(vault, file as never, build, write)).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});
