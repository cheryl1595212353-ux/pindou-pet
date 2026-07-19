import { describe, expect, it, vi } from "vitest";

import { getCatAppearance } from "./appearances";
import type { RgbaRaster } from "./threeViewTypes";
import {
  CAT_THREE_VIEW_ASSETS,
  createCachedCatViewLoader,
  findCoreAxisRange,
  representativeTailColor,
} from "./threeViewAssets";

function studioRaster(width = 32, height = 32): RgbaRaster {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 5; y < height - 3; y += 1) {
    for (let x = 8; x < width - 8; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = 90;
      data[offset + 1] = 62;
      data[offset + 2] = 40;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("three-view cat assets", () => {
  it("records all paths and the real top-view directions", () => {
    expect(CAT_THREE_VIEW_ASSETS["cat-01"].topHeadAt).toBe("start");
    expect(CAT_THREE_VIEW_ASSETS["cat-02"].topHeadAt).toBe("start");
    for (const id of ["cat-03", "cat-04", "cat-05"] as const) {
      expect(CAT_THREE_VIEW_ASSETS[id].topHeadAt).toBe("end");
    }
    expect(CAT_THREE_VIEW_ASSETS["cat-05"].paths).toEqual({
      front: "/demo-cats/cat-05/front.png",
      side: "/demo-cats/cat-05/side.png",
      top: "/demo-cats/cat-05/top.png",
    });
  });

  it("finds the longest thick core instead of a thin tail run", () => {
    expect(findCoreAxisRange([1, 1, 5, 7, 8, 7, 5, 1, 1], 0.45)).toEqual([2, 6]);
  });

  it("keeps light studio spill from washing out the tail color", () => {
    const pixels = [
      ...new Array(6).fill([248, 246, 243] as const),
      [72, 48, 32] as const,
      [82, 52, 34] as const,
      [64, 42, 28] as const,
      [92, 58, 36] as const,
    ];

    expect(representativeTailColor(pixels, [120, 90, 60])).toBe("#4e3221");
  });

  it("loads each three-view triplet once per cached loader", async () => {
    const loadRaster = vi.fn(async () => studioRaster());
    const load = createCachedCatViewLoader(loadRaster);
    const appearance = getCatAppearance("cat-01").appearance;

    const first = await load("cat-01", appearance);
    const second = await load("cat-01", appearance);

    expect(loadRaster).toHaveBeenCalledTimes(3);
    expect(second).toBe(first);
    expect(first.views.front.width).toBe(24);
    expect(first.views.side.width).toBe(56);
    expect(first.views.top.height).toBe(56);
  });
});
