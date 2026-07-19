import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const sceneHarness = vi.hoisted(() => ({
  onDetailFallback: undefined as undefined | (() => void),
  onFrameSample: undefined as
    | undefined
    | ((sample: {
        readonly averageFps: number;
        readonly elapsedSeconds: number;
        readonly frames: number;
      }) => void),
}));

vi.mock("./VoxelCatScene", () => ({
  VoxelCatScene: ({
    onDetailFallback,
    onFrameSample,
  }: {
    onDetailFallback: () => void;
    onFrameSample?: (sample: {
      readonly averageFps: number;
      readonly elapsedSeconds: number;
      readonly frames: number;
    }) => void;
  }) => {
    sceneHarness.onDetailFallback = onDetailFallback;
    sceneHarness.onFrameSample = onFrameSample;
    return <div aria-label="互动式 3D 方块猫" role="img" />;
  },
}));

import { getCatAppearance } from "./appearances";
import { VoxelCatStage } from "./VoxelCatStage";
import type { PersonalizedVoxelModel } from "./visualHull";

const personalizedModel: PersonalizedVoxelModel = {
  main: [
    { grid: [0, 0, 0], position: [0, 0, 0], color: "#765432" },
    { grid: [1, 0, 0], position: [0.1, 0, 0], color: "#765432" },
  ],
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

afterEach(() => {
  sceneHarness.onDetailFallback = undefined;
  sceneHarness.onFrameSample = undefined;
});

describe("VoxelCatStage", () => {
  it("reports the active personalized voxel count", () => {
    const view = render(
      <VoxelCatStage
        appearance={getCatAppearance("cat-01").appearance}
        cameraPreset="front"
        detailMode="detailed"
        personalizedModel={personalizedModel}
        webglSupported
      />,
    );

    expect(view.container.querySelector(".voxel-canvas-wrap")).toHaveAttribute(
      "data-voxel-count",
      "5",
    );
  });

  it("shows an accessible WebGL failure", () => {
    render(
      <VoxelCatStage
        appearance={getCatAppearance("cat-01").appearance}
        cameraPreset="front"
        detailMode="detailed"
        webglSupported={false}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("当前浏览器不支持 3D");
    expect(screen.queryByRole("img", { name: "互动式 3D 方块猫" })).not.toBeInTheDocument();
  });

  it("recommends performance mode only for a completed low-fps window", () => {
    render(
      <VoxelCatStage
        appearance={getCatAppearance("cat-01").appearance}
        cameraPreset="front"
        detailMode="detailed"
        webglSupported
      />,
    );

    act(() => {
      sceneHarness.onFrameSample?.({
        averageFps: 24,
        elapsedSeconds: 7,
        frames: 120,
      });
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "帧率较低，建议切换性能模式",
    );

    act(() => {
      sceneHarness.onFrameSample?.({
        averageFps: 48,
        elapsedSeconds: 12,
        frames: 240,
      });
    });
    expect(
      screen.queryByText("帧率较低，建议切换性能模式"),
    ).not.toBeInTheDocument();
  });

  it("reports a local detailed-model fallback", () => {
    render(
      <VoxelCatStage
        appearance={getCatAppearance("cat-01").appearance}
        cameraPreset="front"
        detailMode="detailed"
        webglSupported
      />,
    );

    act(() => {
      sceneHarness.onDetailFallback?.();
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "精细模型加载失败，已显示性能模型",
    );
  });
});
