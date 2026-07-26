export const CELL_WIDTH = 192;
export const CELL_HEIGHT = 208;
export const ATLAS_WIDTH = CELL_WIDTH * 8;
export const ATLAS_HEIGHT = CELL_HEIGHT * 9;
export const SPRITESHEET_PATH = "/pixel-dog/doubao/spritesheet.webp";

export const WAITING_AFTER_MS = 12_000;
export const SLEEPING_AFTER_MS = 30_000;
export const MIN_STAGE_POSITION = 8;
export const MAX_STAGE_POSITION = 92;

export type PixelDogState =
  | "idle"
  | "moving-right"
  | "moving-left"
  | "happy"
  | "jumping"
  | "sleeping"
  | "waiting"
  | "feeding"
  | "petting"
  | "playing-ball"
  | "grooming"
  | "bathing"
  | "dancing"
  | "posing";

export interface DogClip {
  readonly row: number;
  readonly frameCount: number;
  readonly durations: readonly number[];
  readonly loop: boolean;
  readonly status: string;
  /** @deprecated Use the name-free status field for new UI. */
  readonly label: string;
}

type DogClipDefinition = Omit<DogClip, "label">;

function defineClip(clip: DogClipDefinition): DogClip {
  return { ...clip, label: `豆包${clip.status}` };
}

export const DOG_CLIPS: Readonly<Record<PixelDogState, DogClip>> = {
  idle: defineClip({
    row: 0,
    frameCount: 6,
    durations: [280, 110, 110, 140, 140, 320],
    loop: true,
    status: "正在呼吸和眨眼",
  }),
  "moving-right": defineClip({
    row: 1,
    frameCount: 8,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
    loop: true,
    status: "正在向右走",
  }),
  "moving-left": defineClip({
    row: 2,
    frameCount: 8,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
    loop: true,
    status: "正在向左走",
  }),
  happy: defineClip({
    row: 3,
    frameCount: 4,
    durations: [140, 140, 140, 280],
    loop: false,
    status: "很开心",
  }),
  jumping: defineClip({
    row: 4,
    frameCount: 5,
    durations: [140, 140, 140, 140, 280],
    loop: false,
    status: "跳起来了",
  }),
  sleeping: defineClip({
    row: 5,
    frameCount: 8,
    durations: [140, 140, 140, 140, 140, 140, 140, 240],
    loop: true,
    status: "睡着了",
  }),
  waiting: defineClip({
    row: 6,
    frameCount: 6,
    durations: [150, 150, 150, 150, 150, 260],
    loop: true,
    status: "在等你",
  }),
  feeding: defineClip({
    row: 7,
    frameCount: 6,
    durations: [120, 120, 120, 120, 120, 220],
    loop: false,
    status: "正在吃饭",
  }),
  petting: defineClip({
    row: 8,
    frameCount: 6,
    durations: [150, 150, 150, 150, 150, 280],
    loop: true,
    status: "正在享受抚摸",
  }),
  "playing-ball": defineClip({
    row: 4,
    frameCount: 5,
    durations: [140, 140, 140, 140, 280],
    loop: false,
    status: "正在玩球",
  }),
  grooming: defineClip({
    row: 8,
    frameCount: 6,
    durations: [150, 150, 150, 150, 150, 280],
    loop: false,
    status: "正在梳毛",
  }),
  bathing: defineClip({
    row: 6,
    frameCount: 6,
    durations: [150, 150, 150, 150, 150, 260],
    loop: false,
    status: "正在洗澡",
  }),
  dancing: defineClip({
    row: 3,
    frameCount: 4,
    durations: [140, 140, 140, 280],
    loop: false,
    status: "正在跳舞",
  }),
  posing: defineClip({
    row: 3,
    frameCount: 4,
    durations: [140, 140, 140, 280],
    loop: false,
    status: "正在摆姿势拍照",
  }),
};

export type DogEvent =
  | { readonly type: "move"; readonly direction: "left" | "right" }
  | { readonly type: "stop" }
  | { readonly type: "happy" }
  | { readonly type: "jump" }
  | { readonly type: "feed" }
  | { readonly type: "pet-start" }
  | { readonly type: "pet-end" }
  | { readonly type: "wait" }
  | { readonly type: "sleep" }
  | { readonly type: "wake" }
  | { readonly type: "play-ball" }
  | { readonly type: "groom" }
  | { readonly type: "bathe" }
  | { readonly type: "dance" }
  | { readonly type: "pose" }
  | { readonly type: "complete" };

const ONE_SHOT_STATES = new Set<PixelDogState>([
  "happy",
  "jumping",
  "feeding",
  "playing-ball",
  "grooming",
  "bathing",
  "dancing",
  "posing",
]);

export function dogReducer(state: PixelDogState, event: DogEvent): PixelDogState {
  switch (event.type) {
    case "move":
      return event.direction === "left" ? "moving-left" : "moving-right";
    case "stop":
      return state === "moving-left" || state === "moving-right" ? "idle" : state;
    case "happy":
      return "happy";
    case "jump":
      return "jumping";
    case "feed":
      return "feeding";
    case "pet-start":
      return "petting";
    case "pet-end":
      return state === "petting" ? "idle" : state;
    case "wait":
      return state === "idle" ? "waiting" : state;
    case "sleep":
      return state === "idle" || state === "waiting" ? "sleeping" : state;
    case "wake":
      return "idle";
    case "play-ball":
      return "playing-ball";
    case "groom":
      return "grooming";
    case "bathe":
      return "bathing";
    case "dance":
      return "dancing";
    case "pose":
      return "posing";
    case "complete":
      return ONE_SHOT_STATES.has(state) ? "idle" : state;
  }
}

export function clampStagePosition(value: number): number {
  return Math.min(MAX_STAGE_POSITION, Math.max(MIN_STAGE_POSITION, value));
}

export function getPropSide(stagePosition: number): "left" | "right" {
  return stagePosition > 70 ? "left" : "right";
}
