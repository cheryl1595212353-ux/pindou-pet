export const CELL_WIDTH = 192;
export const CELL_HEIGHT = 208;
export const ATLAS_WIDTH = CELL_WIDTH * 8;
export const ATLAS_HEIGHT = CELL_HEIGHT * 9;

export const WAITING_AFTER_MS = 12_000;
export const SLEEPING_AFTER_MS = 30_000;
export const MIN_STAGE_POSITION = 8;
export const MAX_STAGE_POSITION = 92;
export const MIN_STAGE_DEPTH = 20;
export const MAX_STAGE_DEPTH = 80;

export interface StagePosition {
  readonly x: number;
  readonly y: number;
}

export type MoveDirection = "left" | "right" | "forward" | "backward";

export type PixelDogState =
  | "idle"
  | "moving-right"
  | "moving-left"
  | "moving-forward"
  | "moving-backward"
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
  /**
   * Frame index a looping clip rewinds to after the final frame. Clips whose
   * opening frames are a one-time settle-in (e.g. lying down before sleep)
   * use this to keep looping only the settled breathing frames.
   */
  readonly loopStart?: number;
  readonly status: string;
}

export const DOG_CLIPS: Readonly<Record<PixelDogState, DogClip>> = {
  idle: {
    row: 0,
    frameCount: 6,
    durations: [280, 110, 110, 140, 140, 320],
    loop: true,
    status: "正在呼吸和眨眼",
  },
  "moving-right": {
    row: 1,
    frameCount: 8,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
    loop: true,
    status: "正在向右走",
  },
  "moving-left": {
    row: 2,
    frameCount: 8,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
    loop: true,
    status: "正在向左走",
  },
  happy: {
    row: 3,
    frameCount: 4,
    durations: [203, 203, 203, 406],
    loop: false,
    status: "很开心",
  },
  jumping: {
    row: 4,
    frameCount: 5,
    durations: [203, 203, 203, 203, 406],
    loop: false,
    status: "跳起来了",
  },
  sleeping: {
    row: 5,
    frameCount: 8,
    durations: [150, 150, 170, 190, 240, 300, 860, 940],
    loop: true,
    // Frames 0-5 are the one-time lie-down; frames 6-7 are the settled
    // breathing loop, so an asleep pet never replays the lie-down.
    loopStart: 6,
    status: "睡着了",
  },
  waiting: {
    row: 6,
    frameCount: 6,
    durations: [150, 150, 150, 150, 150, 260],
    loop: true,
    status: "在等你",
  },
  feeding: {
    row: 7,
    frameCount: 6,
    durations: [174, 174, 174, 174, 174, 319],
    loop: false,
    status: "正在吃饭",
  },
  petting: {
    row: 8,
    frameCount: 6,
    durations: [150, 150, 150, 150, 150, 280],
    loop: true,
    status: "正在享受抚摸",
  },
  "playing-ball": {
    row: 4,
    frameCount: 5,
    durations: [203, 203, 203, 203, 406],
    loop: false,
    status: "正在玩球",
  },
  grooming: {
    row: 8,
    frameCount: 6,
    durations: [218, 218, 218, 218, 218, 406],
    loop: false,
    status: "正在梳毛",
  },
  bathing: {
    row: 6,
    frameCount: 6,
    durations: [218, 218, 218, 218, 218, 377],
    loop: false,
    status: "正在洗澡",
  },
  dancing: {
    row: 3,
    frameCount: 4,
    durations: [203, 203, 203, 406],
    loop: false,
    status: "正在跳舞",
  },
  posing: {
    row: 3,
    frameCount: 4,
    durations: [203, 203, 203, 406],
    loop: false,
    status: "正在摆姿势拍照",
  },
  "moving-forward": {
    // The nine-row atlas has no dedicated front-view walk frames, so reuse
    // the right-facing run: depth moves animate legs instead of gliding.
    row: 1,
    frameCount: 8,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
    loop: true,
    status: "正在向前走",
  },
  "moving-backward": {
    // Same trade-off, mirrored: reuse the left-facing run.
    row: 2,
    frameCount: 8,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
    loop: true,
    status: "正在向后走",
  },
};

export type DogEvent =
  | { readonly type: "move"; readonly direction: MoveDirection }
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

const MOVING_STATES = new Set<PixelDogState>([
  "moving-left",
  "moving-right",
  "moving-forward",
  "moving-backward",
]);

export function dogReducer(state: PixelDogState, event: DogEvent): PixelDogState {
  switch (event.type) {
    case "move":
      return `moving-${event.direction}` as PixelDogState;
    case "stop":
      return MOVING_STATES.has(state) ? "idle" : state;
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

export function clampStagePosition(position: StagePosition): StagePosition {
  return {
    x: Math.min(
      MAX_STAGE_POSITION,
      Math.max(MIN_STAGE_POSITION, position.x),
    ),
    y: Math.min(MAX_STAGE_DEPTH, Math.max(MIN_STAGE_DEPTH, position.y)),
  };
}

export function getDepthScale(stageDepth: number): number {
  const clampedDepth = Math.min(
    MAX_STAGE_DEPTH,
    Math.max(MIN_STAGE_DEPTH, stageDepth),
  );
  const progress = (clampedDepth - MIN_STAGE_DEPTH)
    / (MAX_STAGE_DEPTH - MIN_STAGE_DEPTH);
  return 0.9 + progress * 0.18;
}

export function getPropSide(stagePosition: number): "left" | "right" {
  return stagePosition < 30 ? "right" : "left";
}
