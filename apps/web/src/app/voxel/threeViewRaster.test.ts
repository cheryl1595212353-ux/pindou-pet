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

  it("does not mistake a bright studio-background gradient for a white subject", () => {
    const raster = makeRaster(15, 15, [252, 249, 248]);
    for (let index = 0; index < 15; index += 1) {
      setPixel(raster, index, 0, [241, 238, 237]);
      setPixel(raster, index, 14, [241, 238, 237]);
      setPixel(raster, 0, index, [241, 238, 237]);
      setPixel(raster, 14, index, [241, 238, 237]);
    }
    for (let y = 4; y <= 11; y += 1) {
      for (let x = 5; x <= 9; x += 1) setPixel(raster, x, y, [235, 226, 216]);
    }
    for (let y = 4; y <= 6; y += 1) {
      for (let x = 6; x <= 8; x += 1) setPixel(raster, x, y, [92, 66, 48]);
    }

    const mask = extractForegroundMask(raster);

    expect(mask.data[indexOf(mask, 7, 8)]).toBe(1);
    expect(mask.data[indexOf(mask, 2, 2)]).toBe(0);
    expect(countMask(mask)).toBeLessThan(60);
  });

  it("removes a thin studio-floor shadow connected to the paws", () => {
    const raster = makeRaster(11, 11, [252, 249, 248]);
    for (let y = 2; y <= 8; y += 1) {
      for (let x = 4; x <= 6; x += 1) setPixel(raster, x, y, [82, 61, 48]);
    }
    for (let x = 1; x <= 9; x += 1) {
      setPixel(raster, x, 8, [232, 230, 228]);
      setPixel(raster, x, 9, [232, 230, 228]);
    }

    const mask = extractForegroundMask(raster);

    expect(mask.data[indexOf(mask, 5, 5)]).toBe(1);
    expect(mask.data[indexOf(mask, 1, 8)]).toBe(0);
    expect(mask.data[indexOf(mask, 9, 9)]).toBe(0);
  });

  it("trims a thicker bottom backdrop band without removing supported legs", () => {
    const raster = makeRaster(15, 15, [252, 249, 248]);
    for (let y = 2; y <= 12; y += 1) {
      for (let x = 6; x <= 8; x += 1) setPixel(raster, x, y, [82, 61, 48]);
    }
    for (let y = 9; y <= 13; y += 1) {
      for (let x = 1; x <= 13; x += 1) setPixel(raster, x, y, [232, 230, 228]);
    }

    const mask = extractForegroundMask(raster);

    expect(mask.data[indexOf(mask, 7, 11)]).toBe(1);
    expect(mask.data[indexOf(mask, 2, 11)]).toBe(0);
    expect(mask.data[indexOf(mask, 12, 12)]).toBe(0);
  });

  it("opens the gap under a wide body instead of filling it above a floor band", () => {
    const raster = makeRaster(21, 21, [252, 249, 248]);
    for (let y = 2; y <= 10; y += 1) {
      for (let x = 2; x <= 18; x += 1) setPixel(raster, x, y, [82, 61, 48]);
    }
    for (let y = 11; y <= 17; y += 1) {
      for (let x = 4; x <= 6; x += 1) setPixel(raster, x, y, [82, 61, 48]);
      for (let x = 14; x <= 16; x += 1) setPixel(raster, x, y, [82, 61, 48]);
    }
    for (let y = 13; y <= 19; y += 1) {
      for (let x = 1; x <= 19; x += 1) setPixel(raster, x, y, [232, 230, 228]);
    }

    const mask = extractForegroundMask(raster);

    expect(mask.data[indexOf(mask, 5, 18)]).toBe(1);
    expect(mask.data[indexOf(mask, 15, 18)]).toBe(1);
    expect(mask.data[indexOf(mask, 10, 18)]).toBe(0);
    expect(mask.data[indexOf(mask, 10, 14)]).toBe(0);
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
    const raster = makeRaster(9, 11, [252, 250, 247]);
    for (let y = 2; y <= 9; y += 1) {
      for (let x = 3; x <= 5; x += 1) setPixel(raster, x, y, [65, 48, 35]);
    }
    for (let y = 2; y <= 7; y += 1) {
      for (let x = 1; x <= 3; x += 1) setPixel(raster, x, y, [65, 48, 35]);
    }

    const normal = normalizeCatView(raster, { width: 5, height: 8 }, false);
    const rotated = normalizeCatView(raster, { width: 5, height: 8 }, true);
    const centroid = (mask: typeof normal) => {
      let totalX = 0;
      let totalY = 0;
      let count = 0;
      for (let y = 0; y < mask.height; y += 1) {
        for (let x = 0; x < mask.width; x += 1) {
          if (mask.data[indexOf(mask, x, y)] === 0) continue;
          totalX += x;
          totalY += y;
          count += 1;
        }
      }
      return { x: totalX / count, y: totalY / count };
    };

    expect(centroid(normal).x + centroid(rotated).x).toBeCloseTo(4);
    expect(centroid(normal).y + centroid(rotated).y).toBeCloseTo(7);
    expect([...normal.data]).not.toEqual([...rotated.data]);
  });

  it("preserves silhouette aspect ratio instead of stretching it to every edge", () => {
    const raster = makeRaster(10, 10, [252, 249, 248]);
    for (let y = 1; y <= 8; y += 1) {
      for (let x = 4; x <= 5; x += 1) setPixel(raster, x, y, [70, 55, 46]);
    }

    const normalized = normalizeCatView(raster, { width: 10, height: 10 });

    expect(normalized.data[indexOf(normalized, 0, 5)]).toBe(0);
    expect(normalized.data[indexOf(normalized, 4, 5)]).toBe(1);
    expect(normalized.data[indexOf(normalized, 9, 5)]).toBe(0);
  });
});
