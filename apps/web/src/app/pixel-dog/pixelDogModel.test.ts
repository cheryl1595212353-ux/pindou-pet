import { describe, expect, it } from "vitest";

import petManifest from "../../../public/pixel-dog/doubao/pet.json";
import { PETS } from "./petCatalog";
import { SCENES } from "./sceneCatalog";
import {
  ATLAS_HEIGHT,
  ATLAS_WIDTH,
  CELL_HEIGHT,
  CELL_WIDTH,
  DOG_CLIPS,
  SLEEPING_AFTER_MS,
  WAITING_AFTER_MS,
  MAX_STAGE_POSITION,
  MIN_STAGE_POSITION,
  clampStagePosition,
  dogReducer,
  getPropSide,
} from "./pixelDogModel";

describe("pixel dog model", () => {
  it("locks the requested multi-pet, scene, and interaction scope", () => {
    expect(PETS).toHaveLength(5);
    expect(new Set(PETS.map((pet) => pet.id)).size).toBe(5);
    expect(SCENES).toHaveLength(6);
    expect(new Set(SCENES.map((scene) => scene.id)).size).toBe(6);
    expect(
      ["playing-ball", "grooming", "bathing", "dancing", "posing"]
        .every((state) => state in DOG_CLIPS),
    ).toBe(true);
  });

  it("maps every product state onto the fixed nine-row pet atlas", () => {
    expect(Object.values(DOG_CLIPS).map((clip) => clip.row)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 4, 8, 6, 3, 3,
    ]);
    expect(Object.values(DOG_CLIPS).map((clip) => clip.frameCount)).toEqual([
      6, 8, 8, 4, 5, 8, 6, 6, 6, 5, 6, 6, 4, 4,
    ]);
    expect([CELL_WIDTH, CELL_HEIGHT, ATLAS_WIDTH, ATLAS_HEIGHT]).toEqual([
      192, 208, 1536, 1872,
    ]);
    expect(Object.keys(petManifest.states)).toEqual(Object.keys(DOG_CLIPS).slice(0, 9));
    expect(Object.values(petManifest.states).map((clip) => clip.row)).toEqual(
      Object.values(DOG_CLIPS).slice(0, 9).map((clip) => clip.row),
    );
  });

  it("keeps the approved waiting and sleeping thresholds distinct", () => {
    expect(WAITING_AFTER_MS).toBe(12_000);
    expect(SLEEPING_AFTER_MS).toBe(30_000);
    expect(SLEEPING_AFTER_MS).toBeGreaterThan(WAITING_AFTER_MS);
  });

  it("moves, stops, and completes one-shot interactions", () => {
    expect(dogReducer("idle", { type: "move", direction: "left" })).toBe("moving-left");
    expect(dogReducer("moving-left", { type: "stop" })).toBe("idle");
    expect(dogReducer("idle", { type: "happy" })).toBe("happy");
    expect(dogReducer("happy", { type: "complete" })).toBe("idle");
    expect(dogReducer("idle", { type: "jump" })).toBe("jumping");
    expect(dogReducer("jumping", { type: "complete" })).toBe("idle");
    expect(dogReducer("idle", { type: "feed" })).toBe("feeding");
    expect(dogReducer("feeding", { type: "complete" })).toBe("idle");

    expect(dogReducer("idle", { type: "play-ball" })).toBe("playing-ball");
    expect(dogReducer("idle", { type: "groom" })).toBe("grooming");
    expect(dogReducer("idle", { type: "bathe" })).toBe("bathing");
    expect(dogReducer("idle", { type: "dance" })).toBe("dancing");
    expect(dogReducer("idle", { type: "pose" })).toBe("posing");

    for (const state of [
      "playing-ball", "grooming", "bathing", "dancing", "posing",
    ] as const) {
      expect(dogReducer(state, { type: "complete" })).toBe("idle");
    }
  });

  it("maps new interactions onto their required atlas rows", () => {
    expect(DOG_CLIPS["playing-ball"].row).toBe(4);
    expect(DOG_CLIPS.grooming.row).toBe(8);
    expect(DOG_CLIPS.bathing.row).toBe(6);
    expect(DOG_CLIPS.dancing.row).toBe(3);
    expect(DOG_CLIPS.posing.row).toBe(3);
  });

  it("keeps name-free statuses without the retired label field", () => {
    for (const clip of Object.values(DOG_CLIPS)) {
      for (const pet of PETS) {
        expect(clip.status).not.toContain(pet.displayName);
      }
      expect(Object.hasOwn(clip, "label")).toBe(false);
    }
  });

  it("supports petting, inactivity, sleep, and wake-up", () => {
    expect(dogReducer("idle", { type: "pet-start" })).toBe("petting");
    expect(dogReducer("petting", { type: "pet-end" })).toBe("idle");
    expect(dogReducer("idle", { type: "wait" })).toBe("waiting");
    expect(dogReducer("waiting", { type: "sleep" })).toBe("sleeping");
    expect(dogReducer("sleeping", { type: "wake" })).toBe("idle");
  });

  it("does not interrupt an active interaction with an inactivity event", () => {
    expect(dogReducer("moving-right", { type: "wait" })).toBe("moving-right");
    expect(dogReducer("petting", { type: "sleep" })).toBe("petting");
    expect(dogReducer("jumping", { type: "sleep" })).toBe("jumping");
  });

  it("clamps horizontal movement inside the playroom", () => {
    expect(clampStagePosition(-100)).toBe(8);
    expect(clampStagePosition(50)).toBe(50);
    expect(clampStagePosition(200)).toBe(92);
  });

  it("places props on the side opposite the pet at each stage boundary", () => {
    expect(getPropSide(MIN_STAGE_POSITION)).toBe("right");
    expect(getPropSide(MAX_STAGE_POSITION)).toBe("left");
  });
});
