import { describe, test, expect } from "vitest";
import { VERSION } from "../index";

describe("core smoke test", () => {
  test("exports a version string", () => {
    expect(VERSION).toBe("0.0.1");
  });
});
