import { describe, expect, it } from "vitest";

import { getCatAppearance } from "./appearances";
import type { CatViewName, NormalizedCatView, ShapeCorrections } from "./threeViewTypes";
import { DEFAULT_SHAPE_CORRECTIONS } from "./threeViewTypes";
import {
  buildPersonalizedVoxelModel,
  gridCellKey,
  type PersonalizedVoxelModel,
  type VoxelResolution,
} from "./visualHull";

function makeView(
  width: number,
  height: number,
  contains: (x: number, y: number) => boolean,
  color: readonly [number, number, number] = [126, 84, 48],
): NormalizedCatView {
  const data = new Uint8Array(width * height);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = y * width + x;
      data[cell] = contains(x, y) ? 1 : 0;
      rgba[cell * 4] = color[0];
      rgba[cell * 4 + 1] = color[1];
      rgba[cell * 4 + 2] = color[2];
      rgba[cell * 4 + 3] = 255;
    }
  }
  return { width, height, data, sourceMask: data.slice(), rgba };
}

function makeViews(
  resolution: VoxelResolution,
  overrides: Partial<Record<CatViewName, (x: number, y: number) => boolean>> = {},
) {
  return {
    front: makeView(resolution.width, resolution.height, overrides.front ?? (() => true)),
    side: makeView(resolution.length, resolution.height, overrides.side ?? (() => true)),
    top: makeView(resolution.width, resolution.length, overrides.top ?? (() => true)),
  };
}

function build(
  resolution: VoxelResolution,
  overrides?: Partial<Record<CatViewName, (x: number, y: number) => boolean>>,
  corrections: ShapeCorrections = DEFAULT_SHAPE_CORRECTIONS,
): PersonalizedVoxelModel {
  return buildPersonalizedVoxelModel({
    views: makeViews(resolution, overrides),
    appearance: getCatAppearance("cat-02").appearance,
    corrections,
    resolution,
    tailProfile: { lengthRatio: 0.45, thicknessRatio: 0.2, color: "#9b5728" },
  });
}

describe("three-view visual hull", () => {
  it("changes model width when the front silhouette becomes narrower", () => {
    const resolution = { length: 20, height: 16, width: 10 };
    const wide = build(resolution);
    const narrow = build(resolution, {
      front: (x) => x >= 2 && x <= 7,
      top: (x) => x >= 2 && x <= 7,
    });

    expect(narrow.bounds.max[2] - narrow.bounds.min[2]).toBeLessThan(
      wide.bounds.max[2] - wide.bounds.min[2],
    );
  });

  it("keeps only cells with an exposed neighbor", () => {
    const model = build({ length: 20, height: 16, width: 10 });
    const occupied = new Set(model.main.map((cell) => gridCellKey(cell.grid)));
    const neighbors = [
      [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    ] as const;

    for (const cell of model.main) {
      expect(neighbors.some(([dx, dy, dz]) => !occupied.has(gridCellKey([
        cell.grid[0] + dx,
        cell.grid[1] + dy,
        cell.grid[2] + dz,
      ])))).toBe(true);
    }
  });

  it("uses fewer surface voxels at performance resolution", () => {
    const detailed = build({ length: 24, height: 20, width: 12 });
    const performance = build({ length: 16, height: 12, width: 8 });

    expect(performance.main.length).toBeLessThan(detailed.main.length);
  });

  it("keeps physical size while changing voxel density", () => {
    const detailed = build({ length: 24, height: 20, width: 12 });
    const performance = build({ length: 16, height: 12, width: 8 });
    const size = (model: PersonalizedVoxelModel, axis: 0 | 1 | 2) =>
      model.bounds.max[axis] - model.bounds.min[axis] + model.voxelSize;

    expect(performance.voxelSize).toBeGreaterThan(detailed.voxelSize);
    expect(size(performance, 0)).toBeCloseTo(size(detailed, 0), 1);
    expect(size(performance, 1)).toBeCloseTo(size(detailed, 1), 1);
    expect(size(performance, 2)).toBeCloseTo(size(detailed, 2), 1);
  });

  it("widens only the high front region for the head-width correction", () => {
    const resolution = { length: 20, height: 16, width: 10 };
    const original = build(resolution);
    const corrected = build(resolution, undefined, {
      ...DEFAULT_SHAPE_CORRECTIONS,
      headWidth: 1.2,
    });
    const high = (model: PersonalizedVoxelModel) => Math.max(...model.main
      .filter((cell) => cell.grid[0] < 7 && cell.grid[1] > 8)
      .map((cell) => Math.abs(cell.position[2])));
    const low = (model: PersonalizedVoxelModel) => Math.max(...model.main
      .filter((cell) => cell.grid[1] < 5)
      .map((cell) => Math.abs(cell.position[2])));

    expect(high(corrected)).toBeGreaterThan(high(original));
    expect(low(corrected)).toBe(low(original));
  });

  it("applies the remaining bounded body and tail corrections to their target axes", () => {
    const resolution = { length: 20, height: 16, width: 20 };
    const original = build(resolution);
    const longer = build(resolution, undefined, {
      ...DEFAULT_SHAPE_CORRECTIONS,
      bodyLength: 1.2,
    });
    const longerLegs = build(resolution, undefined, {
      ...DEFAULT_SHAPE_CORRECTIONS,
      legLength: 1.2,
    });
    const tallerEars = build(resolution, undefined, {
      ...DEFAULT_SHAPE_CORRECTIONS,
      earHeight: 1.2,
    });
    const thickerTail = build(resolution, undefined, {
      ...DEFAULT_SHAPE_CORRECTIONS,
      tailThickness: 1.2,
    });
    const extent = (model: PersonalizedVoxelModel, axis: 0 | 1 | 2) =>
      model.bounds.max[axis] - model.bounds.min[axis];
    const headPeak = (model: PersonalizedVoxelModel) => Math.max(...model.main
      .filter((cell) => cell.grid[0] < 7 && cell.grid[1] > 13)
      .map((cell) => cell.position[1]));
    const tailWidth = (model: PersonalizedVoxelModel) => {
      const values = model.tailSegment.map((cell) => cell.position[2]);
      return Math.max(...values) - Math.min(...values);
    };

    expect(extent(longer, 0)).toBeGreaterThan(extent(original, 0));
    expect(extent(longerLegs, 1)).toBeGreaterThan(extent(original, 1));
    expect(headPeak(tallerEars)).toBeGreaterThan(headPeak(original));
    expect(tailWidth(thickerTail)).toBeGreaterThan(tailWidth(original));
  });
});
