import { describe, expect, it } from "vitest";

import { idleState, sampleCatMotion, startJump } from "./animation";

describe("cat animation", () => {
  it("samples deterministic idle motion and blink", () => {
    expect(sampleCatMotion(idleState(), 0, false).blinkClosed).toBe(false);
    expect(sampleCatMotion(idleState(), 4_379, false).blinkClosed).toBe(false);
    expect(sampleCatMotion(idleState(), 4_450, false).blinkClosed).toBe(true);
    expect(sampleCatMotion(idleState(), 4_500, false).blinkClosed).toBe(false);
  });

  it("runs one 650ms jump and refuses stacking", () => {
    const jumping = startJump(idleState(), 100);
    expect(startJump(jumping, 200)).toEqual(jumping);
    expect(sampleCatMotion(jumping, 425, false).rootY).toBeGreaterThan(0);
    expect(sampleCatMotion(jumping, 750, false).nextState.kind).toBe("IDLE");
  });

  it("removes ambient and displacement motion when requested", () => {
    const motion = sampleCatMotion(startJump(idleState(), 0), 200, true);
    expect(motion.rootY).toBe(0);
    expect(motion.breathScaleY).toBe(1);
    expect(motion.tailAngles).toEqual([0, 0, 0]);
    expect(motion.heartVisible).toBe(true);
  });
});
