import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-three/fiber", () => ({
  useFrame: vi.fn(),
}));

vi.mock("./HighDensityVoxelBody", () => ({
  HighDensityVoxelBody: () => <div data-testid="detailed-voxel-body" />,
}));

vi.mock("./PersonalizedVoxelBody", () => ({
  PersonalizedVoxelBody: () => <div data-testid="personalized-voxel-body" />,
}));

vi.mock("./texture", () => ({
  createPixelTexture: () => ({ dispose: vi.fn() }),
}));

import { getCatAppearance } from "./appearances";
import { VoxelCatModel } from "./VoxelCatModel";
import type { PersonalizedVoxelModel } from "./visualHull";

const personalizedModel: PersonalizedVoxelModel = {
  main: [{ grid: [0, 0, 0], position: [0, 0, 0], color: "#765432" }],
  tailSegment: [{ grid: [0, 0, 0], position: [0, 0, 0], color: "#765432" }],
  voxelSize: 0.094,
  anchors: {
    faceX: -1,
    eyeY: 1,
    eyeZ: 0.2,
    noseY: 0.8,
    tailPivot: [1, 1, 0],
    tailNextPivotX: 0.4,
  },
  bounds: { min: [-1, 0, -0.5], max: [1, 2, 0.5] },
  palette: ["#765432"],
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VoxelCatModel detail modes", () => {
  it.each(["detailed", "performance"] as const)(
    "renders the personalized body in %s mode when supplied",
    (detailMode) => {
      render(
        <VoxelCatModel
          appearance={getCatAppearance("cat-01").appearance}
          detailMode={detailMode}
          onDetailFallback={vi.fn()}
          onHeartChange={vi.fn()}
          personalizedModel={personalizedModel}
          reducedMotion={false}
        />,
      );

      expect(screen.getByTestId("personalized-voxel-body")).toBeVisible();
      expect(screen.queryByTestId("detailed-voxel-body")).not.toBeInTheDocument();
    },
  );

  it("renders the detailed voxel body in detailed mode", () => {
    render(
      <VoxelCatModel
        appearance={getCatAppearance("cat-01").appearance}
        detailMode="detailed"
        onDetailFallback={vi.fn()}
        onHeartChange={vi.fn()}
        reducedMotion={false}
      />,
    );

    expect(screen.getByTestId("detailed-voxel-body")).toBeVisible();
  });

  it("keeps the existing coarse body in performance mode", () => {
    const view = render(
      <VoxelCatModel
        appearance={getCatAppearance("cat-01").appearance}
        detailMode="performance"
        onDetailFallback={vi.fn()}
        onHeartChange={vi.fn()}
        reducedMotion={false}
      />,
    );

    expect(screen.queryByTestId("detailed-voxel-body")).not.toBeInTheDocument();
    expect(view.container.querySelector("mesh")).not.toBeNull();
  });
});
