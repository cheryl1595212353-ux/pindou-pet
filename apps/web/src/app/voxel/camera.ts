export type CameraPreset = "front" | "side" | "top";

export interface CameraTarget {
  readonly position: readonly [number, number, number];
  readonly lookAt: readonly [number, number, number];
  readonly durationMs: 350;
}

export const CAMERA_PRESETS: Readonly<Record<CameraPreset, CameraTarget>> = {
  front: { position: [-12.5, 4.2, 0], lookAt: [0.8, 2.2, 0], durationMs: 350 },
  side: { position: [0, 4.2, 12.5], lookAt: [0.8, 2.2, 0], durationMs: 350 },
  top: { position: [0.8, 17, 0.01], lookAt: [0.8, 2, 0], durationMs: 350 },
};
