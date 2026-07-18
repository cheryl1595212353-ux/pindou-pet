import { describe, expect, it } from "vitest";

import { CAMERA_PRESETS } from "./camera";

describe("camera presets", () => {
  it("defines front, side and top with the approved duration", () => {
    expect(Object.keys(CAMERA_PRESETS)).toEqual(["front", "side", "top"]);
    expect(CAMERA_PRESETS.front.durationMs).toBe(350);
    expect(CAMERA_PRESETS.front.position[0]).toBeLessThan(0);
    expect(CAMERA_PRESETS.side.position[2]).toBeGreaterThan(0);
    expect(CAMERA_PRESETS.top.position[1]).toBeGreaterThan(8);
  });
});
