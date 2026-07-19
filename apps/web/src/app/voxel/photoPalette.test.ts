import { describe, expect, it } from "vitest";

import { nearestPaletteColor, quantizePhotoPalette } from "./photoPalette";

describe("photo palette", () => {
  it("creates no more than the requested number of stable colors", () => {
    const pixels = Array.from({ length: 32 }, (_, index) => [
      30 + index * 5,
      45 + index * 3,
      70 + index * 2,
    ] as const);

    const first = quantizePhotoPalette(pixels, 8);
    const second = quantizePhotoPalette(pixels, 8);

    expect(first).toEqual(second);
    expect(first).toHaveLength(8);
    expect(first.every((color) => /^#[0-9a-f]{6}$/.test(color))).toBe(true);
  });

  it("keeps unique source colors when they already fit", () => {
    expect(quantizePhotoPalette([[255, 0, 0], [0, 0, 255], [255, 0, 0]], 16)).toEqual([
      "#ff0000",
      "#0000ff",
    ]);
  });

  it("maps a sample to its nearest palette color", () => {
    expect(nearestPaletteColor([230, 30, 25], ["#0000ff", "#ff0000"])).toBe("#ff0000");
  });
});

