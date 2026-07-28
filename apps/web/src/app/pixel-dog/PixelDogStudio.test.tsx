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

  it("opens and closes a classic pet dialogue", () => {
    render(<PixelDogStudio />);

    expect(screen.queryByRole("region", { name: "和豆包聊天" }))
      .not.toBeInTheDocument();
    expect(screen.getByLabelText("豆包的完整回复")).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: "和豆包聊天" }));

    expect(screen.getByRole("region", { name: "和豆包聊天" })).toBeVisible();
    expect(screen.getByText("开心")).toBeVisible();
    expect(screen.getByLabelText("豆包的颜文字")).toHaveTextContent("(ᵔᴥᵔ)");
    expect(screen.getByLabelText("豆包的完整回复")).not.toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: "关闭对话" }));

    expect(screen.queryByRole("region", { name: "和豆包聊天" }))
      .not.toBeInTheDocument();
    expect(screen.getByLabelText("豆包的完整回复")).toBeEmptyDOMElement();
  });

  it("sends a local message and shows the pet's new mood", () => {
    render(<PixelDogStudio />);
    fireEvent.click(screen.getByRole("button", { name: "和豆包聊天" }));

    const input = screen.getByRole("textbox", { name: "对豆包说点什么" });
    const send = screen.getByRole("button", { name: "发送给豆包" });
    expect(send).toBeDisabled();

    fireEvent.change(input, { target: { value: "我们一起玩球吧" } });
    expect(send).toBeEnabled();
    fireEvent.click(send);

    expect(screen.getByText("你：我们一起玩球吧")).toBeVisible();
    expect(screen.getByLabelText("豆包的完整回复")).toHaveTextContent("一起玩");
    expect(screen.getByText("兴奋")).toBeVisible();
    expect(screen.getByLabelText("豆包的颜文字")).toHaveTextContent("٩(ˊᗜˋ*)و");
    expect(input).toHaveValue("");
  });

  it("keeps chat keyboard controls separate from pet movement", () => {
    render(<PixelDogStudio />);
    const chatToggle = screen.getByRole("button", { name: "和豆包聊天" });
    fireEvent.click(chatToggle);

    const input = screen.getByRole("textbox", { name: "对豆包说点什么" });
    expect(input).toHaveFocus();

    fireEvent.change(input, { target: { value: "你好" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("你：你好")).toBeVisible();

    fireEvent.change(input, { target: { value: "还没发出的消息" } });
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(screen.getByText("X 50 · Y 50")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在呼吸和眨眼");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "和豆包聊天" }))
      .not.toBeInTheDocument();
    expect(chatToggle).toHaveFocus();
  });

  it("welcomes the newly selected pet without closing chat", () => {
    render(<PixelDogStudio />);
    fireEvent.click(screen.getByRole("button", { name: "和豆包聊天" }));
    fireEvent.click(screen.getByRole("button", { name: "选择宠物：雪团·比熊" }));

    expect(screen.getByRole("region", { name: "和雪团聊天" })).toBeVisible();
    expect(screen.getByLabelText("雪团的完整回复")).toHaveTextContent("雪团");
    expect(screen.getByLabelText("雪团的完整回复")).not.toHaveTextContent("豆包");
    expect(screen.getByRole("textbox", { name: "对雪团说点什么" })).toHaveFocus();
  });

  it("briefly flashes the current emotion around the pet after a reply", () => {
    render(<PixelDogStudio />);
    fireEvent.click(screen.getByRole("button", { name: "和豆包聊天" }));
    const input = screen.getByRole("textbox", { name: "对豆包说点什么" });
    fireEvent.change(input, { target: { value: "我们玩游戏吧" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const burst = screen.getByRole("img", { name: "豆包的兴奋情绪" });
    expect(burst).toHaveAttribute("data-mood", "excited");
    expect(burst).toHaveTextContent("✦");
    expect(burst).toHaveTextContent("٩(ˊᗜˋ*)و");

    act(() => {
      vi.advanceTimersByTime(3_200);
    });
    expect(screen.queryByRole("img", { name: "豆包的兴奋情绪" }))
      .not.toBeInTheDocument();
  });

  it("reveals the visual pet reply with a readable typewriter cadence", () => {
    const { container } = render(<PixelDogStudio />);
    fireEvent.click(screen.getByRole("button", { name: "和豆包聊天" }));

    const fullReply = screen.getByLabelText("豆包的完整回复").textContent ?? "";
    const typedReply = container.querySelector<HTMLElement>(
      ".pixel-dog-dialogue__typed-reply",
    );
    expect(fullReply.length).toBeGreaterThan(10);
    expect(typedReply).toHaveTextContent("");

    act(() => {
      vi.advanceTimersByTime(140);
    });
    expect(typedReply?.textContent?.length).toBeGreaterThan(0);
    expect(typedReply?.textContent?.length).toBeLessThan(fullReply.length);

    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(typedReply).toHaveTextContent(fullReply);
  });

  it("remembers that a sleeping pet was awakened by opening chat", () => {
    render(<PixelDogStudio />);
    act(() => {
      vi.advanceTimersByTime(SLEEPING_AFTER_MS);
    });
    expect(screen.getByRole("status")).toHaveTextContent("豆包睡着了");

    const chatToggle = screen.getByRole("button", { name: "和豆包聊天" });
    fireEvent.pointerDown(chatToggle);
    fireEvent.click(chatToggle);

    expect(screen.getByLabelText("豆包的完整回复")).toHaveTextContent("叫醒");
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在呼吸和眨眼");
  });

  it("grounds chat in the room without resetting scene, position, or size", () => {
    render(<PixelDogStudio />);
    fireEvent.click(screen.getByRole("button", { name: "切换场景：星光露营" }));
    fireEvent.change(screen.getByRole("slider", { name: "宠物大小" }), {
      target: { value: "115" },
    });
    const moveRight = screen.getByRole("button", { name: "向右移动" });
    fireEvent.pointerDown(moveRight);
    act(() => {
      vi.advanceTimersByTime(90);
    });
    fireEvent.pointerUp(moveRight);
    expect(screen.getByText("X 54 · Y 50")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "喂食" }));
    fireEvent.click(screen.getByRole("button", { name: "和豆包聊天" }));
    expect(screen.getByLabelText("豆包的完整回复")).toHaveTextContent("吃饭");
    const input = screen.getByRole("textbox", { name: "对豆包说点什么" });
    fireEvent.change(input, { target: { value: "你喜欢这里吗" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByLabelText("豆包的完整回复")).toHaveTextContent("星光露营");
    expect(screen.getByRole("region", { name: "豆包的星光露营" })).toBeVisible();
    expect(screen.getByRole("slider", { name: "宠物大小" })).toHaveValue("115");
    expect(screen.getByText("X 54 · Y 50")).toBeVisible();
  });

  it("shows the complete reply immediately when reduced motion is requested", () => {
    const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    const view = render(<PixelDogStudio />);
    fireEvent.click(screen.getByRole("button", { name: "和豆包聊天" }));
    const fullReply = screen.getByLabelText("豆包的完整回复").textContent ?? "";
    expect(view.container.querySelector(".pixel-dog-dialogue__typed-reply"))
      .toHaveTextContent(fullReply);
    view.unmount();

    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", originalMatchMedia);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
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

  it("keeps the current scene, two-dimensional position, and size when changing pets", () => {
    const { container } = render(<PixelDogStudio />);

    fireEvent.click(screen.getByRole("button", { name: "切换场景：星光露营" }));
    fireEvent.change(screen.getByRole("slider", { name: "宠物大小" }), {
      target: { value: "115" },
    });
    const moveRight = screen.getByRole("button", { name: "向右移动" });
    fireEvent.pointerDown(moveRight);
    act(() => {
      vi.advanceTimersByTime(90);
    });
    fireEvent.pointerUp(moveRight);

    const scene = container.querySelector<HTMLElement>(".pixel-dog-scene");
    const horizontalPosition = scene?.style.getPropertyValue("--dog-x-progress");
    expect(horizontalPosition).not.toBe("0.5000");

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
    expect(scene?.style.getPropertyValue("--dog-x-progress")).toBe(horizontalPosition);
    expect(screen.getByRole("slider", { name: "宠物大小" })).toHaveValue("115");
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

  it("renders exactly one matching prop for each rich interaction", () => {
    render(<PixelDogStudio />);
    fireEvent.click(screen.getByRole("button", { name: "选择宠物：雪团·比熊" }));

    [
      ["玩球", "正在玩球", "玩具球", "ball"],
      ["梳毛", "正在梳毛", "梳毛刷", "brush"],
      ["洗澡", "正在洗澡", "宠物浴盆", "bath"],
      ["跳舞", "正在跳舞", "跳舞节拍", "dance"],
      ["拍照", "正在摆姿势拍照", "拍照闪光", "camera"],
    ].forEach(([buttonName, status, propLabel, propClass]) => {
      fireEvent.click(screen.getByRole("button", { name: buttonName }));

      expect(screen.getByRole("status")).toHaveTextContent(`雪团${status}`);
      expect(screen.getByRole("img", { name: propLabel })).toHaveClass(
        "pixel-dog-prop",
        `pixel-dog-prop--${propClass}`,
      );
      expect(screen.getAllByRole("img")).toHaveLength(1);
    });
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

  it("anchors the food bowl below the pet's mouth", () => {
    const { container } = render(<PixelDogStudio />);

    fireEvent.click(screen.getByRole("button", { name: "喂食" }));
    const bowl = screen.getByRole("img", { name: "豆包的食盆" });
    const world = container.querySelector<HTMLElement>(".pixel-dog-world");

    expect(bowl).toHaveAttribute("data-anchor", "mouth");
    expect(world?.style.getPropertyValue("--bowl-x")).toBe("78px");
    expect(world?.style.getPropertyValue("--bowl-y")).toBe("168px");
  });

  it("moves in four directions with buttons and focused keyboard controls", () => {
    const { container } = render(<PixelDogStudio />);
    const playroom = screen.getByRole("region", { name: "豆包的客厅" });

    fireEvent.keyDown(playroom, { key: "ArrowLeft" });
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在向左走");

    fireEvent.keyUp(playroom, { key: "ArrowLeft" });
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在呼吸和眨眼");

    const moveBackward = screen.getByRole("button", { name: "向后移动" });
    fireEvent.pointerDown(moveBackward);
    act(() => {
      vi.advanceTimersByTime(90);
    });
    fireEvent.pointerUp(moveBackward);

    expect(container.querySelector<HTMLElement>(".pixel-dog-scene")?.style
      .getPropertyValue("--dog-depth-progress")).not.toBe("0.5000");

    fireEvent.keyDown(playroom, { key: "ArrowDown" });
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在向前走");
    fireEvent.keyUp(playroom, { key: "ArrowDown" });

    expect(screen.getByRole("button", { name: "向前移动" })).toBeVisible();
    expect(screen.getByRole("button", { name: "向右移动" })).toBeVisible();
  });

  it("clamps forward and backward movement at the depth boundaries", () => {
    render(<PixelDogStudio />);

    const moveBackward = screen.getByRole("button", { name: "向后移动" });
    fireEvent.pointerDown(moveBackward);
    act(() => {
      vi.advanceTimersByTime(45 * 80);
    });
    fireEvent.pointerUp(moveBackward);
    expect(screen.getByText("X 50 · Y 20")).toBeInTheDocument();

    const moveForward = screen.getByRole("button", { name: "向前移动" });
    fireEvent.pointerDown(moveForward);
    act(() => {
      vi.advanceTimersByTime(45 * 80);
    });
    fireEvent.pointerUp(moveForward);
    expect(screen.getByText("X 50 · Y 80")).toBeInTheDocument();
  });

  it("changes pet size with an accessible slider and adapts the shared shadow", () => {
    const { container } = render(<PixelDogStudio />);
    const slider = screen.getByRole("slider", { name: "宠物大小" });
    const world = container.querySelector<HTMLElement>(".pixel-dog-world");

    expect(slider).toHaveValue("100");
    expect(slider).toHaveAttribute("min", "70");
    expect(slider).toHaveAttribute("max", "125");
    expect(container.querySelector(".pixel-dog-shadow")).toBeInTheDocument();
    expect(world?.style.getPropertyValue("--shadow-width")).toBe("148px");

    fireEvent.change(slider, { target: { value: "125" } });

    expect(slider).toHaveValue("125");
    expect(screen.getByText("125%")).toBeInTheDocument();
    expect(Number(world?.style.getPropertyValue("--dog-outer-scale")))
      .toBeGreaterThan(1.2);
  });

  it("keeps the ball in front of the head and flips both at the left boundary", () => {
    render(<PixelDogStudio />);

    fireEvent.click(screen.getByRole("button", { name: "玩球" }));
    expect(screen.getByRole("img", { name: "玩具球" })).toHaveAttribute(
      "data-anchor",
      "head-front",
    );
    expect(screen.getByRole("img", { name: "玩具球" })).toHaveAttribute(
      "data-side",
      "left",
    );

    const moveLeft = screen.getByRole("button", { name: "向左移动" });
    fireEvent.pointerDown(moveLeft);
    act(() => {
      vi.advanceTimersByTime(45 * 80);
    });
    fireEvent.pointerUp(moveLeft);

    fireEvent.click(screen.getByRole("button", { name: "玩球" }));
    expect(screen.getByRole("img", { name: "玩具球" })).toHaveAttribute(
      "data-side",
      "right",
    );
    expect(screen.getByRole("button", { name: "抚摸或点击豆包" }))
      .toHaveAttribute("data-action-facing", "right");
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
