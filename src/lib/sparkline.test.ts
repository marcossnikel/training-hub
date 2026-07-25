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
    // The invariant is about extent, not centres: with `inset` set to the outer
    // radius of what the caller draws at a vertex, every vertex is far enough
    // from all four edges that the whole mark fits inside the box.
    const radius = 4;
    const spark = sparkline([5, 1, 9, 3], 100, 40, radius);
    expect(spark?.points).toBe("4,20 34.67,36 65.33,4 96,28");
    const vertices = (spark?.points ?? "")
      .split(" ")
      .map((pair) => pair.split(",").map(Number))
      .map(([x, y]) => ({ x, y }));
    for (const { x, y } of vertices) {
      expect(x - radius).toBeGreaterThanOrEqual(0);
      expect(x + radius).toBeLessThanOrEqual(100);
      expect(y - radius).toBeGreaterThanOrEqual(0);
      expect(y + radius).toBeLessThanOrEqual(40);
    }
    // The end dot sits exactly on the last vertex, same rounding as the polyline.
    expect(spark?.last).toEqual(vertices[vertices.length - 1]);
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
