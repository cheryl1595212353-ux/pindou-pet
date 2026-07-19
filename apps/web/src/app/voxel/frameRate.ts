export const FPS_WARMUP_MS = 2_000;
export const FPS_WINDOW_MS = 5_000;
export const LOW_FPS_THRESHOLD = 30;

export interface FrameRateAccumulator {
  readonly totalElapsedMs: number;
  readonly windowElapsedMs: number;
  readonly frames: number;
}

export function createFrameRateAccumulator(): FrameRateAccumulator {
  return {
    totalElapsedMs: 0,
    windowElapsedMs: 0,
    frames: 0,
  };
}

export function advanceFrameRate(
  state: FrameRateAccumulator,
  deltaMs: number,
): {
  readonly state: FrameRateAccumulator;
  readonly averageFps: number | null;
} {
  const totalElapsedMs = state.totalElapsedMs + deltaMs;
  if (totalElapsedMs <= FPS_WARMUP_MS) {
    return {
      state: { totalElapsedMs, windowElapsedMs: 0, frames: 0 },
      averageFps: null,
    };
  }

  const windowElapsedMs = state.windowElapsedMs + deltaMs;
  const frames = state.frames + 1;
  if (windowElapsedMs < FPS_WINDOW_MS) {
    return {
      state: { totalElapsedMs, windowElapsedMs, frames },
      averageFps: null,
    };
  }

  return {
    state: { totalElapsedMs, windowElapsedMs: 0, frames: 0 },
    averageFps: frames / (windowElapsedMs / 1_000),
  };
}
