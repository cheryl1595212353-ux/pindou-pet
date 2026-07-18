import { render, screen } from "@testing-library/react";
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
  it("renders the approved product shell", () => {
    render(<App initialPath="/" />);

    expect(screen.getByRole("heading", { name: "把宠物变成像素伙伴" })).toBeVisible();
    expect(screen.getByLabelText("上传宠物图片")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /测试猫：/ })).toHaveLength(5);
    expect(screen.getByText("5 只 / 15 张")).toBeVisible();
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
