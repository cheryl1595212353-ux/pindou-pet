export type AnimationState =
  | { readonly kind: "IDLE" }
  | { readonly kind: "JUMPING"; readonly startedAtMs: number };

export interface CatMotion {
  readonly nextState: AnimationState;
  readonly rootY: number;
  readonly breathScaleY: number;
  readonly blinkClosed: boolean;
  readonly tailAngles: readonly [number, number, number];
  readonly heartVisible: boolean;
  readonly heartProgress: number;
}

export const idleState = (): AnimationState => ({ kind: "IDLE" });

export function startJump(state: AnimationState, nowMs: number): AnimationState {
  return state.kind === "JUMPING" ? state : { kind: "JUMPING", startedAtMs: nowMs };
}

export function sampleCatMotion(
  state: AnimationState,
  nowMs: number,
  reducedMotion: boolean,
): CatMotion {
  const elapsed = state.kind === "JUMPING" ? Math.max(0, nowMs - state.startedAtMs) : 0;
  const progress = Math.min(1, elapsed / 650);
  const nextState = state.kind === "JUMPING" && progress >= 1 ? idleState() : state;
  const heartVisible = state.kind === "JUMPING" && progress < 1;

  if (reducedMotion) {
    return {
      nextState,
      rootY: 0,
      breathScaleY: 1,
      blinkClosed: false,
      tailAngles: [0, 0, 0],
      heartVisible,
      heartProgress: progress,
    };
  }

  const blinkPhase = nowMs % 4_500;
  return {
    nextState,
    rootY: state.kind === "JUMPING" ? Math.sin(Math.PI * progress) * 0.9 : 0,
    breathScaleY: 1 + Math.sin(nowMs / 900) * 0.015,
    blinkClosed: blinkPhase >= 4_380,
    tailAngles: [
      Math.sin(nowMs / 700) * 0.28,
      Math.sin(nowMs / 700 + 0.45) * 0.22,
      Math.sin(nowMs / 700 + 0.9) * 0.16,
    ],
    heartVisible,
    heartProgress: progress,
  };
}
