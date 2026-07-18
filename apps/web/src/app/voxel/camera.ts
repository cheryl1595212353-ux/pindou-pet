export type CameraPreset = "front" | "side" | "top";

export interface CameraTarget {
  readonly position: readonly [number, number, number];
  readonly lookAt: readonly [number, number, number];
  readonly durationMs: 350;
}

export const CAMERA_PRESETS: Readonly<Record<CameraPreset, CameraTarget>> = {
  front: { position: [-9.5, 4, 0], lookAt: [0, 2.2, 0], durationMs: 350 },
  side: { position: [0, 4, 9.5], lookAt: [0, 2.2, 0], durationMs: 350 },
  top: { position: [0, 11.5, 0.01], lookAt: [0, 2, 0], durationMs: 350 },
};
