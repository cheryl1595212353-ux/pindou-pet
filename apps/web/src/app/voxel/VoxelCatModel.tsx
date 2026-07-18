import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group, Mesh, Texture } from "three";

import type { CatAppearance } from "./appearances";
import { idleState, sampleCatMotion, startJump, type AnimationState } from "./animation";
import { createPixelTexture } from "./texture";

type Vec3 = [number, number, number];

const PARTS = {
  body: { size: [3.8, 2.1, 2.0] as Vec3, position: [0, 2.45, 0] as Vec3 },
  head: { size: [2.1, 2.0, 2.0] as Vec3, position: [-2.55, 3.15, 0] as Vec3 },
  muzzle: { size: [0.55, 0.65, 1.15] as Vec3, position: [-3.7, 2.88, 0] as Vec3 },
  ears: { size: [0.62, 0.72, 0.62] as Vec3 },
  legs: { size: [0.72, 1.9, 0.72] as Vec3 },
  tail: { size: [1.45, 0.42, 0.42] as Vec3 },
} as const;

interface BlockProps {
  readonly part: string;
  readonly position: Vec3;
  readonly size: Vec3;
  readonly texture?: Texture;
  readonly color?: string;
  readonly rotation?: Vec3;
}

function Block({ part, position, size, texture, color = "#ffffff", rotation }: BlockProps) {
  return (
    <mesh
      castShadow
      receiveShadow
      position={position}
      rotation={rotation}
      userData={{ part }}
    >
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} map={texture} roughness={0.86} />
    </mesh>
  );
}

export interface VoxelCatModelProps {
  readonly appearance: CatAppearance;
  readonly reducedMotion: boolean;
  readonly onHeartChange: (visible: boolean, progress: number) => void;
}

export function VoxelCatModel({
  appearance,
  reducedMotion,
  onHeartChange,
}: VoxelCatModelProps) {
  const root = useRef<Group>(null);
  const bodyPivot = useRef<Group>(null);
  const leftEye = useRef<Mesh>(null);
  const rightEye = useRef<Mesh>(null);
  const leftBlink = useRef<Mesh>(null);
  const rightBlink = useRef<Mesh>(null);
  const tailOne = useRef<Group>(null);
  const tailTwo = useRef<Group>(null);
  const tailThree = useRef<Group>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const animationState = useRef<AnimationState>(idleState());
  const lastHeartVisible = useRef(false);
  const sceneNowMs = useRef(0);

  const textures = useMemo(
    () => ({
      body: createPixelTexture(appearance.patterns.body, appearance.palette),
      face: createPixelTexture(appearance.patterns.face, appearance.palette),
      legs: createPixelTexture(appearance.patterns.legs, appearance.palette),
      tail: createPixelTexture(appearance.patterns.tail, appearance.palette),
    }),
    [appearance],
  );

  useEffect(
    () => () => {
      Object.values(textures).forEach((texture) => texture.dispose());
    },
    [textures],
  );

  useFrame(({ clock }) => {
    const nowMs = clock.elapsedTime * 1_000;
    sceneNowMs.current = nowMs;
    const motion = sampleCatMotion(animationState.current, nowMs, reducedMotion);
    animationState.current = motion.nextState;

    if (root.current !== null) root.current.position.y = motion.rootY;
    if (bodyPivot.current !== null) bodyPivot.current.scale.y = motion.breathScaleY;
    if (leftEye.current !== null) leftEye.current.visible = !motion.blinkClosed;
    if (rightEye.current !== null) rightEye.current.visible = !motion.blinkClosed;
    if (leftBlink.current !== null) leftBlink.current.visible = motion.blinkClosed;
    if (rightBlink.current !== null) rightBlink.current.visible = motion.blinkClosed;
    if (tailOne.current !== null) tailOne.current.rotation.z = motion.tailAngles[0];
    if (tailTwo.current !== null) tailTwo.current.rotation.z = motion.tailAngles[1];
    if (tailThree.current !== null) tailThree.current.rotation.z = motion.tailAngles[2];

    if (lastHeartVisible.current !== motion.heartVisible) {
      lastHeartVisible.current = motion.heartVisible;
      onHeartChange(motion.heartVisible, motion.heartProgress);
    }
  });

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    pointerStart.current = {
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
    };
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (start === null) return;

    const distance = Math.hypot(
      event.nativeEvent.clientX - start.x,
      event.nativeEvent.clientY - start.y,
    );
    if (distance > 5 || animationState.current.kind === "JUMPING") return;

    event.stopPropagation();
    animationState.current = startJump(animationState.current, sceneNowMs.current);
    lastHeartVisible.current = true;
    onHeartChange(true, 0);
  };

  return (
    <group
      ref={root}
      userData={{ part: "cat-root" }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        pointerStart.current = null;
      }}
    >
      <group ref={bodyPivot} userData={{ part: "body-pivot" }}>
        <Block {...PARTS.body} part="body" texture={textures.body} />
        <Block {...PARTS.head} part="head" texture={textures.face} />
        <Block {...PARTS.muzzle} part="muzzle" color={appearance.palette.light} />
        <Block
          part="left-ear"
          position={[-2.55, 4.48, -0.62]}
          size={PARTS.ears.size}
          texture={textures.face}
          rotation={[0, 0, -0.08]}
        />
        <Block
          part="right-ear"
          position={[-2.55, 4.48, 0.62]}
          size={PARTS.ears.size}
          texture={textures.face}
          rotation={[0, 0, 0.08]}
        />

        {([-1.25, 1.25] as const).flatMap((x, xIndex) =>
          ([-0.62, 0.62] as const).map((z, zIndex) => (
            <Block
              key={`${x}-${z}`}
              part={`${xIndex === 0 ? "front" : "rear"}-${zIndex === 0 ? "left" : "right"}-leg`}
              position={[x, 1.05, z]}
              size={PARTS.legs.size}
              texture={textures.legs}
            />
          )),
        )}

        <mesh ref={leftEye} castShadow position={[-3.62, 3.43, -0.47]} userData={{ part: "left-eye" }}>
          <boxGeometry args={[0.1, 0.34, 0.34]} />
          <meshStandardMaterial color={appearance.palette.eye} roughness={0.7} />
        </mesh>
        <mesh ref={rightEye} castShadow position={[-3.62, 3.43, 0.47]} userData={{ part: "right-eye" }}>
          <boxGeometry args={[0.1, 0.34, 0.34]} />
          <meshStandardMaterial color={appearance.palette.eye} roughness={0.7} />
        </mesh>
        <mesh ref={leftBlink} visible={false} position={[-3.68, 3.43, -0.47]} userData={{ part: "left-blink" }}>
          <boxGeometry args={[0.1, 0.06, 0.38]} />
          <meshStandardMaterial color={appearance.palette.dark} />
        </mesh>
        <mesh ref={rightBlink} visible={false} position={[-3.68, 3.43, 0.47]} userData={{ part: "right-blink" }}>
          <boxGeometry args={[0.1, 0.06, 0.38]} />
          <meshStandardMaterial color={appearance.palette.dark} />
        </mesh>
        <Block part="nose" position={[-4.0, 2.98, 0]} size={[0.1, 0.23, 0.3]} color={appearance.palette.nose} />

        <group ref={tailOne} position={[1.9, 2.65, 0]} userData={{ part: "tail-1-pivot" }}>
          <Block part="tail-1" position={[0.72, 0, 0]} size={PARTS.tail.size} texture={textures.tail} />
          <group ref={tailTwo} position={[1.43, 0, 0]} userData={{ part: "tail-2-pivot" }}>
            <Block part="tail-2" position={[0.72, 0, 0]} size={PARTS.tail.size} texture={textures.tail} />
            <group ref={tailThree} position={[1.43, 0, 0]} userData={{ part: "tail-3-pivot" }}>
              <Block part="tail-3" position={[0.72, 0, 0]} size={PARTS.tail.size} texture={textures.tail} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
