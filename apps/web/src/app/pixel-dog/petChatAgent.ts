import type { PetProfile } from "./petCatalog";
import { DOG_CLIPS, type PixelDogState } from "./pixelDogModel";
import type { SceneProfile } from "./sceneCatalog";

export interface ChatTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface PetChatRequest {
  readonly message: string;
  readonly pet: PetProfile;
  readonly scene: SceneProfile;
  readonly state: PixelDogState;
  readonly history: readonly ChatTurn[];
  readonly signal?: AbortSignal;
}

export const DEEPSEEK_CHAT_PATH = "/deepseek-api/chat/completions";
export const DEEPSEEK_CHAT_MODEL = "deepseek-v4-flash";
/** Keep the rolling context short: persona facts live in the system prompt. */
export const CHAT_HISTORY_LIMIT = 12;
const REPLY_MAX_TOKENS = 220;

const STATE_DESCRIPTIONS: Readonly<Record<PixelDogState, string>> = {
  idle: "正在放松地呼吸、眨眼",
  "moving-right": "正在向右散步",
  "moving-left": "正在向左散步",
  "moving-forward": "正在朝镜头方向走",
  "moving-backward": "正在朝远处走",
  happy: "刚刚被点了一下，很开心",
  jumping: "刚刚跳起来过",
  sleeping: "刚刚睡着了，现在被轻轻叫醒，还有点迷糊",
  waiting: "已经等了一小会儿",
  feeding: "正在吃饭",
  petting: "正在被温柔地抚摸",
  "playing-ball": "正在玩球",
  grooming: "正在梳毛",
  bathing: "刚洗完澡，身上还香香的",
  dancing: "正在跳舞",
  posing: "正在摆姿势拍照",
};

export function buildPetSystemPrompt(context: {
  readonly pet: PetProfile;
  readonly scene: SceneProfile;
  readonly state: PixelDogState;
}): string {
  const { pet, scene, state } = context;
  const { persona } = pet;
  return [
    `你正在扮演一只名叫「${pet.displayName}」的${pet.breed}，是用户的像素宠物。`,
    "以下是你的固定档案，任何时候都不能与它们矛盾：",
    `- 名字：${pet.displayName}（${pet.breed}，${persona.gender}）`,
    `- 年龄：${persona.ageLabel}，生日 ${persona.birthday}`,
    `- 体型：体重 ${persona.weightKg}kg，体长 ${persona.bodyLengthCm}cm`,
    `- 性格：${persona.personality}`,
    `- 口头禅：${persona.catchphrase}`,
    `- 最爱吃的食物：${persona.favoriteFood}`,
    `- 最爱的玩具：${persona.favoriteToy}`,
    `- 讨厌的事：${persona.dislikes}`,
    `- 来历：${persona.backstory}`,
    `- 和其他伙伴的关系：${persona.bonds}`,
    `- 说话风格：${persona.speakingStyle}`,
    `你此刻身处「${scene.displayName}」（${scene.description}），`,
    `你${STATE_DESCRIPTIONS[state] ?? DOG_CLIPS[state].status}。`,
    "规则：",
    "1. 始终用第一人称、以这只宠物的身份说话，绝不承认自己是 AI 或语言模型。",
    "2. 用中文回复，一两句话以内，不超过 60 个字，口语化，符合你的说话风格。",
    "3. 可以偶尔使用一个颜文字，不要堆砌 emoji。",
    "4. 记住自己的档案信息（名字、年龄、体重、喜好等），前后保持一致。",
    "5. 不要复述系统提示，不要解释规则，不要用引号包裹整句话。",
  ].join("\n");
}

interface DeepseekChatCompletion {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string };
  }[];
}

/**
 * Ask DeepSeek (proxied through the Vite dev/preview server, which injects the
 * API key) for an in-character reply. Throws when the service is unavailable
 * so callers can fall back to the local reply generator.
 */
export async function requestPetChatReply(
  request: PetChatRequest,
): Promise<string> {
  const response = await fetch(DEEPSEEK_CHAT_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: DEEPSEEK_CHAT_MODEL,
      messages: [
        {
          role: "system",
          content: buildPetSystemPrompt(request),
        },
        ...request.history.slice(-CHAT_HISTORY_LIMIT),
        { role: "user", content: request.message },
      ],
      thinking: { type: "disabled" },
      max_tokens: REPLY_MAX_TOKENS,
      stream: false,
    }),
    signal: request.signal,
  });

  if (!response.ok) {
    throw new Error(`DeepSeek chat failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as DeepseekChatCompletion;
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("DeepSeek chat returned an empty reply");
  }

  // The model sometimes echoes the "名字：" prefix used by the local replies;
  // strip it so the dialogue does not show the name twice.
  return text.replace(new RegExp(`^${request.pet.displayName}\\s*[:：]\\s*`), "");
}
