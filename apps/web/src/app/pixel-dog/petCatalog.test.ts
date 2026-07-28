import { describe, expect, it } from "vitest";

import { PETS } from "./petCatalog";

describe("pet catalog", () => {
  it("lists the five supported pets with spritesheets", () => {
    expect(PETS.map((pet) => pet.id)).toEqual([
      "doubao", "jinbao", "xuetuan", "keke", "jutuan",
    ]);
    expect(new Set(PETS.map((pet) => pet.id)).size).toBe(5);
    expect(PETS.every((pet) => pet.spritesheetPath.endsWith("/spritesheet.webp"))).toBe(true);
    for (const pet of PETS) {
      expect(pet.interactionAnchors.bowl.x).toBeGreaterThan(0);
      expect(pet.interactionAnchors.bowl.x).toBeLessThan(192);
      expect(pet.interactionAnchors.bowl.y).toBeGreaterThan(0);
      expect(pet.interactionAnchors.bowl.y).toBeLessThan(208);
      expect(pet.interactionAnchors.ball.x).toBeGreaterThan(0);
      expect(pet.interactionAnchors.ball.x).toBeLessThan(192);
      expect(pet.interactionAnchors.ball.y).toBeGreaterThan(0);
      expect(pet.interactionAnchors.ball.y).toBeLessThan(208);
      expect(pet.interactionAnchors.shadowWidth).toBeGreaterThanOrEqual(112);
      expect(pet.interactionAnchors.shadowWidth).toBeLessThanOrEqual(168);
    }
  });
});
