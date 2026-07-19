import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getCatAppearance } from "./appearances";
import { VoxelCatStage } from "./VoxelCatStage";

describe("VoxelCatStage", () => {
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
});
