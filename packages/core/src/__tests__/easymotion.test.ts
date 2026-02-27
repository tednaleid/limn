import { describe, test, expect } from "vitest";
import { generateEasyMotionLabels } from "../editor/Editor";

describe("generateEasyMotionLabels", () => {
  test("N=0 nodes returns empty map", () => {
    const result = generateEasyMotionLabels([]);
    expect(result.size).toBe(0);
  });

  test("N=3 nodes returns single-char labels a, b, c", () => {
    const result = generateEasyMotionLabels(["n1", "n2", "n3"]);
    expect(result.size).toBe(3);
    expect(result.get("a")).toBe("n1");
    expect(result.get("b")).toBe("n2");
    expect(result.get("c")).toBe("n3");
  });

  test("N=26 nodes uses all single chars a-z", () => {
    const ids = Array.from({ length: 26 }, (_, i) => `n${i}`);
    const result = generateEasyMotionLabels(ids);
    expect(result.size).toBe(26);
    expect(result.get("a")).toBe("n0");
    expect(result.get("z")).toBe("n25");
    // All labels should be single characters
    for (const label of result.keys()) {
      expect(label.length).toBe(1);
    }
  });

  test("N=27 nodes: P=1, closest 25 get b-z, farthest 2 get aa, ab", () => {
    const ids = Array.from({ length: 27 }, (_, i) => `n${i}`);
    const result = generateEasyMotionLabels(ids);
    expect(result.size).toBe(27);

    // First 25 nodes (closest) get single-char labels b-z
    for (let i = 0; i < 25; i++) {
      const expectedLabel = String.fromCharCode(98 + i); // 'b' = 98
      expect(result.get(expectedLabel)).toBe(`n${i}`);
    }

    // Last 2 nodes get double-char labels aa, ab
    expect(result.get("aa")).toBe("n25");
    expect(result.get("ab")).toBe("n26");
  });

  test("N=51 nodes: P=1, exactly fills 25 single + 26 double", () => {
    const ids = Array.from({ length: 51 }, (_, i) => `n${i}`);
    const result = generateEasyMotionLabels(ids);
    expect(result.size).toBe(51);

    // First 25 get single-char labels b-z
    for (let i = 0; i < 25; i++) {
      const expectedLabel = String.fromCharCode(98 + i); // 'b' = 98
      expect(result.get(expectedLabel)).toBe(`n${i}`);
    }

    // Next 26 get double-char labels aa-az
    for (let i = 0; i < 26; i++) {
      const expectedLabel = "a" + String.fromCharCode(97 + i);
      expect(result.get(expectedLabel)).toBe(`n${25 + i}`);
    }
  });

  test("N=52 nodes: P=2, closest 24 get c-z, rest get aa-az, ba-bz", () => {
    const ids = Array.from({ length: 52 }, (_, i) => `n${i}`);
    const result = generateEasyMotionLabels(ids);
    expect(result.size).toBe(52);

    // First 24 get single-char labels c-z
    for (let i = 0; i < 24; i++) {
      const expectedLabel = String.fromCharCode(99 + i); // 'c' = 99
      expect(result.get(expectedLabel)).toBe(`n${i}`);
    }

    // Next 26 get double-char labels aa-az
    for (let i = 0; i < 26; i++) {
      const expectedLabel = "a" + String.fromCharCode(97 + i);
      expect(result.get(expectedLabel)).toBe(`n${24 + i}`);
    }

    // Last 2 get double-char labels ba, bb
    expect(result.get("ba")).toBe("n50");
    expect(result.get("bb")).toBe("n51");
  });

  test("all labels are unique", () => {
    // Test with a variety of sizes
    for (const n of [1, 10, 26, 27, 51, 52, 100]) {
      const ids = Array.from({ length: n }, (_, i) => `n${i}`);
      const result = generateEasyMotionLabels(ids);
      const labels = [...result.keys()];
      expect(new Set(labels).size).toBe(labels.length);
      expect(result.size).toBe(n);
    }
  });
});
