export type PetId = "doubao" | "jinbao" | "xuetuan" | "keke" | "jutuan";

export interface PetInteractionAnchors {
  readonly bowl: {
    readonly x: number;
    readonly y: number;
  };
  readonly ball: {
    readonly x: number;
    readonly y: number;
  };
  readonly shadowWidth: number;
}

export interface PetProfile {
  readonly id: PetId;
  readonly displayName: string;
  readonly breed: string;
  readonly description: string;
  readonly basePath: string;
  readonly spritesheetPath: string;
  readonly interactionAnchors: PetInteractionAnchors;
}

function createPet(
  id: PetId,
  displayName: string,
  breed: string,
  description: string,
  interactionAnchors: PetInteractionAnchors,
): PetProfile {
  return {
    id,
    displayName,
    breed,
    description,
    basePath: `/pixel-dog/${id}/base.png`,
    spritesheetPath: `/pixel-dog/${id}/spritesheet.webp`,
    interactionAnchors,
  };
}

export const PETS: readonly PetProfile[] = [
  createPet(
    "doubao",
    "豆包",
    "红柴犬",
    "活泼的红柴犬伙伴。",
    { bowl: { x: 78, y: 168 }, ball: { x: 170, y: 92 }, shadowWidth: 148 },
  ),
  createPet(
    "jinbao",
    "金宝",
    "金毛",
    "友善的金毛伙伴。",
    { bowl: { x: 80, y: 168 }, ball: { x: 172, y: 94 }, shadowWidth: 164 },
  ),
  createPet(
    "xuetuan",
    "雪团",
    "比熊",
    "蓬松的比熊伙伴。",
    { bowl: { x: 88, y: 168 }, ball: { x: 168, y: 90 }, shadowWidth: 132 },
  ),
  createPet(
    "keke",
    "可可",
    "棕色泰迪",
    "机灵的棕色泰迪伙伴。",
    { bowl: { x: 86, y: 168 }, ball: { x: 168, y: 92 }, shadowWidth: 138 },
  ),
  createPet(
    "jutuan",
    "橘团",
    "橘色异国短毛猫",
    "慵懒的橘色异国短毛猫伙伴。",
    { bowl: { x: 82, y: 170 }, ball: { x: 170, y: 96 }, shadowWidth: 152 },
  ),
];

export const DEFAULT_PET_ID: PetId = "doubao";

export function getPetById(id: PetId): PetProfile {
  return PETS.find((pet) => pet.id === id) ?? PETS[0];
}
