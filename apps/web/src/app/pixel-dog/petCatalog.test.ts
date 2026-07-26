import { describe, expect, it } from "vitest";

import { PETS } from "./petCatalog";

describe("pet catalog", () => {
  it("lists the five supported pets with spritesheets", () => {
    expect(PETS.map((pet) => pet.id)).toEqual([
      "doubao", "jinbao", "xuetuan", "keke", "jutuan",
    ]);
    expect(new Set(PETS.map((pet) => pet.id)).size).toBe(5);
    expect(PETS.every((pet) => pet.spritesheetPath.endsWith("/spritesheet.webp"))).toBe(true);
  });
});
