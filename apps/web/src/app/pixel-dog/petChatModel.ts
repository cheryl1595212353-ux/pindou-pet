import type { PetId, PetProfile } from "./petCatalog";
import type { PixelDogState } from "./pixelDogModel";
import type { SceneProfile } from "./sceneCatalog";

export type ChatIntent =
  | "food"
  | "play"
  | "sleep"
  | "praise"
  | "mood"
  | "scene"
  | "greeting"
  | "fallback";

export type PetMood =
  | "calm"
  | "happy"
  | "excited"
  | "curious"
  | "shy"
  | "sleepy"
  | "content";

export interface PetReply {
  readonly intent: ChatIntent;
  readonly mood: PetMood;
  readonly text: string;
}

export interface MoodPresentation {
  readonly label: string;
  readonly emoticon: string;
  readonly tokens: readonly [string, string, string];
}

export interface PetReplyContext {
  readonly message: string;
  readonly pet: PetProfile;
  readonly scene: SceneProfile;
  readonly state: PixelDogState;
}

export const MOOD_PRESENTATIONS: Readonly<Record<PetMood, MoodPresentation>> = {
  calm: { label: "平静", emoticon: "(･ω･)", tokens: ["·", "•", "·"] },
  happy: { label: "开心", emoticon: "(ᵔᴥᵔ)", tokens: ["♥", "♡", "♥"] },
  excited: { label: "兴奋", emoticon: "٩(ˊᗜˋ*)و", tokens: ["✦", "★", "✦"] },
  curious: { label: "好奇", emoticon: "( •̀ ω •́ )?", tokens: ["?", "…", "?"] },
  shy: { label: "害羞", emoticon: "(⁄ ⁄•⁄ω⁄•⁄ ⁄)", tokens: ["♡", "⁄", "♡"] },
  sleepy: { label: "困倦", emoticon: "(－ω－) zzZ", tokens: ["Z", "z", "Zz"] },
  content: { label: "满足", emoticon: "(๑´ڡ｀๑)", tokens: ["♪", "♫", "♪"] },
};

const INTENT_KEYWORDS: readonly [
  ChatIntent,
  readonly string[],
][] = [
  ["food", ["吃", "饿", "饭", "零食", "肉", "骨头", "鱼"]],
  ["play", ["玩", "球", "散步", "跳舞", "游戏"]],
  ["sleep", ["睡", "困", "休息", "晚安"]],
  ["praise", ["可爱", "乖", "喜欢你", "爱你", "漂亮", "帅", "真棒", "特别棒"]],
  ["mood", ["心情", "开心吗", "怎么了", "好吗", "感觉"]],
  ["scene", ["这里", "场景", "客厅", "花园", "海滩", "海边", "雪", "露营", "屋顶"]],
  ["greeting", ["你好", "嗨", "hello", "早上好", "下午好"]],
];

const INTENT_MOODS: Readonly<Record<ChatIntent, PetMood>> = {
  food: "content",
  play: "excited",
  sleep: "sleepy",
  praise: "shy",
  mood: "happy",
  scene: "curious",
  greeting: "happy",
  fallback: "curious",
};

const PET_VOICE_OPENERS: Readonly<Record<PetId, string>> = {
  doubao: "好耶！",
  jinbao: "当然可以，我会陪着你。",
  xuetuan: "先和你贴贴！",
  keke: "收到，我已经开始想办法啦。",
  jutuan: "嗯……我们慢慢聊。",
};

const STATE_CONTEXT: Partial<Readonly<Record<PixelDogState, string>>> = {
  sleeping: "你把我轻轻叫醒啦。",
  waiting: "我刚才一直在等你。",
  feeding: "我刚才正在吃饭，嘴边还香香的。",
  petting: "你的手心暖暖的。",
  "playing-ball": "我刚追着球跑了一圈。",
  grooming: "我的毛刚刚梳得整整齐齐。",
  bathing: "我还带着刚洗完澡的清香。",
  dancing: "我刚才跳得正起劲呢。",
  posing: "我已经摆好最神气的姿势啦。",
  jumping: "我刚刚跳得可高了。",
};

const STATE_MOODS: Partial<Readonly<Record<PixelDogState, PetMood>>> = {
  waiting: "calm",
  sleeping: "sleepy",
  feeding: "content",
  petting: "happy",
  "playing-ball": "excited",
  grooming: "content",
  bathing: "content",
  dancing: "excited",
  posing: "shy",
  jumping: "excited",
  happy: "happy",
};

function classifyIntent(message: string): ChatIntent {
  const normalizedMessage = message.trim().toLocaleLowerCase();
  return INTENT_KEYWORDS.find(([, keywords]) => (
    keywords.some((keyword) => normalizedMessage.includes(keyword))
  ))?.[0] ?? "fallback";
}

export function createPetReply(context: PetReplyContext): PetReply {
  const intent = classifyIntent(context.message);
  const texts: Readonly<Record<ChatIntent, string>> = {
    food: "我已经闻到香味啦！",
    play: "出发，我们现在就一起玩！",
    sleep: "那就陪我安静地休息一会儿吧。",
    praise: "嘿嘿，被你发现我很可爱啦。",
    mood: "和你待在一起，我现在很开心。",
    scene: `我正在观察${context.scene.displayName}，这里有好多新鲜事。`,
    greeting: "你好！见到你真开心！",
    fallback: "这个问题好有趣，可以再多告诉我一点吗？",
  };

  return {
    intent,
    mood: STATE_MOODS[context.state] ?? INTENT_MOODS[intent],
    text: `${context.pet.displayName}：${PET_VOICE_OPENERS[context.pet.id]}${STATE_CONTEXT[context.state] ?? ""}${texts[intent]}`,
  };
}
