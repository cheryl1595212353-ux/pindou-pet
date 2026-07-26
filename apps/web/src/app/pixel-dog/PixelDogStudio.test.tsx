import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PixelDogStudio } from "./PixelDogStudio";
import { SLEEPING_AFTER_MS, WAITING_AFTER_MS } from "./pixelDogModel";

describe("PixelDogStudio", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("starts with a living idle pet and exposes its current state", () => {
    render(<PixelDogStudio />);

    expect(screen.getByRole("heading", { name: "和豆包一起玩" })).toBeVisible();
    expect(screen.getByRole("button", { name: "抚摸或点击豆包" })).toHaveAttribute(
      "data-state",
      "idle",
    );
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在呼吸和眨眼");
  });

  it("switches between all five pets using accessible selectors", () => {
    render(<PixelDogStudio />);

    expect(screen.getAllByRole("button", { name: /选择宠物/ })).toHaveLength(5);

    fireEvent.click(screen.getByRole("button", { name: "选择宠物：雪团·比熊" }));

    expect(screen.getByRole("heading", { name: "和雪团一起玩" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("雪团正在呼吸和眨眼");
  });

  it("switches scenes while retaining the selected pet", () => {
    const { container } = render(<PixelDogStudio />);

    fireEvent.click(screen.getByRole("button", { name: "选择宠物：雪团·比熊" }));
    expect(screen.getAllByRole("button", { name: /切换场景/ })).toHaveLength(6);

    fireEvent.click(screen.getByRole("button", { name: "切换场景：星光露营" }));

    const room = screen.getByRole("region", { name: "雪团的星光露营" });
    expect(room).toHaveAttribute("data-pet", "xuetuan");
    expect(room).toHaveAttribute("data-scene", "camping");
    expect(screen.getByRole("button", { name: "切换场景：星光露营" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector<HTMLElement>(".pixel-dog-scene")?.style
      .getPropertyValue("--scene-background")).toBe(
      'url("/pixel-dog/scenes/camping.webp")',
    );
  });

  it("announces scene changes while the pet remains idle", () => {
    render(<PixelDogStudio />);

    const sceneAnnouncement = screen.getByText("当前场景：客厅");
    expect(sceneAnnouncement).toHaveAttribute("aria-live", "polite");

    fireEvent.click(screen.getByRole("button", { name: "切换场景：星光露营" }));

    expect(sceneAnnouncement).toHaveTextContent("当前场景：星光露营");
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在呼吸和眨眼");
  });

  it("keeps the current scene and stage position when changing pets", () => {
    const { container } = render(<PixelDogStudio />);

    fireEvent.click(screen.getByRole("button", { name: "切换场景：星光露营" }));
    const moveRight = screen.getByRole("button", { name: "向右移动" });
    fireEvent.pointerDown(moveRight);
    act(() => {
      vi.advanceTimersByTime(90);
    });
    fireEvent.pointerUp(moveRight);

    const scene = container.querySelector<HTMLElement>(".pixel-dog-scene");
    const stagePosition = scene?.style.getPropertyValue("--dog-ratio");
    expect(stagePosition).not.toBe("0.5000");

    fireEvent.click(screen.getByRole("button", { name: "喂食" }));
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在吃饭");
    fireEvent.error(container.querySelector(".pixel-dog-asset-probe")!);
    expect(screen.getByRole("alert")).toHaveTextContent("豆包的动画图集没有加载成功");

    fireEvent.click(screen.getByRole("button", { name: "选择宠物：雪团·比熊" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("雪团正在呼吸和眨眼");
    expect(screen.getByRole("region", { name: "雪团的星光露营" }))
      .toHaveAttribute("data-scene", "camping");
    expect(container.querySelector<HTMLImageElement>(".pixel-dog-asset-probe"))
      .toHaveAttribute("src", "/pixel-dog/xuetuan/spritesheet.webp");
    expect(screen.getByRole("button", { name: "抚摸或点击雪团" })).toHaveStyle(
      'background-image: url("/pixel-dog/xuetuan/spritesheet.webp")',
    );
    expect(scene?.style.getPropertyValue("--dog-ratio")).toBe(stagePosition);
  });

  it("retains an asset error until a different pet is selected", () => {
    const { container } = render(<PixelDogStudio />);

    fireEvent.error(container.querySelector(".pixel-dog-asset-probe")!);
    expect(screen.getByRole("alert")).toHaveTextContent("豆包的动画图集没有加载成功");

    fireEvent.click(screen.getByRole("button", { name: "选择宠物：豆包·红柴犬" }));
    expect(screen.getByRole("alert")).toHaveTextContent("豆包的动画图集没有加载成功");

    fireEvent.click(screen.getByRole("button", { name: "选择宠物：雪团·比熊" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "抚摸或点击雪团" })).toBeVisible();
  });

  it("reacts to clicks, petting, feeding, and jumping", () => {
    render(<PixelDogStudio />);
    const dog = screen.getByRole("button", { name: "抚摸或点击豆包" });

    fireEvent.click(dog);
    expect(screen.getByRole("status")).toHaveTextContent("豆包很开心");

    fireEvent.pointerDown(dog, { pointerId: 1 });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在享受抚摸");
    fireEvent.pointerUp(dog, { pointerId: 1 });

    fireEvent.click(screen.getByRole("button", { name: "喂食" }));
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在吃饭");
    expect(screen.getByLabelText("豆包的食盆")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "跳跃" }));
    expect(screen.getByRole("status")).toHaveTextContent("豆包跳起来了");
  });

  it("moves with focused keyboard controls and stops on key release", () => {
    render(<PixelDogStudio />);
    const playroom = screen.getByRole("region", { name: "豆包的客厅" });

    fireEvent.keyDown(playroom, { key: "ArrowLeft" });
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在向左走");

    fireEvent.keyUp(playroom, { key: "ArrowLeft" });
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在呼吸和眨眼");
  });

  it("waits and then sleeps after the approved inactivity windows", () => {
    render(<PixelDogStudio />);

    act(() => {
      vi.advanceTimersByTime(WAITING_AFTER_MS);
    });
    expect(screen.getByRole("status")).toHaveTextContent("豆包在等你");

    act(() => {
      vi.advanceTimersByTime(SLEEPING_AFTER_MS - WAITING_AFTER_MS);
    });
    expect(screen.getByRole("status")).toHaveTextContent("豆包睡着了");

    fireEvent.click(screen.getByRole("button", { name: "叫醒豆包" }));
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在呼吸和眨眼");
  });
});
