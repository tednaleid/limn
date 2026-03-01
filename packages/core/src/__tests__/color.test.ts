// ABOUTME: Tests for color math utilities.
// ABOUTME: Verifies hex parsing, mixing, lightening, and rgba formatting.

import { describe, it, expect } from "vitest";
import { parseHex, toHex, toRgba, mix, lighten } from "../theme/color";

describe("parseHex", () => {
  it("parses a standard hex color", () => {
    expect(parseHex("#ff8040")).toEqual([255, 128, 64]);
  });

  it("parses without leading #", () => {
    expect(parseHex("00ff00")).toEqual([0, 255, 0]);
  });

  it("parses black", () => {
    expect(parseHex("#000000")).toEqual([0, 0, 0]);
  });

  it("parses white", () => {
    expect(parseHex("#ffffff")).toEqual([255, 255, 255]);
  });

  it("throws on invalid length", () => {
    expect(() => parseHex("#fff")).toThrow(/invalid hex/i);
  });
});

describe("toHex", () => {
  it("converts RGB to hex string", () => {
    expect(toHex(255, 128, 64)).toBe("#ff8040");
  });

  it("pads single-digit hex values", () => {
    expect(toHex(0, 0, 0)).toBe("#000000");
  });

  it("clamps out-of-range values", () => {
    expect(toHex(300, -10, 128)).toBe("#ff0080");
  });
});

describe("toRgba", () => {
  it("formats hex as rgba with alpha", () => {
    expect(toRgba("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
  });

  it("handles full opacity", () => {
    expect(toRgba("#000000", 1)).toBe("rgba(0, 0, 0, 1)");
  });
});

describe("mix", () => {
  it("weight 0 returns colorA", () => {
    expect(mix("#ff0000", "#0000ff", 0)).toBe("#ff0000");
  });

  it("weight 1 returns colorB", () => {
    expect(mix("#ff0000", "#0000ff", 1)).toBe("#0000ff");
  });

  it("weight 0.5 blends evenly", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("clamps weight below 0", () => {
    expect(mix("#ff0000", "#0000ff", -1)).toBe("#ff0000");
  });

  it("clamps weight above 1", () => {
    expect(mix("#ff0000", "#0000ff", 2)).toBe("#0000ff");
  });
});

describe("lighten", () => {
  it("amount 0 returns original", () => {
    expect(lighten("#808080", 0)).toBe("#808080");
  });

  it("amount 1 returns white", () => {
    expect(lighten("#808080", 1)).toBe("#ffffff");
  });

  it("lightens black by 50%", () => {
    expect(lighten("#000000", 0.5)).toBe("#808080");
  });
});
