import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from "three";

import type { CatAppearance } from "./appearances";
import {
  HIGH_DENSITY_VOXEL_MODEL,
  VOXEL_CUBE_SIZE,
  resolveVoxelPaletteKey,
  type VoxelCell,
} from "./highDensityGeometry";

export interface AnimatedVoxelRefs {
  readonly leftEye: RefObject<Mesh | null>;
  readonly rightEye: RefObject<Mesh | null>;
  readonly leftBlink: RefObject<Mesh | null>;
  readonly rightBlink: RefObject<Mesh | null>;
  readonly tailOne: RefObject<Group | null>;
  readonly tailTwo: RefObject<Group | null>;
  readonly tailThree: RefObject<Group | null>;
}

export interface VoxelInstanceDescriptor {
  readonly position: VoxelCell["position"];
  readonly color: string;
}

export function createVoxelInstanceDescriptors(
  cells: readonly VoxelCell[],
  appearance: CatAppearance,
): readonly VoxelInstanceDescriptor[] {
  return cells.map((cell) => ({
    position: cell.position,
    color: appearance.palette[resolveVoxelPaletteKey(cell, appearance)],
  }));
}

interface VoxelInstancesProps {
  readonly appearance: CatAppearance;
  readonly cells: readonly VoxelCell[];
  readonly geometry: BoxGeometry;
  readonly material: MeshStandardMaterial;
  readonly part: string;
}

function VoxelInstances({
  appearance,
  cells,
  geometry,
  material,
  part,
}: VoxelInstancesProps) {
  const mesh = useRef<InstancedMesh>(null);
  const instances = useMemo(
    () => createVoxelInstanceDescriptors(cells, appearance),
    [appearance, cells],
  );

  useLayoutEffect(() => {
    const current = mesh.current;
    if (current === null) return;

    const transform = new Object3D();
    instances.forEach((instance, index) => {
      transform.position.set(...instance.position);
      transform.updateMatrix();
      current.setMatrixAt(index, transform.matrix);
      current.setColorAt(index, new Color(instance.color));
    });
    current.instanceMatrix.needsUpdate = true;
    if (current.instanceColor !== null) current.instanceColor.needsUpdate = true;
    current.computeBoundingBox();
    current.computeBoundingSphere();
  }, [instances]);

  return (
    <instancedMesh
      args={[geometry, material, cells.length]}
      castShadow
      dispose={null}
      receiveShadow
      ref={mesh}
      userData={{ part }}
    />
  );
}

export interface HighDensityVoxelBodyProps extends AnimatedVoxelRefs {
  readonly appearance: CatAppearance;
}

export function HighDensityVoxelBody({
  appearance,
  leftEye,
  rightEye,
  leftBlink,
  rightBlink,
  tailOne,
  tailTwo,
  tailThree,
}: HighDensityVoxelBodyProps) {
  const geometry = useMemo(
    () =>
      new BoxGeometry(VOXEL_CUBE_SIZE, VOXEL_CUBE_SIZE, VOXEL_CUBE_SIZE),
    [],
  );
  const material = useMemo(
    () => new MeshStandardMaterial({ roughness: 0.86, vertexColors: true }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const tail = HIGH_DENSITY_VOXEL_MODEL.tailSegment;

  return (
    <>
      <VoxelInstances
        appearance={appearance}
        cells={HIGH_DENSITY_VOXEL_MODEL.main}
        geometry={geometry}
        material={material}
        part="detailed-main"
      />

      <mesh ref={leftEye} castShadow position={[-3.75, 3.48, -0.5]}>
        <boxGeometry args={[0.08, 0.5, 0.42]} />
        <meshStandardMaterial color={appearance.palette.eye} roughness={0.7} />
      </mesh>
      <mesh ref={rightEye} castShadow position={[-3.75, 3.48, 0.5]}>
        <boxGeometry args={[0.08, 0.5, 0.42]} />
        <meshStandardMaterial color={appearance.palette.eye} roughness={0.7} />
      </mesh>
      <mesh
        ref={leftBlink}
        visible={false}
        position={[-3.79, 3.48, -0.5]}
      >
        <boxGeometry args={[0.08, 0.08, 0.46]} />
        <meshStandardMaterial color={appearance.palette.dark} />
      </mesh>
      <mesh
        ref={rightBlink}
        visible={false}
        position={[-3.79, 3.48, 0.5]}
      >
        <boxGeometry args={[0.08, 0.08, 0.46]} />
        <meshStandardMaterial color={appearance.palette.dark} />
      </mesh>
      <mesh castShadow position={[-4.15, 3, 0]}>
        <boxGeometry args={[0.08, 0.3, 0.4]} />
        <meshStandardMaterial color={appearance.palette.nose} roughness={0.7} />
      </mesh>

      <group ref={tailOne} position={[1.9, 2.65, 0]}>
        <VoxelInstances
          appearance={appearance}
          cells={tail}
          geometry={geometry}
          material={material}
          part="detailed-tail-1"
        />
        <group ref={tailTwo} position={[1.5, 0, 0]}>
          <VoxelInstances
            appearance={appearance}
            cells={tail}
            geometry={geometry}
            material={material}
            part="detailed-tail-2"
          />
          <group ref={tailThree} position={[1.5, 0, 0]}>
            <VoxelInstances
              appearance={appearance}
              cells={tail}
              geometry={geometry}
              material={material}
              part="detailed-tail-3"
            />
          </group>
        </group>
      </group>
    </>
  );
}
