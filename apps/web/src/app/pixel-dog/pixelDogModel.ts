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
  | "petting";

export interface DogClip {
  readonly row: number;
  readonly frameCount: number;
  readonly durations: readonly number[];
  readonly loop: boolean;
  readonly label: string;
}

export const DOG_CLIPS: Readonly<Record<PixelDogState, DogClip>> = {
  idle: {
    row: 0,
    frameCount: 6,
    durations: [280, 110, 110, 140, 140, 320],
    loop: true,
    label: "豆包正在呼吸和眨眼",
  },
  "moving-right": {
    row: 1,
    frameCount: 8,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
    loop: true,
    label: "豆包正在向右走",
  },
  "moving-left": {
    row: 2,
    frameCount: 8,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
    loop: true,
    label: "豆包正在向左走",
  },
  happy: {
    row: 3,
    frameCount: 4,
    durations: [140, 140, 140, 280],
    loop: false,
    label: "豆包很开心",
  },
  jumping: {
    row: 4,
    frameCount: 5,
    durations: [140, 140, 140, 140, 280],
    loop: false,
    label: "豆包跳起来了",
  },
  sleeping: {
    row: 5,
    frameCount: 8,
    durations: [140, 140, 140, 140, 140, 140, 140, 240],
    loop: true,
    label: "豆包睡着了",
  },
  waiting: {
    row: 6,
    frameCount: 6,
    durations: [150, 150, 150, 150, 150, 260],
    loop: true,
    label: "豆包在等你",
  },
  feeding: {
    row: 7,
    frameCount: 6,
    durations: [120, 120, 120, 120, 120, 220],
    loop: false,
    label: "豆包正在吃饭",
  },
  petting: {
    row: 8,
    frameCount: 6,
    durations: [150, 150, 150, 150, 150, 280],
    loop: true,
    label: "豆包正在享受抚摸",
  },
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
  | { readonly type: "complete" };

const ONE_SHOT_STATES = new Set<PixelDogState>(["happy", "jumping", "feeding"]);

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
    case "complete":
      return ONE_SHOT_STATES.has(state) ? "idle" : state;
  }
}

export function clampStagePosition(value: number): number {
  return Math.min(MAX_STAGE_POSITION, Math.max(MIN_STAGE_POSITION, value));
}
