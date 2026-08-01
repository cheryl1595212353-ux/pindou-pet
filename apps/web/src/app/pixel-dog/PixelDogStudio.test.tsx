import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PixelDogStudio } from "./PixelDogStudio";
import { SLEEPING_AFTER_MS, WAITING_AFTER_MS } from "./pixelDogModel";

describe("PixelDogStudio", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    // Chat always tries DeepSeek first; tests default to the offline fallback.
    fetchMock = vi.fn().mockRejectedValue(new Error("offline in tests"));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const openPetPicker = () => {
    fireEvent.click(screen.getByRole("button", { name: /更换宠物/ }));
  };

  const openScenePicker = () => {
    fireEvent.click(screen.getByRole("button", { name: /更换场景/ }));
  };

  const choosePet = (label: string) => {
    openPetPicker();
    fireEvent.click(screen.getByRole("button", { name: `选择宠物：${label}` }));
  };

  const chooseScene = (label: string) => {
    openScenePicker();
    fireEvent.click(screen.getByRole("button", { name: `切换场景：${label}` }));
  };

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

  it("sends a local message and shows the pet's new mood", async () => {
    render(<PixelDogStudio />);
    fireEvent.click(screen.getByRole("button", { name: "和豆包聊天" }));

    const input = screen.getByRole("textbox", { name: "对豆包说点什么" });
    const send = screen.getByRole("button", { name: "发送给豆包" });
    expect(send).toBeDisabled();

    fireEvent.change(input, { target: { value: "我们一起玩球吧" } });
    expect(send).toBeEnabled();
    fireEvent.click(send);

    expect(screen.getByText("你：我们一起玩球吧")).toBeVisible();
    expect(screen.getByLabelText("豆包的完整回复"))
      .toHaveTextContent("豆包正在思考回复");
    await act(async () => {});

    expect(screen.getByLabelText("豆包的完整回复")).toHaveTextContent("一起玩");
    expect(screen.getByText("兴奋")).toBeVisible();
    expect(screen.getByLabelText("豆包的颜文字")).toHaveTextContent("٩(ˊᗜˋ*)و");
    expect(input).toHaveValue("");
  });

  it("keeps chat keyboard controls separate from pet movement", async () => {
    render(<PixelDogStudio />);
    const chatToggle = screen.getByRole("button", { name: "和豆包聊天" });
    fireEvent.click(chatToggle);

    const input = screen.getByRole("textbox", { name: "对豆包说点什么" });
    expect(input).toHaveFocus();

    fireEvent.change(input, { target: { value: "你好" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("你：你好")).toBeVisible();
    await act(async () => {});

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
    choosePet("雪团·比熊");

    expect(screen.getByRole("region", { name: "和雪团聊天" })).toBeVisible();
    expect(screen.getByLabelText("雪团的完整回复")).toHaveTextContent("雪团");
    expect(screen.getByLabelText("雪团的完整回复")).not.toHaveTextContent("豆包");
    expect(screen.getByRole("textbox", { name: "对雪团说点什么" })).toHaveFocus();
  });

  it("briefly flashes the current emotion around the pet after a reply", async () => {
    render(<PixelDogStudio />);
    fireEvent.click(screen.getByRole("button", { name: "和豆包聊天" }));
    const input = screen.getByRole("textbox", { name: "对豆包说点什么" });
    fireEvent.change(input, { target: { value: "我们玩游戏吧" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await act(async () => {});

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

  it("grounds chat in the room without resetting scene, position, or size", async () => {
    render(<PixelDogStudio />);
    chooseScene("星光露营");
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
    await act(async () => {});

    expect(screen.getByLabelText("豆包的完整回复")).toHaveTextContent("星光露营");
    expect(screen.getByRole("region", { name: "豆包的星光露营" })).toBeVisible();
    expect(screen.getByRole("slider", { name: "宠物大小" })).toHaveValue("115");
    expect(screen.getByText("X 54 · Y 50")).toBeVisible();
  });

  it("shows the pet's profile facts inside the dialogue", () => {
    render(<PixelDogStudio />);
    fireEvent.click(screen.getByRole("button", { name: "和豆包聊天" }));

    expect(screen.getByText("2 岁 · 红柴犬 · 最爱鸡肉干")).toBeVisible();

    choosePet("橘团·橘色异国短毛猫");
    expect(screen.getByText("5 岁 · 橘色异国短毛猫 · 最爱金枪鱼罐头")).toBeVisible();
  });

  it("answers through DeepSeek in character and keeps a per-pet history", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "豆包：好耶！我们现在就去客厅探险吧" } }],
      }),
    });
    render(<PixelDogStudio />);
    fireEvent.click(screen.getByRole("button", { name: "和豆包聊天" }));
    const input = screen.getByRole("textbox", { name: "对豆包说点什么" });

    fireEvent.change(input, { target: { value: "我们去玩球吧" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("button", { name: "发送给豆包" })).toBeDisabled();
    expect(screen.getByLabelText("豆包的完整回复"))
      .toHaveTextContent("豆包正在思考回复");

    await act(async () => {});

    expect(screen.getByLabelText("豆包的完整回复"))
      .toHaveTextContent("好耶！我们现在就去客厅探险吧");
    expect(screen.getByLabelText("豆包的完整回复"))
      .not.toHaveTextContent("豆包：");
    expect(input).toBeEnabled();

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/deepseek-api/chat/completions");
    expect(firstBody.model).toBe("deepseek-v4-flash");
    expect(firstBody.thinking).toEqual({ type: "disabled" });
    expect(firstBody.messages[0].role).toBe("system");
    expect(firstBody.messages[0].content).toContain("豆包");
    expect(firstBody.messages[0].content).toContain("2 岁");
    expect(firstBody.messages[0].content).toContain("2024-03-14");
    expect(firstBody.messages[0].content).toContain("客厅");
    expect(firstBody.messages.at(-1)).toEqual({
      role: "user",
      content: "我们去玩球吧",
    });

    fireEvent.change(input, { target: { value: "你几岁啦" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await act(async () => {});

    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(secondBody.messages).toContainEqual({
      role: "assistant",
      content: "好耶！我们现在就去客厅探险吧",
    });
    expect(secondBody.messages.at(-1)).toEqual({
      role: "user",
      content: "你几岁啦",
    });
  });

  it("keeps each pet's conversation history separate", async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {
        messages: { role: string; content: string }[];
      };
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: `${body.messages.at(-1)?.content ?? ""}，收到` },
          }],
        }),
      };
    });
    render(<PixelDogStudio />);
    fireEvent.click(screen.getByRole("button", { name: "和豆包聊天" }));
    const doubaoInput = screen.getByRole("textbox", { name: "对豆包说点什么" });
    fireEvent.change(doubaoInput, { target: { value: "记住我喜欢球" } });
    fireEvent.keyDown(doubaoInput, { key: "Enter" });
    await act(async () => {});

    choosePet("金宝·金毛");
    const jinbaoInput = screen.getByRole("textbox", { name: "对金宝说点什么" });
    fireEvent.change(jinbaoInput, { target: { value: "你好金宝" } });
    fireEvent.keyDown(jinbaoInput, { key: "Enter" });
    await act(async () => {});

    const jinbaoBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      messages: { role: string; content: string }[];
    };
    expect(jinbaoBody.messages).toHaveLength(2);
    expect(jinbaoBody.messages[0]?.content).toContain("金宝");
    expect(jinbaoBody.messages[1]).toEqual({ role: "user", content: "你好金宝" });

    choosePet("豆包·红柴犬");
    const doubaoAgain = screen.getByRole("textbox", { name: "对豆包说点什么" });
    fireEvent.change(doubaoAgain, { target: { value: "我喜欢什么" } });
    fireEvent.keyDown(doubaoAgain, { key: "Enter" });
    await act(async () => {});

    const doubaoBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)) as {
      messages: { role: string; content: string }[];
    };
    expect(doubaoBody.messages).toContainEqual({
      role: "user",
      content: "记住我喜欢球",
    });
    expect(doubaoBody.messages).toContainEqual({
      role: "assistant",
      content: "记住我喜欢球，收到",
    });
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

    expect(screen.queryByRole("button", { name: /选择宠物：/ }))
      .not.toBeInTheDocument();
    openPetPicker();
    expect(screen.getAllByRole("button", { name: /选择宠物：/ })).toHaveLength(5);

    fireEvent.click(screen.getByRole("button", { name: "选择宠物：雪团·比熊" }));

    expect(screen.getByRole("heading", { name: "和雪团一起玩" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("雪团正在呼吸和眨眼");
  });

  it("reveals pickers on demand and closes them after selection or Escape", () => {
    render(<PixelDogStudio />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const petTrigger = screen.getByRole("button", { name: /更换宠物/ });
    expect(petTrigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(petTrigger);
    expect(petTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "选择宠物" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "选择宠物：雪团·比熊" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /更换宠物/ }))
      .toHaveAttribute("aria-expanded", "false");

    const sceneTrigger = screen.getByRole("button", { name: /更换场景/ });
    fireEvent.click(sceneTrigger);
    expect(screen.getByRole("dialog", { name: "选择场景" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: /切换场景：/ })).toHaveLength(6);

    fireEvent.keyDown(sceneTrigger, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sceneTrigger).toHaveFocus();
  });

  it("keeps a pinned panel open when the other picker is previewed", () => {
    render(<PixelDogStudio />);

    fireEvent.click(screen.getByRole("button", { name: /更换宠物/ }));
    expect(screen.getByRole("dialog", { name: "选择宠物" })).toBeVisible();

    fireEvent.pointerOver(
      screen.getByRole("button", { name: /更换场景/ }),
      { pointerType: "mouse" },
    );
    expect(screen.getByRole("dialog", { name: "选择宠物" })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "选择场景" }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /更换场景/ }));
    expect(screen.queryByRole("dialog", { name: "选择宠物" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "选择场景" })).toBeVisible();
  });

  it("closes the hover preview immediately when the pointer exits downward", () => {
    render(<PixelDogStudio />);
    const petTrigger = screen.getByRole("button", { name: /更换宠物/ });

    fireEvent.pointerOver(petTrigger, { pointerType: "mouse", clientY: 200 });
    expect(screen.getByRole("dialog", { name: "选择宠物" })).toBeVisible();

    fireEvent.pointerMove(petTrigger, { pointerType: "mouse", clientY: 230 });
    fireEvent.pointerOut(petTrigger, { pointerType: "mouse", clientY: 260 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(petTrigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the hover preview immediately when the pointer exits sideways", () => {
    render(<PixelDogStudio />);
    const sceneTrigger = screen.getByRole("button", { name: /更换场景/ });

    fireEvent.pointerOver(sceneTrigger, { pointerType: "mouse", clientY: 200 });
    expect(screen.getByRole("dialog", { name: "选择场景" })).toBeVisible();

    fireEvent.pointerOut(sceneTrigger, { pointerType: "mouse", clientY: 201 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the preview open when the pointer exits back up toward the tab", () => {
    render(<PixelDogStudio />);
    const petTrigger = screen.getByRole("button", { name: /更换宠物/ });

    fireEvent.pointerOver(petTrigger, { pointerType: "mouse", clientY: 200 });
    expect(screen.getByRole("dialog", { name: "选择宠物" })).toBeVisible();

    fireEvent.pointerOut(petTrigger, { pointerType: "mouse", clientY: 160 });
    expect(screen.getByRole("dialog", { name: "选择宠物" })).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("dialog", { name: "选择宠物" })).toBeVisible();

    // Re-entering and then leaving downward closes it right away.
    fireEvent.pointerOver(petTrigger, { pointerType: "mouse", clientY: 160 });
    fireEvent.pointerOut(petTrigger, { pointerType: "mouse", clientY: 220 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("dismisses a hover preview when pressing outside the picker area", () => {
    render(<PixelDogStudio />);
    const petTrigger = screen.getByRole("button", { name: /更换宠物/ });

    fireEvent.pointerOver(petTrigger, { pointerType: "mouse", clientY: 200 });
    expect(screen.getByRole("dialog", { name: "选择宠物" })).toBeVisible();

    fireEvent.pointerDown(screen.getByRole("region", { name: "豆包的客厅" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes a pinned panel when pressing outside the picker area", () => {
    const { container } = render(<PixelDogStudio />);

    fireEvent.click(screen.getByRole("button", { name: /更换宠物/ }));
    expect(screen.getByRole("dialog", { name: "选择宠物" })).toBeVisible();

    const scene = mockSceneRect(container);
    fireEvent.pointerDown(screen.getByRole("region", { name: "豆包的客厅" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(scene, { clientX: 600, clientY: 450 });
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByText("X 50 · Y 50")).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.click(scene, { clientX: 600, clientY: 450 });
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByText("X 83 · Y 54")).toBeVisible();
  });

  it("switches scenes while retaining the selected pet", () => {
    const { container } = render(<PixelDogStudio />);

    choosePet("雪团·比熊");
    openScenePicker();
    expect(screen.getAllByRole("button", { name: /切换场景：/ })).toHaveLength(6);

    fireEvent.click(screen.getByRole("button", { name: "切换场景：星光露营" }));

    const room = screen.getByRole("region", { name: "雪团的星光露营" });
    expect(room).toHaveAttribute("data-pet", "xuetuan");
    expect(room).toHaveAttribute("data-scene", "camping");
    openScenePicker();
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

    chooseScene("星光露营");

    expect(sceneAnnouncement).toHaveTextContent("当前场景：星光露营");
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在呼吸和眨眼");
  });

  it("keeps the current scene, two-dimensional position, and size when changing pets", () => {
    const { container } = render(<PixelDogStudio />);

    chooseScene("星光露营");
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

    choosePet("雪团·比熊");

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

    choosePet("豆包·红柴犬");
    expect(screen.getByRole("alert")).toHaveTextContent("豆包的动画图集没有加载成功");

    choosePet("雪团·比熊");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "抚摸或点击雪团" })).toBeVisible();
  });

  it("renders exactly one matching prop for each rich interaction", () => {
    render(<PixelDogStudio />);
    choosePet("雪团·比熊");

    [
      ["玩球", "正在玩球", "玩具球", "ball"],
      ["梳毛", "正在梳毛", "梳毛刷", "brush"],
      ["洗澡", "正在洗澡", "淋浴花洒", "shower"],
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

    fireEvent.keyDown(playroom, { key: "ArrowUp" });
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在向后走");
    act(() => {
      vi.advanceTimersByTime(90);
    });
    fireEvent.keyUp(playroom, { key: "ArrowUp" });

    expect(container.querySelector<HTMLElement>(".pixel-dog-scene")?.style
      .getPropertyValue("--dog-depth-progress")).not.toBe("0.5000");

    fireEvent.keyDown(playroom, { key: "ArrowDown" });
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在向前走");
    fireEvent.keyUp(playroom, { key: "ArrowDown" });

    expect(screen.getByRole("button", { name: "向左移动" })).toBeVisible();
    expect(screen.getByRole("button", { name: "向右移动" })).toBeVisible();
  });

  it("clamps forward and backward movement at the depth boundaries", () => {
    render(<PixelDogStudio />);
    const playroom = screen.getByRole("region", { name: "豆包的客厅" });

    fireEvent.keyDown(playroom, { key: "ArrowUp" });
    act(() => {
      vi.advanceTimersByTime(45 * 80);
    });
    fireEvent.keyUp(playroom, { key: "ArrowUp" });
    expect(screen.getByText("X 50 · Y 20")).toBeInTheDocument();

    fireEvent.keyDown(playroom, { key: "ArrowDown" });
    act(() => {
      vi.advanceTimersByTime(45 * 80);
    });
    fireEvent.keyUp(playroom, { key: "ArrowDown" });
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

  it("lifts the shared shadow by a per-pet amount for the sleeping pose", () => {
    const { container } = render(<PixelDogStudio />);
    const world = container.querySelector<HTMLElement>(".pixel-dog-world");

    expect(world?.style.getPropertyValue("--shadow-sleep-lift")).toBe("22px");

    choosePet("可可·棕色泰迪");
    expect(world?.style.getPropertyValue("--shadow-sleep-lift")).toBe("44px");
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

  it("settles into a slow breathing loop instead of replaying the lie-down", () => {
    render(<PixelDogStudio />);
    act(() => {
      vi.advanceTimersByTime(SLEEPING_AFTER_MS);
    });
    expect(screen.getByRole("status")).toHaveTextContent("豆包睡着了");

    const sprite = screen.getByRole("button", { name: "抚摸或点击豆包" });
    act(() => {
      vi.advanceTimersByTime(1_200);
    });
    expect(sprite).toHaveAttribute("data-frame", "6");

    for (let step = 0; step < 5; step += 1) {
      act(() => {
        vi.advanceTimersByTime(900);
      });
      expect(["6", "7"]).toContain(sprite.getAttribute("data-frame"));
    }
  });

  it("parks a sleeping pet on the curled-up frame under reduced motion", () => {
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
    act(() => {
      vi.advanceTimersByTime(SLEEPING_AFTER_MS);
    });
    const sprite = screen.getByRole("button", { name: "抚摸或点击豆包" });
    expect(sprite).toHaveAttribute("data-state", "sleeping");
    expect(sprite).toHaveAttribute("data-frame", "6");

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(sprite).toHaveAttribute("data-frame", "6");
    view.unmount();

    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", originalMatchMedia);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });

  it("lifts the pet above a reserved dialogue area when chat opens", () => {
    const { container } = render(<PixelDogStudio />);
    const room = screen.getByRole("region", { name: "豆包的客厅" });
    const scene = container.querySelector<HTMLElement>(".pixel-dog-scene");

    expect(room).toHaveAttribute("data-chat-open", "false");
    expect(scene?.style.getPropertyValue("--dog-bottom"))
      .toContain("var(--chat-reserved");

    fireEvent.click(screen.getByRole("button", { name: "和豆包聊天" }));

    expect(room).toHaveAttribute("data-chat-open", "true");
    expect(scene?.style.getPropertyValue("--dog-bottom"))
      .toContain("var(--chat-reserved");
  });

  it("runs a complete pixel shower while bathing and cleans up afterwards", () => {
    const { container } = render(<PixelDogStudio />);

    fireEvent.click(screen.getByRole("button", { name: "洗澡" }));

    const shower = screen.getByRole("img", { name: "淋浴花洒" });
    expect(shower).toHaveClass("pixel-dog-prop", "pixel-dog-prop--shower");
    for (const part of ["pipe", "head", "drops", "bubbles", "splash"]) {
      expect(
        shower.querySelector(`.pixel-dog-prop--shower__${part}`),
      ).not.toBeNull();
    }
    const rain = container.querySelector(".pixel-dog-shower-rain");
    expect(rain).not.toBeNull();
    expect(rain).toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByRole("img")).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    expect(screen.getByRole("status")).toHaveTextContent("豆包正在呼吸和眨眼");
    expect(screen.queryByRole("img", { name: "淋浴花洒" }))
      .not.toBeInTheDocument();
    expect(container.querySelector(".pixel-dog-shower-rain")).toBeNull();
  });

  function mockSceneRect(container: HTMLElement): HTMLElement {
    const scene = container.querySelector<HTMLElement>(".pixel-dog-scene");
    if (!scene) throw new Error("scene not found");
    vi.spyOn(scene, "getBoundingClientRect").mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    return scene;
  }

  it("walks smoothly toward a clicked scene point and idles on arrival", () => {
    const { container } = render(<PixelDogStudio />);
    const scene = mockSceneRect(container);

    fireEvent.click(scene, { clientX: 600, clientY: 450 });

    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(screen.getByRole("button", { name: "抚摸或点击豆包" }))
      .toHaveAttribute("data-state", "moving-right");
    expect(screen.queryByText("X 50 · Y 50")).not.toBeInTheDocument();
    expect(screen.queryByText("X 83 · Y 54")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(screen.getByText("X 83 · Y 54")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在呼吸和眨眼");
  });

  it("picks the dominant depth animation for mostly forward targets", () => {
    const { container } = render(<PixelDogStudio />);
    const scene = mockSceneRect(container);

    fireEvent.click(scene, { clientX: 400, clientY: 590 });

    act(() => {
      vi.advanceTimersByTime(135);
    });
    expect(screen.getByRole("button", { name: "抚摸或点击豆包" }))
      .toHaveAttribute("data-state", "moving-forward");

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByText("X 50 · Y 80")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在呼吸和眨眼");
  });

  it("runs sideways for steep diagonals that still drift horizontally", () => {
    const { container } = render(<PixelDogStudio />);
    const scene = mockSceneRect(container);

    // Target lands almost straight below (Y 80) but ~2 stage units right,
    // so the pet plays the lateral run instead of the depth glide.
    fireEvent.click(scene, { clientX: 411, clientY: 590 });

    act(() => {
      vi.advanceTimersByTime(135);
    });
    expect(screen.getByRole("button", { name: "抚摸或点击豆包" }))
      .toHaveAttribute("data-state", "moving-right");

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByText("X 52 · Y 80")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在呼吸和眨眼");
  });

  it("retargets immediately when a new scene point is clicked", () => {
    const { container } = render(<PixelDogStudio />);
    const scene = mockSceneRect(container);

    fireEvent.click(scene, { clientX: 160, clientY: 150 });
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(screen.getByRole("button", { name: "抚摸或点击豆包" }))
      .toHaveAttribute("data-state", "moving-left");

    fireEvent.click(scene, { clientX: 760, clientY: 540 });
    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(screen.getByText("X 92 · Y 73")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在呼吸和眨眼");
  });

  it("ignores scene-adjacent clicks on the dialogue and the pet itself", () => {
    const { container } = render(<PixelDogStudio />);
    mockSceneRect(container);

    fireEvent.click(screen.getByRole("button", { name: "和豆包聊天" }));
    fireEvent.click(
      screen.getByRole("region", { name: "和豆包聊天" }),
      { clientX: 700, clientY: 500 },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "抚摸或点击豆包" }),
      { clientX: 400, clientY: 300 },
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByText("X 50 · Y 50")).toBeVisible();
    expect(screen.getByRole("button", { name: "抚摸或点击豆包" }))
      .toHaveAttribute("data-state", "idle");
  });

  it("lets the directional pad cancel an active walk target", () => {
    const { container } = render(<PixelDogStudio />);
    const scene = mockSceneRect(container);
    const playroom = screen.getByRole("region", { name: "豆包的客厅" });

    fireEvent.click(scene, { clientX: 760, clientY: 540 });
    act(() => {
      vi.advanceTimersByTime(450);
    });

    fireEvent.keyDown(playroom, { key: "ArrowLeft" });
    fireEvent.keyUp(playroom, { key: "ArrowLeft" });
    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(screen.getByRole("status")).toHaveTextContent("豆包正在呼吸和眨眼");
    expect(screen.queryByText("X 92 · Y 73")).not.toBeInTheDocument();
  });

  it("snaps to the clicked point without motion when reduced motion is on", () => {
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
    const scene = mockSceneRect(view.container);

    fireEvent.click(scene, { clientX: 600, clientY: 450 });

    expect(screen.getByText("X 83 · Y 54")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("豆包正在呼吸和眨眼");

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText("X 83 · Y 54")).toBeVisible();
    view.unmount();

    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", originalMatchMedia);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });
});
