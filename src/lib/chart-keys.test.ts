import { describe, expect, it } from "vitest";
import { keyIndex } from "./chart-keys";

describe("keyIndex", () => {
  it("steps by one and clamps at both ends", () => {
    expect(keyIndex("ArrowRight", 2, 5)).toBe(3);
    expect(keyIndex("ArrowLeft", 2, 5)).toBe(1);
    expect(keyIndex("ArrowRight", 4, 5)).toBe(4);
    expect(keyIndex("ArrowLeft", 0, 5)).toBe(0);
  });

  it("opens on the end the key points away from", () => {
    // The first press of a chart that has never been touched.
    expect(keyIndex("ArrowRight", null, 5)).toBe(0);
    expect(keyIndex("ArrowLeft", null, 5)).toBe(4);
  });

  it("jumps to the first and last point", () => {
    expect(keyIndex("Home", 3, 5)).toBe(0);
    expect(keyIndex("End", 3, 5)).toBe(4);
  });

  it("leaves every other key, and an empty chart, alone", () => {
    expect(keyIndex("Enter", 1, 5)).toBeNull();
    expect(keyIndex("a", 1, 5)).toBeNull();
    expect(keyIndex("ArrowRight", null, 0)).toBeNull();
    expect(keyIndex("Home", null, 0)).toBeNull();
  });
});
