import { describe, expect, it } from "vitest";

import {
  countMask,
  dilateMask,
  extractForegroundMask,
  indexOf,
  normalizeCatView,
  paintMask,
  type RgbaRaster,
} from "./threeViewRaster";

type Rgb = readonly [number, number, number];

function makeRaster(width: number, height: number, background: Rgb): RgbaRaster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    data[offset] = background[0];
    data[offset + 1] = background[1];
    data[offset + 2] = background[2];
    data[offset + 3] = 255;
  }
  return { width, height, data };
}

function setPixel(raster: RgbaRaster, x: number, y: number, color: Rgb): void {
  const offset = (y * raster.width + x) * 4;
  raster.data[offset] = color[0];
  raster.data[offset + 1] = color[1];
  raster.data[offset + 2] = color[2];
}

describe("three-view raster masks", () => {
  it("keeps the centered subject and rejects isolated border noise", () => {
    const raster = makeRaster(9, 9, [250, 248, 244]);
    for (let y = 2; y <= 7; y += 1) {
      for (let x = 3; x <= 5; x += 1) setPixel(raster, x, y, [70, 55, 46]);
    }
    setPixel(raster, 0, 0, [20, 20, 20]);

    const mask = extractForegroundMask(raster);

    expect(mask.data[indexOf(mask, 4, 4)]).toBe(1);
    expect(mask.data[indexOf(mask, 0, 0)]).toBe(0);
    expect(countMask(mask)).toBe(18);
  });

  it("paints and erases a bounded circular mask stroke", () => {
    const empty = { width: 7, height: 7, data: new Uint8Array(49) };
    const added = paintMask(empty, { x: 3, y: 3, radius: 1, value: 1 });
    const erased = paintMask(added, { x: 3, y: 3, radius: 0, value: 0 });

    expect(countMask(added)).toBe(5);
    expect(countMask(erased)).toBe(4);
    expect(countMask(empty)).toBe(0);
  });

  it("dilates one cell without mutating the source", () => {
    const source = { width: 5, height: 5, data: new Uint8Array(25) };
    source.data[indexOf(source, 2, 2)] = 1;

    const dilated = dilateMask(source, 1);

    expect(countMask(dilated)).toBe(9);
    expect(countMask(source)).toBe(1);
  });

  it("normalizes and rotates a top view into canonical direction", () => {
    const raster = makeRaster(5, 7, [252, 250, 247]);
    for (let y = 1; y <= 5; y += 1) setPixel(raster, 2, y, [65, 48, 35]);
    setPixel(raster, 1, 1, [65, 48, 35]);

    const normal = normalizeCatView(raster, { width: 5, height: 7 }, false);
    const rotated = normalizeCatView(raster, { width: 5, height: 7 }, true);

    expect(normal.data[indexOf(normal, 1, 0)]).toBe(1);
    expect(rotated.data[indexOf(rotated, 3, 6)]).toBe(1);
  });
});
