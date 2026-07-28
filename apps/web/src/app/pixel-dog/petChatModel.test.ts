import { describe, expect, it } from "vitest";

import { PETS, getPetById } from "./petCatalog";
import { MOOD_PRESENTATIONS, createPetReply } from "./petChatModel";
import { getSceneById } from "./sceneCatalog";

describe("pet chat model", () => {
  it("answers a greeting locally with the selected pet's happy voice", () => {
    const reply = createPetReply({
      message: "你好呀",
      pet: getPetById("doubao"),
      scene: getSceneById("living-room"),
      state: "idle",
    });

    expect(reply.intent).toBe("greeting");
    expect(reply.mood).toBe("happy");
    expect(reply.text).toContain("豆包");
    expect(reply.text).toContain("你好");
  });

  it("classifies every supported conversation topic with a matching mood", () => {
    const context = {
      pet: getPetById("doubao"),
      scene: getSceneById("living-room"),
      state: "idle" as const,
    };
    const cases = [
      ["想吃零食吗", "food", "content"],
      ["我们一起玩球吧", "play", "excited"],
      ["你困不困，要睡觉吗", "sleep", "sleepy"],
      ["你今天特别可爱", "praise", "shy"],
      ["你现在心情怎么样", "mood", "happy"],
      ["你喜欢这个场景吗", "scene", "curious"],
      ["HELLO!", "greeting", "happy"],
      ["云朵是什么味道", "fallback", "curious"],
    ] as const;

    for (const [message, intent, mood] of cases) {
      expect(createPetReply({ ...context, message })).toMatchObject({
        intent,
        mood,
      });
    }
  });

  it("gives all five pets distinct voices for the same message", () => {
    const scene = getSceneById("garden");
    const replies = PETS.map((pet) => (
      createPetReply({
        message: "我们一起玩吧",
        pet,
        scene,
        state: "idle",
      }).text.replace(pet.displayName, "")
    ));

    expect(new Set(replies)).toHaveLength(5);
  });

  it("grounds replies in the current action and scene", () => {
    const pet = getPetById("jutuan");
    const scene = getSceneById("camping");

    expect(createPetReply({
      message: "你好",
      pet,
      scene,
      state: "sleeping",
    }).text).toContain("叫醒");
    expect(createPetReply({
      message: "你在做什么",
      pet,
      scene,
      state: "feeding",
    }).text).toContain("吃饭");
    expect(createPetReply({
      message: "你喜欢这个场景吗",
      pet,
      scene,
      state: "idle",
    }).text).toContain("星光露营");
  });

  it("provides accessible presentation data for every mood", () => {
    expect(Object.keys(MOOD_PRESENTATIONS)).toEqual([
      "calm",
      "happy",
      "excited",
      "curious",
      "shy",
      "sleepy",
      "content",
    ]);

    for (const presentation of Object.values(MOOD_PRESENTATIONS)) {
      expect(presentation.label).not.toBe("");
      expect(presentation.emoticon).not.toBe("");
      expect(presentation.tokens).toHaveLength(3);
    }
  });

  it("lets the current pet state shape the reply mood", () => {
    const context = {
      message: "你好",
      pet: getPetById("jinbao"),
      scene: getSceneById("living-room"),
    };

    expect(createPetReply({ ...context, state: "waiting" }).mood).toBe("calm");
    expect(createPetReply({ ...context, state: "sleeping" }).mood).toBe("sleepy");
    expect(createPetReply({ ...context, state: "feeding" }).mood).toBe("content");
    expect(createPetReply({ ...context, state: "dancing" }).mood).toBe("excited");
  });
});
