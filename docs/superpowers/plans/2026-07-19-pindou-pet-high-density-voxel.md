# 像素宠物高密度 3D 体素猫 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有粗粒度 3D 方块猫升级为可切换、可回退、可测量性能的高密度真实体素猫，同时完整保留五只猫、相机和互动行为。

**Architecture:** 纯 TypeScript 生成器在离散网格中构造削角猫咪轮廓并只保留表面体素；React Three Fiber 使用少量 `InstancedMesh` 批量渲染这些体素。现有粗粒度模型作为 `performance` 模式原样保留；页面状态控制模式，独立帧率采样器只负责给出低帧率提示，不自动切换。

**Tech Stack:** React 19、TypeScript 5.9、Three.js 0.185、React Three Fiber 9、Drei 10、Vitest 4、Testing Library、Vite 7。

## Global Constraints

- 首选体素网格步长约为 `0.1` 个场景单位，小立方体边长为网格步长的 92%–96%。
- 猫头横向约 20–24 个体素，身体长度约 36–40 个体素。
- 完整精细模型预计包含约 8,000–12,000 个可见体素，只生成表面，不生成完全封闭的内部体素。
- 精细模式必须使用真实小立方体几何，不能用放大的高分辨率贴图冒充几何细分。
- 五只猫继续使用现有 `CatAppearance` 调色板和 `8×8` 大色块花纹，不添加随机彩色噪点、真实毛发、连续渐变或模糊过滤。
- 当前粗粒度模型必须留在代码中并能够实际切换，不能只依赖 Git 历史回退。
- 模式切换不得重建 Canvas、相机或 OrbitControls，不得丢失当前猫咪和相机选择。
- 精细模式预热 2 秒后按约 5 秒窗口采样；低于 30 FPS 只提示，不自动切换。
- 开发机桌面浏览器连续 10 秒平均目标至少 45 FPS。
- 本轮不加入照片上传、AI 推断、AR、3D 导出或新的互动类型。
- 必须保留点击跳跃／爱心、拖动、缩放、三个相机预设、呼吸、眨眼、摇尾和减少动态效果行为。

---

## File Structure

- Create `apps/web/src/app/voxel/highDensityGeometry.ts`: 纯体素占用、表面剔除、花纹采样和稳定模型常量。
- Create `apps/web/src/app/voxel/highDensityGeometry.test.ts`: 密度、边界、无内部体素、确定性与五只猫颜色映射测试。
- Create `apps/web/src/app/voxel/HighDensityVoxelBody.tsx`: 共享几何／材质和少量 `InstancedMesh` 渲染。
- Create `apps/web/src/app/voxel/DetailFallbackBoundary.tsx`: 精细模型局部失败时渲染粗粒度视觉。
- Create `apps/web/src/app/voxel/DetailFallbackBoundary.test.tsx`: 局部失败与 reset key 测试。
- Create `apps/web/src/app/voxel/detailMode.ts`: `DetailMode` 和唯一默认模式常量。
- Create `apps/web/src/app/voxel/frameRate.ts`: 2 秒预热、5 秒窗口和 30 FPS 判定的纯状态机。
- Create `apps/web/src/app/voxel/frameRate.test.ts`: 预热、低帧率、恢复和窗口重置测试。
- Modify `apps/web/src/app/voxel/VoxelCatModel.tsx`: 复用现有动画根与指针逻辑，在精细／粗粒度视觉间切换。
- Modify `apps/web/src/app/voxel/VoxelCatScene.tsx`: 传递模式、局部回退事件并运行窗口式帧率探针。
- Modify `apps/web/src/app/voxel/VoxelCatStage.tsx`: 展示帧率数据、低帧率提示和精细模型回退提示。
- Modify `apps/web/src/app/voxel/VoxelCatStage.test.tsx`: 场景 mock、低帧率提示、恢复和回退测试。
- Modify `apps/web/src/app/PixelPetStudio.tsx`: 保存画质模式并提供“精细模式 / 性能模式”按钮。
- Modify `apps/web/src/app/App.test.tsx`: 验证默认模式、来回切换以及猫咪／相机状态不丢失。
- Modify `apps/web/src/app/styles.css`: 模式按钮和非阻塞警告样式。
- Modify `docs/superpowers/specs/2026-07-19-pindou-pet-high-density-voxel-design.md`: 保持批准状态，并在最终验收后记录实测默认模式与性能结果。

---

### Task 1: Build the deterministic surface-voxel generator

**Files:**
- Create: `apps/web/src/app/voxel/highDensityGeometry.ts`
- Create: `apps/web/src/app/voxel/highDensityGeometry.test.ts`

**Interfaces:**
- Consumes: `CatAppearance`, `PaletteKey` and `PATTERN_LEGEND` from `appearances.ts`.
- Produces: `VOXEL_STEP`, `VOXEL_CUBE_SIZE`, `VoxelCell`, `HighDensityVoxelModel`, `generateHighDensityVoxelModel()`, `resolveVoxelPaletteKey(cell, appearance)`, `HIGH_DENSITY_VOXEL_MODEL` and `HIGH_DENSITY_VOXEL_COUNT`.

- [ ] **Step 1: Write failing generator tests**

Create `highDensityGeometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { CAT_APPEARANCES, PALETTE_KEYS } from "./appearances";
import {
  GRID_NEIGHBORS,
  HIGH_DENSITY_VOXEL_COUNT,
  generateHighDensityVoxelModel,
  gridKey,
  resolveVoxelPaletteKey,
} from "./highDensityGeometry";

describe("high-density voxel geometry", () => {
  it("is deterministic and stays inside the approved density envelope", () => {
    const first = generateHighDensityVoxelModel();
    const second = generateHighDensityVoxelModel();
    expect(second).toEqual(first);
    expect(HIGH_DENSITY_VOXEL_COUNT).toBeGreaterThanOrEqual(8_000);
    expect(HIGH_DENSITY_VOXEL_COUNT).toBeLessThanOrEqual(12_000);

    const head = first.main.filter((cell) => cell.region === "head");
    const headX = head.map((cell) => cell.grid[0]);
    expect(Math.max(...headX) - Math.min(...headX) + 1).toBeGreaterThanOrEqual(20);
    expect(Math.max(...headX) - Math.min(...headX) + 1).toBeLessThanOrEqual(24);
  });

  it("contains only surface cells", () => {
    const model = generateHighDensityVoxelModel();
    const occupied = new Set(model.main.map((cell) => gridKey(cell.grid)));
    for (const cell of model.main) {
      expect(
        GRID_NEIGHBORS.some(([dx, dy, dz]) =>
          !occupied.has(gridKey([cell.grid[0] + dx, cell.grid[1] + dy, cell.grid[2] + dz])),
        ),
      ).toBe(true);
    }
  });

  it("maps every cell to a legal palette key for all five cats", () => {
    const model = generateHighDensityVoxelModel();
    for (const appearance of CAT_APPEARANCES) {
      for (const cell of [...model.main, ...model.tailSegment]) {
        expect(PALETTE_KEYS).toContain(resolveVoxelPaletteKey(cell, appearance));
      }
    }
  });
});
```

- [ ] **Step 2: Run the focused test to prove RED**

Run:

```bash
pnpm --filter @pindou/web test -- src/app/voxel/highDensityGeometry.test.ts
```

Expected: FAIL because `./highDensityGeometry` does not exist.

- [ ] **Step 3: Implement the pure grid model**

Create `highDensityGeometry.ts` with these public contracts and fixed geometry rules:

```ts
import {
  PATTERN_LEGEND,
  type CatAppearance,
  type PaletteKey,
} from "./appearances";

type Vec3 = readonly [number, number, number];
type PatternName = keyof CatAppearance["patterns"];
export type VoxelRegion = "body" | "head" | "muzzle" | "ear" | "leg" | "paw" | "chest" | "tail";

export const VOXEL_STEP = 0.1;
export const VOXEL_CUBE_SIZE = VOXEL_STEP * 0.94;
export const GRID_NEIGHBORS: readonly Vec3[] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0],
  [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

export interface VoxelCell {
  readonly grid: Vec3;
  readonly position: Vec3;
  readonly region: VoxelRegion;
  readonly pattern: PatternName;
  readonly patternCell: readonly [number, number];
  readonly paletteOverride?: PaletteKey;
}

export interface HighDensityVoxelModel {
  readonly main: readonly VoxelCell[];
  readonly tailSegment: readonly VoxelCell[];
}

interface Shape {
  readonly region: VoxelRegion;
  readonly pattern: PatternName;
  readonly bounds: readonly [number, number, number, number, number, number];
  readonly paletteOverride?: PaletteKey;
  readonly contains: (x: number, y: number, z: number) => boolean;
}

export function gridKey([x, y, z]: Vec3): string {
  return `${x}:${y}:${z}`;
}

function box(x: number, y: number, z: number, bounds: Shape["bounds"]): boolean {
  const [minX, maxX, minY, maxY, minZ, maxZ] = bounds;
  return x >= minX && x <= maxX && y >= minY && y <= maxY && z >= minZ && z <= maxZ;
}

function chamferedBox(x: number, y: number, z: number, bounds: Shape["bounds"], cut: number): boolean {
  if (!box(x, y, z, bounds)) return false;
  const [minX, maxX, minY, maxY, minZ, maxZ] = bounds;
  const edgeX = Math.min(x - minX, maxX - x);
  const edgeY = Math.min(y - minY, maxY - y);
  const edgeZ = Math.min(z - minZ, maxZ - z);
  return edgeX + edgeY >= cut && edgeX + edgeZ >= cut && edgeY + edgeZ >= cut;
}

function earContains(centerZ: number) {
  return (x: number, y: number, z: number): boolean => {
    if (y < 41 || y > 50) return false;
    const level = y - 41;
    const halfX = Math.max(1, 5 - Math.floor(level / 3));
    const halfZ = Math.max(1, 5 - Math.floor(level / 2));
    return Math.abs(x + 25) <= halfX && Math.abs(z - centerZ) <= halfZ;
  };
}

function makeShapes(): readonly Shape[] {
  const shapes: Shape[] = [
    { region: "muzzle", pattern: "face", bounds: [-41, -36, 26, 33, -6, 6], paletteOverride: "light", contains: (x, y, z) => chamferedBox(x, y, z, [-41, -36, 26, 33, -6, 6], 1) },
    { region: "ear", pattern: "face", bounds: [-30, -20, 41, 50, -11, -1], contains: earContains(-6) },
    { region: "ear", pattern: "face", bounds: [-30, -20, 41, 50, 1, 11], contains: earContains(6) },
    { region: "head", pattern: "face", bounds: [-36, -15, 22, 42, -10, 10], contains: (x, y, z) => chamferedBox(x, y, z, [-36, -15, 22, 42, -10, 10], 2) },
    { region: "chest", pattern: "body", bounds: [-22, -18, 15, 29, -7, 7], paletteOverride: "light", contains: (x, y, z) => chamferedBox(x, y, z, [-22, -18, 15, 29, -7, 7], 1) },
    { region: "body", pattern: "body", bounds: [-19, 18, 14, 35, -10, 10], contains: (x, y, z) => chamferedBox(x, y, z, [-19, 18, 14, 35, -10, 10], 2) },
  ];
  for (const centerX of [-13, 13]) {
    for (const centerZ of [-6, 6]) {
      shapes.push(
        { region: "paw", pattern: "legs", bounds: [centerX - 5, centerX + 3, 1, 5, centerZ - 4, centerZ + 4], paletteOverride: "light", contains: (x, y, z) => chamferedBox(x, y, z, [centerX - 5, centerX + 3, 1, 5, centerZ - 4, centerZ + 4], 1) },
        { region: "leg", pattern: "legs", bounds: [centerX - 3, centerX + 3, 4, 18, centerZ - 3, centerZ + 3], contains: (x, y, z) => chamferedBox(x, y, z, [centerX - 3, centerX + 3, 4, 18, centerZ - 3, centerZ + 3], 1) },
      );
    }
  }
  return shapes;
}

function patternCell(shape: Shape, x: number, y: number, z: number): readonly [number, number] {
  const [minX, maxX, minY, maxY, minZ, maxZ] = shape.bounds;
  const coordinateU = shape.pattern === "face" ? z : x;
  const minU = shape.pattern === "face" ? minZ : minX;
  const maxU = shape.pattern === "face" ? maxZ : maxX;
  const u = Math.round(((coordinateU - minU) / Math.max(1, maxU - minU)) * 7);
  const v = 7 - Math.round(((y - minY) / Math.max(1, maxY - minY)) * 7);
  return [Math.max(0, Math.min(7, u)), Math.max(0, Math.min(7, v))];
}

function toCell(shape: Shape, x: number, y: number, z: number): VoxelCell {
  return {
    grid: [x, y, z],
    position: [x * VOXEL_STEP, y * VOXEL_STEP, z * VOXEL_STEP],
    region: shape.region,
    pattern: shape.pattern,
    patternCell: patternCell(shape, x, y, z),
    ...(shape.paletteOverride === undefined ? {} : { paletteOverride: shape.paletteOverride }),
  };
}

function surfaceOnly(cells: readonly VoxelCell[]): readonly VoxelCell[] {
  const occupied = new Set(cells.map((cell) => gridKey(cell.grid)));
  return cells.filter((cell) => GRID_NEIGHBORS.some(([dx, dy, dz]) =>
    !occupied.has(gridKey([cell.grid[0] + dx, cell.grid[1] + dy, cell.grid[2] + dz])),
  ));
}

function generateMain(): readonly VoxelCell[] {
  const shapes = makeShapes();
  const occupied = new Map<string, VoxelCell>();
  for (let x = -41; x <= 18; x += 1) {
    for (let y = 1; y <= 50; y += 1) {
      for (let z = -11; z <= 11; z += 1) {
        const shape = shapes.find((candidate) => candidate.contains(x, y, z));
        if (shape !== undefined) occupied.set(gridKey([x, y, z]), toCell(shape, x, y, z));
      }
    }
  }
  return surfaceOnly([...occupied.values()]);
}

function generateTailSegment(): readonly VoxelCell[] {
  const shape: Shape = {
    region: "tail",
    pattern: "tail",
    bounds: [0, 14, -2, 2, -2, 2],
    contains: (x, y, z) => chamferedBox(x, y, z, [0, 14, -2, 2, -2, 2], 1),
  };
  const cells: VoxelCell[] = [];
  for (let x = 0; x <= 14; x += 1) {
    for (let y = -2; y <= 2; y += 1) {
      for (let z = -2; z <= 2; z += 1) {
        if (shape.contains(x, y, z)) cells.push(toCell(shape, x, y, z));
      }
    }
  }
  return surfaceOnly(cells);
}

export function generateHighDensityVoxelModel(): HighDensityVoxelModel {
  return { main: generateMain(), tailSegment: generateTailSegment() };
}

export function resolveVoxelPaletteKey(cell: VoxelCell, appearance: CatAppearance): PaletteKey {
  if (cell.paletteOverride !== undefined) return cell.paletteOverride;
  const [u, v] = cell.patternCell;
  const symbol = appearance.patterns[cell.pattern][v]?.[u];
  const paletteKey = symbol === undefined ? undefined : PATTERN_LEGEND[symbol];
  if (paletteKey === undefined) throw new Error(`Unknown voxel pattern at ${gridKey(cell.grid)}`);
  return paletteKey;
}

export const HIGH_DENSITY_VOXEL_MODEL = generateHighDensityVoxelModel();
export const HIGH_DENSITY_VOXEL_COUNT =
  HIGH_DENSITY_VOXEL_MODEL.main.length + HIGH_DENSITY_VOXEL_MODEL.tailSegment.length * 3;
```

- [ ] **Step 4: Run RED/GREEN loop and tune only fixed geometry numbers**

Run: `pnpm --filter @pindou/web test -- src/app/voxel/highDensityGeometry.test.ts`

Expected: PASS. If the initial count is outside 8,000–12,000, adjust only the documented body/head bounds or `VOXEL_STEP`-independent grid density; do not weaken the test range or add hidden interior cells.

- [ ] **Step 5: Commit the generator and approved documents**

```bash
git add apps/web/src/app/voxel/highDensityGeometry.ts apps/web/src/app/voxel/highDensityGeometry.test.ts docs/superpowers/specs/2026-07-19-pindou-pet-high-density-voxel-design.md docs/superpowers/plans/2026-07-19-pindou-pet-high-density-voxel.md
git commit -m "feat: define high-density voxel cat geometry"
```

---

### Task 2: Render high-density instances through the existing animation rig

**Files:**
- Create: `apps/web/src/app/voxel/HighDensityVoxelBody.tsx`
- Create: `apps/web/src/app/voxel/DetailFallbackBoundary.tsx`
- Create: `apps/web/src/app/voxel/DetailFallbackBoundary.test.tsx`
- Modify: `apps/web/src/app/voxel/VoxelCatModel.tsx`

**Interfaces:**
- Consumes: `HIGH_DENSITY_VOXEL_MODEL`, `VOXEL_CUBE_SIZE`, `resolveVoxelPaletteKey`, current animation refs and `CatAppearance`.
- Produces: `HighDensityVoxelBody`, `DetailFallbackBoundary`, and `VoxelCatModelProps.detailMode/onDetailFallback`.

- [ ] **Step 1: Write the failing local fallback test**

Create `DetailFallbackBoundary.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DetailFallbackBoundary } from "./DetailFallbackBoundary";

function BrokenVisual(): never {
  throw new Error("voxel generation failed");
}

describe("DetailFallbackBoundary", () => {
  it("shows the coarse fallback and reports the failure", () => {
    const onFallback = vi.fn();
    render(
      <DetailFallbackBoundary fallback={<div>粗粒度猫</div>} onFallback={onFallback} resetKey="cat-01">
        <BrokenVisual />
      </DetailFallbackBoundary>,
    );
    expect(screen.getByText("粗粒度猫")).toBeVisible();
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it("retries its children when the reset key changes", () => {
    const onFallback = vi.fn();
    const view = render(
      <DetailFallbackBoundary fallback={<div>粗粒度猫</div>} onFallback={onFallback} resetKey="cat-01">
        <BrokenVisual />
      </DetailFallbackBoundary>,
    );
    view.rerender(
      <DetailFallbackBoundary fallback={<div>粗粒度猫</div>} onFallback={onFallback} resetKey="cat-02">
        <div>精细体素猫</div>
      </DetailFallbackBoundary>,
    );
    expect(screen.getByText("精细体素猫")).toBeVisible();
  });
});
```

- [ ] **Step 2: Prove RED, then add the reusable boundary**

Run: `pnpm --filter @pindou/web test -- src/app/voxel/DetailFallbackBoundary.test.tsx`

Expected: FAIL because the boundary does not exist.

Create `DetailFallbackBoundary.tsx`:

```tsx
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  readonly children: ReactNode;
  readonly fallback: ReactNode;
  readonly onFallback: () => void;
  readonly resetKey: string;
}

interface State {
  readonly failed: boolean;
  readonly resetKey: string;
}

export class DetailFallbackBoundary extends Component<Props, State> {
  state: State = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.resetKey
      ? null
      : { failed: false, resetKey: props.resetKey };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    this.props.onFallback();
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
```

Run the focused test again. Expected: PASS.

- [ ] **Step 3: Add the instanced renderer**

Create `HighDensityVoxelBody.tsx` around one reusable `VoxelInstances` helper:

```tsx
import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
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

interface InstancesProps {
  readonly appearance: CatAppearance;
  readonly cells: readonly VoxelCell[];
  readonly geometry: BoxGeometry;
  readonly material: MeshStandardMaterial;
  readonly part: string;
}

function VoxelInstances({ appearance, cells, geometry, material, part }: InstancesProps) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (mesh.current === null) return;
    const transform = new Object3D();
    cells.forEach((cell, index) => {
      transform.position.set(...cell.position);
      transform.updateMatrix();
      mesh.current?.setMatrixAt(index, transform.matrix);
      mesh.current?.setColorAt(index, new Color(appearance.palette[resolveVoxelPaletteKey(cell, appearance)]));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor !== null) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [appearance, cells]);

  return (
    <instancedMesh
      args={[geometry, material, cells.length]}
      castShadow
      receiveShadow
      ref={mesh}
      userData={{ part }}
    />
  );
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
}: { readonly appearance: CatAppearance } & AnimatedVoxelRefs) {
  const geometry = useMemo(() => new BoxGeometry(VOXEL_CUBE_SIZE, VOXEL_CUBE_SIZE, VOXEL_CUBE_SIZE), []);
  const material = useMemo(() => new MeshStandardMaterial({ roughness: 0.86, vertexColors: true }), []);

  useLayoutEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  const tail = HIGH_DENSITY_VOXEL_MODEL.tailSegment;
  return (
    <>
      <VoxelInstances appearance={appearance} cells={HIGH_DENSITY_VOXEL_MODEL.main} geometry={geometry} material={material} part="detailed-main" />
      <mesh ref={leftEye} castShadow position={[-3.68, 3.45, -0.48]}><boxGeometry args={[0.08, 0.45, 0.45]} /><meshStandardMaterial color={appearance.palette.eye} roughness={0.7} /></mesh>
      <mesh ref={rightEye} castShadow position={[-3.68, 3.45, 0.48]}><boxGeometry args={[0.08, 0.45, 0.45]} /><meshStandardMaterial color={appearance.palette.eye} roughness={0.7} /></mesh>
      <mesh ref={leftBlink} visible={false} position={[-3.72, 3.45, -0.48]}><boxGeometry args={[0.08, 0.08, 0.5]} /><meshStandardMaterial color={appearance.palette.dark} /></mesh>
      <mesh ref={rightBlink} visible={false} position={[-3.72, 3.45, 0.48]}><boxGeometry args={[0.08, 0.08, 0.5]} /><meshStandardMaterial color={appearance.palette.dark} /></mesh>
      <mesh castShadow position={[-4.18, 3, 0]}><boxGeometry args={[0.08, 0.3, 0.4]} /><meshStandardMaterial color={appearance.palette.nose} roughness={0.7} /></mesh>
      <group ref={tailOne} position={[1.9, 2.65, 0]}>
        <VoxelInstances appearance={appearance} cells={tail} geometry={geometry} material={material} part="detailed-tail-1" />
        <group ref={tailTwo} position={[1.43, 0, 0]}>
          <VoxelInstances appearance={appearance} cells={tail} geometry={geometry} material={material} part="detailed-tail-2" />
          <group ref={tailThree} position={[1.43, 0, 0]}>
            <VoxelInstances appearance={appearance} cells={tail} geometry={geometry} material={material} part="detailed-tail-3" />
          </group>
        </group>
      </group>
    </>
  );
}
```

- [ ] **Step 4: Reuse the current animation root and retain the coarse visual**

In `VoxelCatModel.tsx`:

1. Add `detailMode: DetailMode` and `onDetailFallback: () => void` to `VoxelCatModelProps`.
2. Import `AnimatedVoxelRefs` from `HighDensityVoxelBody.tsx`; move only the existing texture creation and coarse JSX into a local `CoarseVoxelBody` component whose `refs` prop is `AnimatedVoxelRefs`. Do not alter its dimensions, colors or tail pivots.
3. Keep the existing `useFrame`, pointer-distance test, jump state and root/body refs in `VoxelCatModel`.
4. Inside the existing `bodyPivot`, render exactly one branch:

```tsx
{detailMode === "detailed" ? (
  <DetailFallbackBoundary
    fallback={<CoarseVoxelBody appearance={appearance} refs={animatedRefs} />}
    onFallback={onDetailFallback}
    resetKey={appearance.id}
  >
    <HighDensityVoxelBody appearance={appearance} {...animatedRefs} />
  </DetailFallbackBoundary>
) : (
  <CoarseVoxelBody appearance={appearance} refs={animatedRefs} />
)}
```

The `animatedRefs` object must contain the existing `leftEye`, `rightEye`, `leftBlink`, `rightBlink`, `tailOne`, `tailTwo` and `tailThree` refs. No animation constants or pointer thresholds change in this task.

- [ ] **Step 5: Verify focused behavior and compile the Three.js types**

Run:

```bash
pnpm --filter @pindou/web test -- src/app/voxel/DetailFallbackBoundary.test.tsx src/app/voxel/highDensityGeometry.test.ts
pnpm --filter @pindou/web typecheck
```

Expected: focused tests PASS and TypeScript exits `0` without ref or `InstancedMesh` errors.

- [ ] **Step 6: Commit the renderer**

```bash
git add apps/web/src/app/voxel/HighDensityVoxelBody.tsx apps/web/src/app/voxel/DetailFallbackBoundary.tsx apps/web/src/app/voxel/DetailFallbackBoundary.test.tsx apps/web/src/app/voxel/VoxelCatModel.tsx
git commit -m "feat: render high-density voxel cat instances"
```

---

### Task 3: Add explicit detailed/performance mode controls

**Files:**
- Create: `apps/web/src/app/voxel/detailMode.ts`
- Modify: `apps/web/src/app/PixelPetStudio.tsx`
- Modify: `apps/web/src/app/App.test.tsx`
- Modify: `apps/web/src/app/voxel/VoxelCatScene.tsx`
- Modify: `apps/web/src/app/voxel/VoxelCatStage.tsx`
- Modify: `apps/web/src/app/voxel/VoxelCatStage.test.tsx`
- Modify: `apps/web/src/app/styles.css`

**Interfaces:**
- Produces: `DetailMode`, `DEFAULT_DETAIL_MODE`, `VoxelCatStageProps.detailMode`, `VoxelCatSceneProps.detailMode`.

- [ ] **Step 1: Extend the product-shell mock and write the failing state test**

Change the `VoxelCatStage` mock in `App.test.tsx` to render `detailMode`, then add:

```tsx
it("switches detail modes without losing the selected cat or camera", () => {
  render(<App initialPath="/" />);
  expect(screen.getByRole("img", { name: "互动式 3D 方块猫" })).toHaveTextContent("小满 / front / detailed");

  fireEvent.click(screen.getByRole("button", { name: "测试猫：橘子，橘色长毛" }));
  fireEvent.click(screen.getByRole("button", { name: "侧面视角" }));
  fireEvent.click(screen.getByRole("button", { name: "性能模式" }));

  expect(screen.getByRole("img", { name: "互动式 3D 方块猫" })).toHaveTextContent("橘子 / side / performance");
  expect(screen.getByRole("button", { name: "性能模式" })).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(screen.getByRole("button", { name: "精细模式" }));
  expect(screen.getByRole("img", { name: "互动式 3D 方块猫" })).toHaveTextContent("橘子 / side / detailed");
});
```

- [ ] **Step 2: Run the focused test to prove RED**

Run: `pnpm --filter @pindou/web test -- src/app/App.test.tsx`

Expected: FAIL because the mode buttons and prop do not exist.

- [ ] **Step 3: Add the single mode contract and UI state**

Create `detailMode.ts`:

```ts
export const DETAIL_MODES = ["detailed", "performance"] as const;
export type DetailMode = (typeof DETAIL_MODES)[number];
export const DEFAULT_DETAIL_MODE: DetailMode = "detailed";
```

In `PixelPetStudio.tsx`, initialize `detailMode` with `DEFAULT_DETAIL_MODE`, add this control immediately after `.angle-switcher`, and pass the value to `VoxelCatStage`:

```tsx
<div className="detail-switcher" aria-label="模型精细度">
  <button aria-pressed={detailMode === "detailed"} onClick={() => setDetailMode("detailed")} type="button">精细模式</button>
  <button aria-pressed={detailMode === "performance"} onClick={() => setDetailMode("performance")} type="button">性能模式</button>
</div>
```

Add `detailMode: DetailMode` to the stage and scene prop interfaces and pass it unchanged through `VoxelCatStage → VoxelCatScene → VoxelCatModel` together with a no-op-safe detail fallback callback.

Update the existing WebGL failure case in `VoxelCatStage.test.tsx` to pass `detailMode="detailed"`; its expected failure copy and accessibility assertions remain unchanged.

- [ ] **Step 4: Style the two-button control without changing adjacent layout**

Append to the existing control styles:

```css
.detail-switcher { display: grid; margin: 0 0 14px; grid-template-columns: repeat(2, 1fr); }
.detail-switcher button { min-height: 35px; border: 1px solid #251f1a; border-right: 0; background: #f8f1e6; cursor: pointer; font-size: 11px; }
.detail-switcher button:last-child { border-right: 1px solid #251f1a; }
.detail-switcher button[aria-pressed="true"] { color: #fff9ef; background: #c84831; }
```

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @pindou/web test -- src/app/App.test.tsx src/app/voxel/VoxelCatStage.test.tsx
pnpm --filter @pindou/web typecheck
```

Expected: tests PASS and typecheck exits `0`.

- [ ] **Step 6: Commit mode switching**

```bash
git add apps/web/src/app/voxel/detailMode.ts apps/web/src/app/PixelPetStudio.tsx apps/web/src/app/App.test.tsx apps/web/src/app/voxel/VoxelCatScene.tsx apps/web/src/app/voxel/VoxelCatStage.tsx apps/web/src/app/styles.css
git commit -m "feat: add voxel detail mode switching"
```

---

### Task 4: Add windowed FPS measurement and non-blocking warnings

**Files:**
- Create: `apps/web/src/app/voxel/frameRate.ts`
- Create: `apps/web/src/app/voxel/frameRate.test.ts`
- Modify: `apps/web/src/app/voxel/VoxelCatScene.tsx`
- Modify: `apps/web/src/app/voxel/VoxelCatStage.tsx`
- Modify: `apps/web/src/app/voxel/VoxelCatStage.test.tsx`
- Modify: `apps/web/src/app/styles.css`

**Interfaces:**
- Produces: `FrameRateAccumulator`, `createFrameRateAccumulator()`, `advanceFrameRate(state, deltaMs)`, `LOW_FPS_THRESHOLD`, and stage warnings.

- [ ] **Step 1: Write failing pure sampling tests**

Create `frameRate.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { advanceFrameRate, createFrameRateAccumulator } from "./frameRate";

function runFrames(fps: number, seconds: number) {
  let state = createFrameRateAccumulator();
  let sample: number | null = null;
  const frameMs = 1_000 / fps;
  for (let frame = 0; frame < fps * seconds; frame += 1) {
    const next = advanceFrameRate(state, frameMs);
    state = next.state;
    if (next.averageFps !== null) sample = next.averageFps;
  }
  return sample;
}

describe("frame-rate windows", () => {
  it("waits through two seconds of warmup and reports a five-second window", () => {
    expect(runFrames(60, 6)).toBeNull();
    expect(runFrames(60, 8)).toBeCloseTo(60, 0);
  });

  it("classifies low and recovered windows", () => {
    expect(runFrames(24, 8)).toBeCloseTo(24, 0);
    expect(runFrames(45, 8)).toBeCloseTo(45, 0);
  });
});
```

- [ ] **Step 2: Prove RED and implement the pure accumulator**

Run: `pnpm --filter @pindou/web test -- src/app/voxel/frameRate.test.ts`

Expected: FAIL because `frameRate.ts` does not exist.

Create `frameRate.ts`:

```ts
export const FPS_WARMUP_MS = 2_000;
export const FPS_WINDOW_MS = 5_000;
export const LOW_FPS_THRESHOLD = 30;

export interface FrameRateAccumulator {
  readonly totalElapsedMs: number;
  readonly windowElapsedMs: number;
  readonly frames: number;
}

export function createFrameRateAccumulator(): FrameRateAccumulator {
  return { totalElapsedMs: 0, windowElapsedMs: 0, frames: 0 };
}

export function advanceFrameRate(
  state: FrameRateAccumulator,
  deltaMs: number,
): { readonly state: FrameRateAccumulator; readonly averageFps: number | null } {
  const totalElapsedMs = state.totalElapsedMs + deltaMs;
  if (totalElapsedMs <= FPS_WARMUP_MS) {
    return { state: { totalElapsedMs, windowElapsedMs: 0, frames: 0 }, averageFps: null };
  }

  const windowElapsedMs = state.windowElapsedMs + deltaMs;
  const frames = state.frames + 1;
  if (windowElapsedMs < FPS_WINDOW_MS) {
    return { state: { totalElapsedMs, windowElapsedMs, frames }, averageFps: null };
  }

  return {
    state: { totalElapsedMs, windowElapsedMs: 0, frames: 0 },
    averageFps: frames / (windowElapsedMs / 1_000),
  };
}
```

Run the focused test again. Expected: PASS.

- [ ] **Step 3: Replace the cumulative development-only probe with the windowed probe**

In `VoxelCatScene.tsx`, remove the `IS_DEVELOPMENT` condition. `FrameRateProbe` stores `createFrameRateAccumulator()` in a ref, calls `advanceFrameRate(current, delta * 1_000)` inside `useFrame`, and invokes `onSample` only when `averageFps` is non-null. Render the probe only while `detailMode === "detailed"`; unmounting it resets warmup and the current window.

Keep the existing public `FrameSample` fields. On every completed window send:

```ts
onSample({
  averageFps,
  elapsedSeconds: next.state.totalElapsedMs / 1_000,
  frames: Math.round(averageFps * (FPS_WINDOW_MS / 1_000)),
});
```

- [ ] **Step 4: Write stage warning tests before implementing the warning**

Mock `VoxelCatScene` in `VoxelCatStage.test.tsx`, retain the latest `onFrameSample` and `onDetailFallback` callbacks, then add:

```tsx
it("recommends performance mode only for a completed low-fps window", () => {
  render(<VoxelCatStage appearance={getCatAppearance("cat-01").appearance} cameraPreset="front" detailMode="detailed" webglSupported />);
  act(() => emitFrameSample({ averageFps: 24, elapsedSeconds: 7, frames: 120 }));
  expect(screen.getByRole("status")).toHaveTextContent("帧率较低，建议切换性能模式");
  act(() => emitFrameSample({ averageFps: 48, elapsedSeconds: 12, frames: 240 }));
  expect(screen.queryByText("帧率较低，建议切换性能模式")).not.toBeInTheDocument();
});

it("reports a local detailed-model fallback", () => {
  render(<VoxelCatStage appearance={getCatAppearance("cat-01").appearance} cameraPreset="front" detailMode="detailed" webglSupported />);
  act(() => emitDetailFallback());
  expect(screen.getByRole("status")).toHaveTextContent("精细模型加载失败，已显示性能模型");
});
```

Run: `pnpm --filter @pindou/web test -- src/app/voxel/VoxelCatStage.test.tsx`

Expected: FAIL because the warnings are absent.

- [ ] **Step 5: Implement stage warning state and accessible overlays**

In `VoxelCatStage.tsx`:

- keep `lowFps` and `detailFallback` boolean state;
- set `lowFps` from `sample.averageFps < LOW_FPS_THRESHOLD`;
- clear both warnings when `detailMode` or `appearance.id` changes;
- keep updating `data-average-fps`, `data-frame-count`, `data-sample-seconds`, `data-detail-mode` and `data-voxel-count` on `.voxel-canvas-wrap`;
- pass `onDetailFallback` through the scene;
- render only one warning message at a time, prioritizing the detail fallback.

Use this markup inside `.voxel-canvas-wrap`:

```tsx
{warning !== null && (
  <p className="voxel-performance-warning" role="status">{warning}</p>
)}
```

Add:

```css
.voxel-performance-warning { position: absolute; right: 14px; bottom: 14px; z-index: 4; max-width: 260px; margin: 0; padding: 9px 11px; color: #6e431c; background: rgb(255 239 203 / 94%); border: 1px solid rgb(110 67 28 / 45%); font-size: 11px; box-shadow: 3px 3px 0 rgb(37 31 26 / 14%); }
```

- [ ] **Step 6: Run focused and complete Web verification**

Run:

```bash
pnpm --filter @pindou/web test -- src/app/voxel/frameRate.test.ts src/app/voxel/VoxelCatStage.test.tsx
pnpm --filter @pindou/web test
pnpm --filter @pindou/web typecheck
pnpm --filter @pindou/web build
```

Expected: all Web tests PASS; typecheck and build exit `0`.

- [ ] **Step 7: Commit performance monitoring**

```bash
git add apps/web/src/app/voxel/frameRate.ts apps/web/src/app/voxel/frameRate.test.ts apps/web/src/app/voxel/VoxelCatScene.tsx apps/web/src/app/voxel/VoxelCatStage.tsx apps/web/src/app/voxel/VoxelCatStage.test.tsx apps/web/src/app/styles.css
git commit -m "feat: monitor detailed voxel performance"
```

---

### Task 5: Browser acceptance, performance gate and final verification

**Files:**
- Modify only if measurements require it: `apps/web/src/app/voxel/highDensityGeometry.ts`, `apps/web/src/app/voxel/HighDensityVoxelBody.tsx`, `apps/web/src/app/voxel/detailMode.ts`, `apps/web/src/app/voxel/VoxelCatScene.tsx`
- Modify: `docs/superpowers/specs/2026-07-19-pindou-pet-high-density-voxel-design.md`

**Interfaces:**
- Consumes: DOM data attributes `data-average-fps`, `data-detail-mode`, `data-voxel-count` and the approved visual/interaction contract.
- Produces: measured default detail mode, browser evidence and a clean verified branch.

- [ ] **Step 1: Start or reuse the local Web server**

Run: `pnpm --filter @pindou/web dev --host 127.0.0.1`

Expected: Vite serves `http://127.0.0.1:5173/` or prints the next available local port. Reuse the already running 5173 process if it reflects the current workspace.

- [ ] **Step 2: Perform the full visual and interaction matrix**

At desktop 1440×900 and narrow 390×844:

1. Select all five cats in精细模式 and confirm palette/markings differ.
2. Use front, side and top presets, then freely rotate 360° and zoom.
3. Click once and confirm jump plus hearts; drag and confirm it does not jump.
4. Confirm breathing, blink and all three tail segments animate.
5. Switch to性能模式 and back; confirm the same cat and camera remain selected.
6. Confirm individual high-density cubes and stepped ear, muzzle, chest, paw and tail contours remain visible.
7. Confirm no controls cover the cat in either viewport.

Expected: every item passes and the browser console contains zero errors.

- [ ] **Step 3: Record the 10-second performance gate**

After the 2-second warmup, keep精细模式 visible for at least two completed 5-second windows. Read `.voxel-canvas-wrap.dataset.averageFps`, `.dataset.voxelCount` and `.dataset.detailMode`.

Expected: `detailMode === "detailed"`, voxel count is 8,000–12,000, and the measured window average is at least 45 FPS.

If it is below 45 FPS, change one cause at a time in this order and repeat the same measurement after each change:

1. disable cast shadows only on the three tail instance groups;
2. lower the directional shadow map from 1024 to 512;
3. confirm there are only four main `InstancedMesh` draw groups and no independent mesh per voxel;
4. increase `VOXEL_STEP` only enough to remain at least 20 voxels across the head and update fixed grid bounds consistently.

If it remains below 45 FPS, set `DEFAULT_DETAIL_MODE` to `"performance"`, leave the detailed toggle available, and record the measured FPS in the approved spec.

- [ ] **Step 4: Run the repository-wide completion gate**

Run:

```bash
make check
git diff --check
git status --short --branch
```

Expected: Python tests, Web tests, lint, contracts check, typecheck and builds all pass; `git diff --check` has no errors; only task files plus the pre-existing untracked `.pnpm-store/` and `apps/web/src/app/PixelPetStudio 2.tsx` appear.

- [ ] **Step 5: Record evidence and commit any final tuning**

Update the approved spec with a short “实施验收记录” containing the actual voxel count, 10-second FPS result, final default mode, tested viewports and zero-console-error result. Then run the focused Web tests again and commit only task files:

```bash
git add apps/web/src/app/voxel apps/web/src/app/PixelPetStudio.tsx apps/web/src/app/App.test.tsx apps/web/src/app/styles.css docs/superpowers/specs/2026-07-19-pindou-pet-high-density-voxel-design.md
git commit -m "test: verify high-density voxel cat demo"
```

Do not add `.pnpm-store/` or `apps/web/src/app/PixelPetStudio 2.tsx`.
