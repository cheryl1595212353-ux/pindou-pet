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
      expect(pet.interactionAnchors.shadowSleepLift).toBeGreaterThanOrEqual(16);
      expect(pet.interactionAnchors.shadowSleepLift).toBeLessThanOrEqual(48);
    }
  });

  it("gives every pet a complete, distinct persona for grounded chat", () => {
    const catchphrases = new Set<string>();
    for (const pet of PETS) {
      const { persona } = pet;
      expect(persona.ageLabel).not.toBe("");
      expect(persona.birthday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(persona.gender).not.toBe("");
      expect(persona.weightKg).toBeGreaterThan(0);
      expect(persona.bodyLengthCm).toBeGreaterThan(0);
      expect(persona.personality).not.toBe("");
      expect(persona.catchphrase).not.toBe("");
      expect(persona.favoriteFood).not.toBe("");
      expect(persona.favoriteToy).not.toBe("");
      expect(persona.dislikes).not.toBe("");
      expect(persona.backstory).not.toBe("");
      expect(persona.speakingStyle).not.toBe("");
      expect(persona.bonds).not.toBe("");
      catchphrases.add(persona.catchphrase);
    }
    expect(catchphrases.size).toBe(PETS.length);
  });
});
