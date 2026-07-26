export type PetId = "doubao" | "jinbao" | "xuetuan" | "keke" | "jutuan";

export interface PetProfile {
  readonly id: PetId;
  readonly displayName: string;
  readonly breed: string;
  readonly description: string;
  readonly basePath: string;
  readonly spritesheetPath: string;
}

function createPet(
  id: PetId,
  displayName: string,
  breed: string,
  description: string,
): PetProfile {
  return {
    id,
    displayName,
    breed,
    description,
    basePath: `/pixel-dog/${id}/base.png`,
    spritesheetPath: `/pixel-dog/${id}/spritesheet.webp`,
  };
}

export const PETS: readonly PetProfile[] = [
  createPet("doubao", "豆包", "红柴犬", "活泼的红柴犬伙伴。"),
  createPet("jinbao", "金宝", "金毛", "友善的金毛伙伴。"),
  createPet("xuetuan", "雪团", "比熊", "蓬松的比熊伙伴。"),
  createPet("keke", "可可", "棕色泰迪", "机灵的棕色泰迪伙伴。"),
  createPet("jutuan", "橘团", "橘色异国短毛猫", "慵懒的橘色异国短毛猫伙伴。"),
];

export const DEFAULT_PET_ID: PetId = "doubao";

export function getPetById(id: PetId): PetProfile {
  return PETS.find((pet) => pet.id === id) ?? PETS[0];
}
