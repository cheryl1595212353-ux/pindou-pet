import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

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
  it("renders the approved 2D interactive dog product shell", () => {
    render(<App initialPath="/" />);

    expect(screen.getByRole("heading", { name: "和豆包一起玩" })).toBeVisible();
    expect(screen.getByRole("region", { name: "豆包的客厅" })).toBeVisible();
    expect(screen.getByRole("button", { name: "抚摸或点击豆包" })).toHaveAttribute(
      "data-state",
      "idle",
    );
    expect(screen.queryByText(/3D 方块伙伴/)).not.toBeInTheDocument();
  });

  it("exposes all direct interaction controls from the root page", () => {
    render(<App initialPath="/" />);

    fireEvent.click(screen.getByRole("button", { name: "喂食" }));
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在吃饭");
    expect(screen.getByRole("button", { name: "跳跃" })).toBeVisible();
    expect(screen.getByRole("button", { name: "叫醒豆包" })).toBeVisible();
    expect(screen.getByRole("button", { name: "向左移动" })).toBeVisible();
    expect(screen.getByRole("button", { name: "向右移动" })).toBeVisible();
  });

  it("provides the four approved route boundaries", () => {
    setViewport(1440, 900);
    const routes = [
      ["/", "和豆包一起玩"],
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
