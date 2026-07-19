import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  BoxGeometry,
  Color,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from "three";

import type { CatAppearance } from "./appearances";
import type { AnimatedVoxelRefs } from "./HighDensityVoxelBody";
import type {
  PersonalizedVoxelCell,
  PersonalizedVoxelModel,
} from "./visualHull";

export interface PersonalizedInstanceDescriptor {
  readonly position: PersonalizedVoxelCell["position"];
  readonly color: string;
}

export function createPersonalizedDescriptors(
  cells: readonly PersonalizedVoxelCell[],
): readonly PersonalizedInstanceDescriptor[] {
  return cells.map((cell) => ({
    position: cell.position,
    color: cell.color,
  }));
}

export function createPersonalizedMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ roughness: 0.86 });
}

interface PersonalizedInstancesProps {
  readonly cells: readonly PersonalizedVoxelCell[];
  readonly geometry: BoxGeometry;
  readonly material: MeshStandardMaterial;
  readonly part: string;
}

function PersonalizedInstances({
  cells,
  geometry,
  material,
  part,
}: PersonalizedInstancesProps) {
  const mesh = useRef<InstancedMesh>(null);
  const instances = useMemo(
    () => createPersonalizedDescriptors(cells),
    [cells],
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

export interface PersonalizedVoxelBodyProps extends AnimatedVoxelRefs {
  readonly appearance: CatAppearance;
  readonly model: PersonalizedVoxelModel;
}

export function PersonalizedVoxelBody({
  appearance,
  model,
  leftEye,
  rightEye,
  leftBlink,
  rightBlink,
  tailOne,
  tailTwo,
  tailThree,
}: PersonalizedVoxelBodyProps) {
  const geometry = useMemo(
    () => new BoxGeometry(model.voxelSize, model.voxelSize, model.voxelSize),
    [model.voxelSize],
  );
  const material = useMemo(createPersonalizedMaterial, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const eyeHeight = Math.max(0.18, model.voxelSize * 3.2);
  const eyeWidth = Math.max(0.16, model.voxelSize * 2.8);
  const faceDepth = Math.max(0.06, model.voxelSize * 0.8);
  const blinkHeight = Math.max(0.05, model.voxelSize * 0.65);
  const noseHeight = Math.max(0.13, model.voxelSize * 1.8);
  const noseWidth = Math.max(0.16, model.voxelSize * 2.2);

  return (
    <>
      <PersonalizedInstances
        cells={model.main}
        geometry={geometry}
        material={material}
        part="personalized-main"
      />

      <mesh
        ref={leftEye}
        castShadow
        position={[model.anchors.faceX, model.anchors.eyeY, -model.anchors.eyeZ]}
        userData={{ part: "left-eye" }}
      >
        <boxGeometry args={[faceDepth, eyeHeight, eyeWidth]} />
        <meshStandardMaterial color={appearance.palette.eye} roughness={0.7} />
      </mesh>
      <mesh
        ref={rightEye}
        castShadow
        position={[model.anchors.faceX, model.anchors.eyeY, model.anchors.eyeZ]}
        userData={{ part: "right-eye" }}
      >
        <boxGeometry args={[faceDepth, eyeHeight, eyeWidth]} />
        <meshStandardMaterial color={appearance.palette.eye} roughness={0.7} />
      </mesh>
      <mesh
        ref={leftBlink}
        visible={false}
        position={[model.anchors.faceX - faceDepth * 0.55, model.anchors.eyeY, -model.anchors.eyeZ]}
        userData={{ part: "left-blink" }}
      >
        <boxGeometry args={[faceDepth, blinkHeight, eyeWidth * 1.08]} />
        <meshStandardMaterial color={appearance.palette.dark} />
      </mesh>
      <mesh
        ref={rightBlink}
        visible={false}
        position={[model.anchors.faceX - faceDepth * 0.55, model.anchors.eyeY, model.anchors.eyeZ]}
        userData={{ part: "right-blink" }}
      >
        <boxGeometry args={[faceDepth, blinkHeight, eyeWidth * 1.08]} />
        <meshStandardMaterial color={appearance.palette.dark} />
      </mesh>
      <mesh
        castShadow
        position={[model.anchors.faceX - faceDepth * 0.75, model.anchors.noseY, 0]}
        userData={{ part: "nose" }}
      >
        <boxGeometry args={[faceDepth, noseHeight, noseWidth]} />
        <meshStandardMaterial color={appearance.palette.nose} roughness={0.7} />
      </mesh>

      <group
        ref={tailOne}
        position={[...model.anchors.tailPivot]}
        userData={{ part: "tail-1-pivot" }}
      >
        <PersonalizedInstances
          cells={model.tailSegment}
          geometry={geometry}
          material={material}
          part="personalized-tail-1"
        />
        <group
          ref={tailTwo}
          position={[model.anchors.tailNextPivotX, 0, 0]}
          userData={{ part: "tail-2-pivot" }}
        >
          <PersonalizedInstances
            cells={model.tailSegment}
            geometry={geometry}
            material={material}
            part="personalized-tail-2"
          />
          <group
            ref={tailThree}
            position={[model.anchors.tailNextPivotX, 0, 0]}
            userData={{ part: "tail-3-pivot" }}
          >
            <PersonalizedInstances
              cells={model.tailSegment}
              geometry={geometry}
              material={material}
              part="personalized-tail-3"
            />
          </group>
        </group>
      </group>
    </>
  );
}
