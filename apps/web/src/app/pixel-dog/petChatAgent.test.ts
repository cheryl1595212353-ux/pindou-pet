import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CHAT_HISTORY_LIMIT,
  DEEPSEEK_CHAT_MODEL,
  DEEPSEEK_CHAT_PATH,
  buildPetSystemPrompt,
  requestPetChatReply,
} from "./petChatAgent";
import { getPetById } from "./petCatalog";
import { getSceneById } from "./sceneCatalog";

const pet = getPetById("jinbao");
const scene = getSceneById("garden");

function lastRequestBody(fetchMock: ReturnType<typeof vi.fn>) {
  const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
  return JSON.parse(String(init.body)) as {
    model: string;
    thinking: { type: string };
    max_tokens: number;
    stream: boolean;
    messages: { role: string; content: string }[];
  };
}

describe("pet chat agent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("grounds the system prompt in the pet's full profile and current context", () => {
    const prompt = buildPetSystemPrompt({ pet, scene, state: "bathing" });

    expect(prompt).toContain("金宝");
    expect(prompt).toContain("金毛");
    expect(prompt).toContain("3 岁");
    expect(prompt).toContain("2023-06-01");
    expect(prompt).toContain("26kg");
    expect(prompt).toContain("68cm");
    expect(prompt).toContain("温柔贴心");
    expect(prompt).toContain("当然可以，我会陪着你。");
    expect(prompt).toContain("南瓜鸡肉饭");
    expect(prompt).toContain("软飞盘");
    expect(prompt).toContain("打雷");
    expect(prompt).toContain("治疗犬");
    expect(prompt).toContain("花园");
    expect(prompt).toContain("刚洗完澡");
    expect(prompt).toContain("第一人称");
    expect(prompt).toContain("60 个字");
  });

  it("posts an OpenAI-style non-thinking request with history before the new message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "当然可以，我陪你慢慢逛花园。" } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const history = [
      { role: "user" as const, content: "你好呀" },
      { role: "assistant" as const, content: "你好，我一直在这儿。" },
    ];
    const reply = await requestPetChatReply({
      message: "这里好玩吗？",
      pet,
      scene,
      state: "idle",
      history,
    });

    expect(reply).toBe("当然可以，我陪你慢慢逛花园。");
    expect(fetchMock).toHaveBeenCalledWith(
      DEEPSEEK_CHAT_PATH,
      expect.objectContaining({ method: "POST" }),
    );
    const body = lastRequestBody(fetchMock);
    expect(body.model).toBe(DEEPSEEK_CHAT_MODEL);
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.messages[0]?.role).toBe("system");
    expect(body.messages[0]?.content).toContain("金宝");
    expect(body.messages.slice(1)).toEqual([
      ...history,
      { role: "user", content: "这里好玩吗？" },
    ]);
  });

  it("trims history to the rolling limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "嗯。" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const history = Array.from(
      { length: CHAT_HISTORY_LIMIT + 6 },
      (_, index) => ({
        role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `第 ${index} 条`,
      }),
    );
    await requestPetChatReply({
      message: "最新一条",
      pet,
      scene,
      state: "idle",
      history,
    });

    const body = lastRequestBody(fetchMock);
    // system + trimmed history + the new user message
    expect(body.messages).toHaveLength(1 + CHAT_HISTORY_LIMIT + 1);
    expect(body.messages[1]?.content).toBe("第 6 条");
  });

  it("strips an echoed name prefix so the dialogue shows the name once", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "金宝：我在呢。" } }] }),
    }));

    const reply = await requestPetChatReply({
      message: "在吗",
      pet,
      scene,
      state: "idle",
      history: [],
    });

    expect(reply).toBe("我在呢。");
  });

  it("throws for non-OK responses and empty replies so callers can fall back", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(requestPetChatReply({
      message: "嗨",
      pet,
      scene,
      state: "idle",
      history: [],
    })).rejects.toThrow("401");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "  " } }] }),
    }));
    await expect(requestPetChatReply({
      message: "嗨",
      pet,
      scene,
      state: "idle",
      history: [],
    })).rejects.toThrow("empty");
  });
});
