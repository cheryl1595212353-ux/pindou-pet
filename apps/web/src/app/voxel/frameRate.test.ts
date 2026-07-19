import { describe, expect, it } from "vitest";

import { advanceFrameRate, createFrameRateAccumulator } from "./frameRate";

function runFrames(fps: number, seconds: number): number | null {
  let state = createFrameRateAccumulator();
  let sample: number | null = null;
  const frameMs = 1_000 / fps;

  for (let frame = 0; frame < fps * seconds; frame += 1) {
    const next = advanceFrameRate(state, frameMs);
    state = next.state;
    if (next.averageFps !== null) sample = next.averageFps;
  }

  return sample;
}

describe("frame-rate windows", () => {
  it("waits through two seconds of warmup and a complete five-second window", () => {
    expect(runFrames(60, 6)).toBeNull();
    expect(runFrames(60, 8)).toBeCloseTo(60, 0);
  });

  it("reports both low and recovered windows", () => {
    let state = createFrameRateAccumulator();
    let lowSample: number | null = null;
    let recoveredSample: number | null = null;

    for (let frame = 0; frame < 24 * 8; frame += 1) {
      const next = advanceFrameRate(state, 1_000 / 24);
      state = next.state;
      if (next.averageFps !== null) lowSample = next.averageFps;
    }
    for (let frame = 0; frame < 45 * 10; frame += 1) {
      const next = advanceFrameRate(state, 1_000 / 45);
      state = next.state;
      if (next.averageFps !== null) recoveredSample = next.averageFps;
    }

    expect(lowSample).toBeCloseTo(24, 0);
    expect(recoveredSample).toBeCloseTo(45, 0);
  });
});
