import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./voxel/VoxelCatStage", () => ({
  VoxelCatStage: ({
    appearance,
    cameraPreset,
    detailMode,
  }: {
    appearance: { id: string; name: string };
    cameraPreset: string;
    detailMode: string;
  }) => (
    <div aria-label="互动式 3D 方块猫" role="img">
      {appearance.name} / {cameraPreset} / {detailMode}
    </div>
  ),
}));

import { App } from "./App";

const originalWidth = window.innerWidth;

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  setViewport(originalWidth, 800);
});

describe("product shell", () => {
  it("renders the approved product shell", () => {
    render(<App initialPath="/" />);

    expect(screen.getByRole("heading", { name: "把宠物变成3D 方块伙伴" })).toBeVisible();
    expect(screen.getByRole("img", { name: "互动式 3D 方块猫" })).toHaveTextContent("小满 / front");
    expect(screen.getAllByRole("button", { name: /测试猫：/ })).toHaveLength(5);
    expect(screen.getByText("5 只 / 15 张参考图")).toBeVisible();
    expect(screen.queryByLabelText("上传宠物图片")).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("switches cat appearance and 3D camera presets", () => {
    render(<App initialPath="/" />);

    fireEvent.click(screen.getByRole("button", { name: "测试猫：橘子，橘色长毛" }));
    fireEvent.click(screen.getByRole("button", { name: "侧面视角" }));

    expect(screen.getByRole("img", { name: "互动式 3D 方块猫" })).toHaveTextContent("橘子 / side");
    expect(screen.getByRole("button", { name: "侧面视角" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches detail modes without losing the selected cat or camera", () => {
    render(<App initialPath="/" />);
    expect(screen.getByRole("img", { name: "互动式 3D 方块猫" })).toHaveTextContent(
      "小满 / front / detailed",
    );

    fireEvent.click(screen.getByRole("button", { name: "测试猫：橘子，橘色长毛" }));
    fireEvent.click(screen.getByRole("button", { name: "侧面视角" }));
    fireEvent.click(screen.getByRole("button", { name: "性能模式" }));

    expect(screen.getByRole("img", { name: "互动式 3D 方块猫" })).toHaveTextContent(
      "橘子 / side / performance",
    );
    expect(screen.getByRole("button", { name: "性能模式" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "精细模式" }));
    expect(screen.getByRole("img", { name: "互动式 3D 方块猫" })).toHaveTextContent(
      "橘子 / side / detailed",
    );
  });

  it("provides the four approved route boundaries", () => {
    setViewport(1440, 900);
    const routes = [
      ["/", "选择测试猫"],
      ["/projects/demo/edit", "图层与拼豆编辑"],
      ["/projects/demo/room", "互动房间"],
      ["/projects/demo/export", "导出预览"],
    ] as const;

    for (const [path, label] of routes) {
      const view = render(<App initialPath={path} />);
      expect(screen.getByText(label)).toBeVisible();
      view.unmount();
    }
  });

  it("blocks fine editing below the approved desktop viewport", () => {
    setViewport(390, 844);
    render(<App initialPath="/projects/demo/edit" />);

    expect(screen.getByText("请在宽度至少 1280px 的桌面浏览器中编辑")).toBeVisible();
    expect(screen.queryByText("图层与拼豆编辑")).not.toBeInTheDocument();
  });
});
