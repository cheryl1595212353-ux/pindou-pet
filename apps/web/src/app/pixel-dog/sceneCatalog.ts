export type SceneId =
  | "living-room"
  | "garden"
  | "beach"
  | "snow-cabin"
  | "camping"
  | "rooftop";

export interface SceneProfile {
  readonly id: SceneId;
  readonly displayName: string;
  readonly description: string;
  readonly backgroundPath: string;
}

function createScene(
  id: SceneId,
  displayName: string,
  description: string,
): SceneProfile {
  return {
    id,
    displayName,
    description,
    backgroundPath: `/pixel-dog/scenes/${id}.webp`,
  };
}

export const SCENES: readonly SceneProfile[] = [
  createScene("living-room", "客厅", "温暖舒适的室内空间。"),
  createScene("garden", "花园", "阳光明媚的花园。"),
  createScene("beach", "海滩", "轻松惬意的海边。"),
  createScene("snow-cabin", "雪地小屋", "雪景环绕的温暖小屋。"),
  createScene("camping", "星光露营", "星空下的露营地。"),
  createScene("rooftop", "屋顶", "俯瞰城市的屋顶空间。"),
];

export const DEFAULT_SCENE_ID: SceneId = "living-room";

export function getSceneById(id: SceneId): SceneProfile {
  return SCENES.find((scene) => scene.id === id) ?? SCENES[0];
}
