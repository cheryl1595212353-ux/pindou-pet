import { describe, expect, it } from "vitest";

import { getCatAppearance } from "./appearances";
import { HIGH_DENSITY_VOXEL_MODEL } from "./highDensityGeometry";
import {
  createVoxelInstanceDescriptors,
  createVoxelMaterial,
} from "./HighDensityVoxelBody";

describe("high-density voxel instances", () => {
  it("creates one stable position and palette color per voxel", () => {
    const appearance = getCatAppearance("cat-02").appearance;
    const cells = HIGH_DENSITY_VOXEL_MODEL.tailSegment;

    const first = createVoxelInstanceDescriptors(cells, appearance);
    const second = createVoxelInstanceDescriptors(cells, appearance);

    expect(first).toEqual(second);
    expect(first).toHaveLength(cells.length);
    expect(first[0]?.position).toEqual(cells[0]?.position);
    expect(first.every((item) => /^#[0-9a-f]{6}$/i.test(item.color))).toBe(true);
  });

  it("uses instance colors without requesting an absent vertex-color attribute", () => {
    const material = createVoxelMaterial();

    expect(material.vertexColors).toBe(false);

    material.dispose();
  });
});
