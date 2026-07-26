import { describe, expect, it } from "vitest";

import { SCENES } from "./sceneCatalog";

describe("scene catalog", () => {
  it("lists the six supported scenes with webp backgrounds", () => {
    expect(SCENES.map((scene) => scene.id)).toEqual([
      "living-room", "garden", "beach", "snow-cabin", "camping", "rooftop",
    ]);
    expect(new Set(SCENES.map((scene) => scene.id)).size).toBe(6);
    expect(SCENES.every((scene) => scene.backgroundPath.endsWith(".webp"))).toBe(true);
  });
});
