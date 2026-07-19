import { describe, expect, it } from "vitest";

import { CAT_APPEARANCES, PALETTE_KEYS } from "./appearances";
import {
  GRID_NEIGHBORS,
  HIGH_DENSITY_VOXEL_COUNT,
  generateHighDensityVoxelModel,
  gridKey,
  resolveVoxelPaletteKey,
} from "./highDensityGeometry";

describe("high-density voxel geometry", () => {
  it("is deterministic and stays inside the approved density envelope", () => {
    const first = generateHighDensityVoxelModel();
    const second = generateHighDensityVoxelModel();

    expect(second).toEqual(first);
    expect(HIGH_DENSITY_VOXEL_COUNT).toBeGreaterThanOrEqual(8_000);
    expect(HIGH_DENSITY_VOXEL_COUNT).toBeLessThanOrEqual(12_000);

    const head = first.main.filter((cell) => cell.region === "head");
    const headX = head.map((cell) => cell.grid[0]);
    expect(Math.max(...headX) - Math.min(...headX) + 1).toBeGreaterThanOrEqual(20);
    expect(Math.max(...headX) - Math.min(...headX) + 1).toBeLessThanOrEqual(24);
  });

  it("contains only surface cells", () => {
    const model = generateHighDensityVoxelModel();
    const occupied = new Set(model.main.map((cell) => gridKey(cell.grid)));

    for (const cell of model.main) {
      expect(
        GRID_NEIGHBORS.some(
          ([dx, dy, dz]) =>
            !occupied.has(
              gridKey([
                cell.grid[0] + dx,
                cell.grid[1] + dy,
                cell.grid[2] + dz,
              ]),
            ),
        ),
      ).toBe(true);
    }
  });

  it("maps every cell to a legal palette key for all five cats", () => {
    const model = generateHighDensityVoxelModel();

    for (const appearance of CAT_APPEARANCES) {
      for (const cell of [...model.main, ...model.tailSegment]) {
        expect(PALETTE_KEYS).toContain(resolveVoxelPaletteKey(cell, appearance));
      }
    }
  });
});
