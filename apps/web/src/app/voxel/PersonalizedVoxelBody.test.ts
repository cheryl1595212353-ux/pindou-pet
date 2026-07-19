import { describe, expect, it } from "vitest";

import {
  createPersonalizedDescriptors,
  createPersonalizedMaterial,
} from "./PersonalizedVoxelBody";
import type { PersonalizedVoxelModel } from "./visualHull";

const model: PersonalizedVoxelModel = {
  main: [
    { grid: [0, 0, 0], position: [-0.2, 0, 0.1], color: "#8a5a35" },
    { grid: [1, 0, 0], position: [-0.1, 0, 0.1], color: "#f0d9bc" },
  ],
  tailSegment: [
    { grid: [0, 0, 0], position: [0, 0, 0], color: "#6e432b" },
  ],
  voxelSize: 0.094,
  anchors: {
    faceX: -0.3,
    eyeY: 0.4,
    eyeZ: 0.12,
    noseY: 0.3,
    tailPivot: [0.3, 0.25, 0],
    tailNextPivotX: 0.2,
  },
  bounds: { min: [-0.2, 0, -0.1], max: [0.2, 0.5, 0.1] },
  palette: ["#8a5a35", "#f0d9bc", "#6e432b"],
};

describe("personalized voxel instances", () => {
  it("preserves photo-driven positions and colors", () => {
    expect(createPersonalizedDescriptors(model.main)).toEqual([
      { position: [-0.2, 0, 0.1], color: "#8a5a35" },
      { position: [-0.1, 0, 0.1], color: "#f0d9bc" },
    ]);
  });

  it("uses instance colors without an absent vertex color attribute", () => {
    const material = createPersonalizedMaterial();

    expect(material.vertexColors).toBe(false);

    material.dispose();
  });
});

