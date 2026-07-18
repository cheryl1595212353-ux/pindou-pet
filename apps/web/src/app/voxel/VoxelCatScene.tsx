import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type ComponentRef } from "react";
import { Vector3 } from "three";

import type { CatAppearance } from "./appearances";
import { CAMERA_PRESETS, type CameraPreset } from "./camera";
import { VoxelCatModel } from "./VoxelCatModel";

interface CameraTransition {
  readonly startedAtMs: number;
  readonly durationMs: number;
  readonly fromPosition: Vector3;
  readonly fromTarget: Vector3;
  readonly toPosition: Vector3;
  readonly toTarget: Vector3;
}

function CameraController({
  preset,
  reducedMotion,
}: {
  readonly preset: CameraPreset;
  readonly reducedMotion: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const sceneNowMs = useRef(0);
  const transition = useRef<CameraTransition | null>(null);

  useEffect(() => {
    const target = CAMERA_PRESETS[preset];
    const toPosition = new Vector3(...target.position);
    const toTarget = new Vector3(...target.lookAt);

    if (reducedMotion || controls.current === null) {
      camera.position.copy(toPosition);
      controls.current?.target.copy(toTarget);
      controls.current?.update();
      transition.current = null;
      return;
    }

    transition.current = {
      startedAtMs: sceneNowMs.current,
      durationMs: target.durationMs,
      fromPosition: camera.position.clone(),
      fromTarget: controls.current.target.clone(),
      toPosition,
      toTarget,
    };
  }, [camera, preset, reducedMotion]);

  useFrame(({ clock }) => {
    const nowMs = clock.elapsedTime * 1_000;
    sceneNowMs.current = nowMs;
    const active = transition.current;
    if (active === null || controls.current === null) return;

    const linearProgress = Math.min(1, (nowMs - active.startedAtMs) / active.durationMs);
    const easedProgress = 1 - (1 - linearProgress) ** 3;
    camera.position.lerpVectors(active.fromPosition, active.toPosition, easedProgress);
    controls.current.target.lerpVectors(active.fromTarget, active.toTarget, easedProgress);
    controls.current.update();

    if (linearProgress >= 1) transition.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan={false}
      minDistance={6}
      maxDistance={14}
      minPolarAngle={0.08}
      maxPolarAngle={Math.PI / 2 - 0.06}
      rotateSpeed={0.72}
      zoomSpeed={0.82}
      target={[0, 2.2, 0]}
      onStart={() => {
        transition.current = null;
      }}
    />
  );
}

export interface VoxelCatSceneProps {
  readonly appearance: CatAppearance;
  readonly cameraPreset: CameraPreset;
  readonly reducedMotion: boolean;
  readonly onHeartChange: (visible: boolean, progress: number) => void;
}

export function VoxelCatScene({
  appearance,
  cameraPreset,
  reducedMotion,
  onHeartChange,
}: VoxelCatSceneProps) {
  return (
    <Canvas
      aria-label="互动式 3D 方块猫"
      role="img"
      shadows
      dpr={[1, 1.5]}
      camera={{ fov: 38, near: 0.1, far: 100, position: [...CAMERA_PRESETS.front.position] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#e8ddcc"]} />
      <ambientLight intensity={1.45} />
      <directionalLight
        castShadow
        intensity={2.4}
        position={[-5, 10, 7]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={28}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
      <hemisphereLight args={["#fff6e8", "#8a7766", 0.8]} />

      <VoxelCatModel
        appearance={appearance}
        reducedMotion={reducedMotion}
        onHeartChange={onHeartChange}
      />

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} userData={{ part: "ground" }}>
        <planeGeometry args={[34, 34]} />
        <meshStandardMaterial color="#cfc2af" roughness={1} />
      </mesh>

      <CameraController preset={cameraPreset} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
