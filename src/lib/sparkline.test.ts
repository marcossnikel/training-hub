import { describe, expect, it } from "vitest";
import { sparkline } from "@/lib/sparkline";

describe("sparkline", () => {
  it("spreads values evenly and inverts the y axis", () => {
    const spark = sparkline([10, 20, 30], 120, 32, 2);
    // min at the bottom (32 - 2), max at the top (2), midpoint halfway.
    expect(spark?.points).toBe("2,30 60,16 118,2");
    expect(spark?.last).toEqual({ x: 118, y: 2 });
  });

  it("insets both axes so the stroke and end dot are never clipped", () => {
    const spark = sparkline([5, 1], 100, 40, 4);
    expect(spark?.points).toBe("4,4 96,36");
  });

  it("draws a flat series along the vertical middle", () => {
    const spark = sparkline([42, 42, 42], 120, 32);
    expect(spark?.points).toBe("2,16 60,16 118,16");
  });

  it("centers a single value", () => {
    const spark = sparkline([7], 120, 32);
    expect(spark?.points).toBe("60,16");
    expect(spark?.last).toEqual({ x: 60, y: 16 });
  });

  it("returns null with nothing to draw", () => {
    expect(sparkline([], 120, 32)).toBeNull();
  });
});
