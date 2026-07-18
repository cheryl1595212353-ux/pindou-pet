# 拼豆宠物 3D 方块猫 Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首页的 2D 像素图片舞台替换为可旋转、缩放、切换视角并播放待机／点击动画的 Minecraft 风格 3D 方块猫 Demo。

**Architecture:** 使用 React Three Fiber 管理 Three.js 场景，以程序化方块骨架和确定性低分辨率纹理表达五只猫。外观数据、纹理生成、动画采样、相机预设和 WebGL 降级分别保持为可独立测试的模块；首页只负责选择猫和发送相机／点击意图。

**Tech Stack:** React 19、TypeScript、Vite、Three.js、React Three Fiber、Drei、Vitest、Testing Library、Playwright/in-app browser verification。

## Global Constraints

- 首版五只猫必须共用一套方块骨架，只改变颜色、关键花纹和眼睛。
- 首页不再提供上传真实照片、2D 像素颗粒、背景容差和 PNG 下载。
- 正面／侧面／俯视按钮必须控制 3D 相机，而不是切换 2D 图片。
- 水平方向允许完整 360°旋转；禁止相机进入地板、平移模型或穿入模型。
- 正常动态模式必须提供呼吸、4.5 秒周期／120ms 的眨眼、摇尾和 650ms 点击跳跃／爱心。
- 指针总移动距离不超过 5 个 CSS 像素才算点击；拖动不能误触跳跃，跳跃不能叠加。
- 点击反馈必须在下一渲染帧开始，目标延迟小于 200ms。
- 减少动态效果模式停止环境动画、立即切换相机，并只保留低位移爱心反馈。
- WebGL 不可用必须显示明确提示，不能伪装成成功的 2D 结果。
- 不连接后端、不调用生成 API、不上传图片、不引入 GLB／Blender 资产。
- 所有动态纹理、材质、几何体和控制器必须在卸载时释放。

---

## File Structure

- Create `apps/web/src/app/voxel/appearances.ts`: 五套外观、校验和默认回退。
- Create `apps/web/src/app/voxel/appearances.test.ts`: 外观完整性、唯一性和回退测试。
- Create `apps/web/src/app/voxel/texture.ts`: 纯像素展开和 Three CanvasTexture 创建／释放。
- Create `apps/web/src/app/voxel/texture.test.ts`: 纹理像素确定性测试。
- Create `apps/web/src/app/voxel/animation.ts`: 可注入时间的动画状态和采样函数。
- Create `apps/web/src/app/voxel/animation.test.ts`: 待机、眨眼、跳跃和减少动态测试。
- Create `apps/web/src/app/voxel/VoxelCatModel.tsx`: 方块骨架、枢轴和每帧动画应用。
- Create `apps/web/src/app/voxel/camera.ts`: 相机预设和插值数据。
- Create `apps/web/src/app/voxel/camera.test.ts`: 三个预设和时长测试。
- Create `apps/web/src/app/voxel/VoxelCatScene.tsx`: Canvas、相机、灯光、地面、OrbitControls。
- Create `apps/web/src/app/voxel/VoxelCatStage.tsx`: WebGL 探测、错误边界、爱心覆盖层。
- Create `apps/web/src/app/voxel/VoxelCatStage.test.tsx`: 不支持 WebGL 的降级测试。
- Modify `apps/web/src/app/PixelPetStudio.tsx`: 只保留猫选择和相机控制，接入 3D 舞台。
- Modify `apps/web/src/app/App.test.tsx`: 更新首页合同并 mock 重型 WebGL 子树。
- Modify `apps/web/src/app/styles.css`: 3D 舞台、控制器、爱心和移动端布局。
- Modify `apps/web/package.json` and `pnpm-lock.yaml`: 冻结 Three.js/R3F/Drei 依赖。

---

### Task 1: Freeze the 3D dependencies and deterministic appearance contract

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/src/app/voxel/appearances.ts`
- Create: `apps/web/src/app/voxel/appearances.test.ts`
- Create: `apps/web/src/app/voxel/texture.ts`
- Create: `apps/web/src/app/voxel/texture.test.ts`

**Interfaces:**
- Consumes: the five committed demo IDs `cat-01` through `cat-05`.
- Produces: `CatAppearance`, `CAT_APPEARANCES`, `DEFAULT_CAT_ID`, `getCatAppearance(id)`, `validateAppearance(value)`, `buildTexturePixels(pattern, palette)` and `createPixelTexture(pattern, palette)`.

- [ ] **Step 1: Install and freeze repo-compatible 3D packages**

Run:

```bash
pnpm --filter @pindou/web add three @react-three/fiber @react-three/drei
pnpm --filter @pindou/web add --save-dev @types/three
```

Expected: `apps/web/package.json` records direct dependencies and `pnpm-lock.yaml` freezes exact resolved versions with no peer-dependency error against React 19.

- [ ] **Step 2: Write failing appearance tests**

Create `appearances.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  CAT_APPEARANCES,
  DEFAULT_CAT_ID,
  getCatAppearance,
  validateAppearance,
} from "./appearances";

describe("cat appearances", () => {
  it("defines five valid unique demo cats", () => {
    expect(CAT_APPEARANCES).toHaveLength(5);
    expect(new Set(CAT_APPEARANCES.map((cat) => cat.id)).size).toBe(5);
    for (const appearance of CAT_APPEARANCES) {
      expect(() => validateAppearance(appearance)).not.toThrow();
      for (const pattern of Object.values(appearance.patterns)) {
        expect(pattern).toHaveLength(8);
        expect(pattern.every((row) => row.length === 8)).toBe(true);
      }
    }
  });

  it("falls back to the calico appearance", () => {
    expect(getCatAppearance("missing").appearance.id).toBe(DEFAULT_CAT_ID);
    expect(getCatAppearance("missing").didFallback).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to prove RED**

Run:

```bash
pnpm --filter @pindou/web test -- src/app/voxel/appearances.test.ts
```

Expected: FAIL because `./appearances` does not exist.

- [ ] **Step 4: Implement the appearance contract and all five entries**

Create `appearances.ts` with these exact public types and validation rules:

```ts
export const PALETTE_KEYS = ["base", "secondary", "dark", "light", "eye", "nose"] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];
export type PixelPattern = readonly string[];

export interface CatAppearance {
  readonly id: "cat-01" | "cat-02" | "cat-03" | "cat-04" | "cat-05";
  readonly name: string;
  readonly detail: string;
  readonly palette: Readonly<Record<PaletteKey, string>>;
  readonly patterns: Readonly<Record<"face" | "body" | "legs" | "tail", PixelPattern>>;
}

const LEGEND: Readonly<Record<string, PaletteKey>> = { b: "base", s: "secondary", d: "dark", l: "light", e: "eye", n: "nose" };
const PALETTE_SYMBOL: Readonly<Record<PaletteKey, string>> = { base: "b", secondary: "s", dark: "d", light: "l", eye: "e", nose: "n" };
const solid = (key: PaletteKey): PixelPattern => Array.from({ length: 8 }, () => PALETTE_SYMBOL[key].repeat(8));
const rows = (...value: string[]): PixelPattern => value;

export const DEFAULT_CAT_ID: CatAppearance["id"] = "cat-01";

export function validateAppearance(value: CatAppearance): void {
  if (!value.name.trim() || !value.detail.trim()) throw new Error("appearance copy is required");
  for (const key of PALETTE_KEYS) {
    if (!/^#[0-9a-f]{6}$/i.test(value.palette[key])) throw new Error(`invalid color: ${key}`);
  }
  const legal = new Set(Object.keys(LEGEND));
  for (const pattern of Object.values(value.patterns)) {
    if (pattern.length !== 8 || pattern.some((row) => row.length !== 8)) {
      throw new Error("patterns must be 8x8");
    }
    if (pattern.some((row) => [...row].some((cell) => !legal.has(cell)))) {
      throw new Error("pattern contains an unknown palette key");
    }
  }
}
```

Define `CAT_APPEARANCES` with exactly five records and these palettes:

```ts
const cats: readonly CatAppearance[] = [
  { id: "cat-01", name: "小满", detail: "三花短毛", palette: { base: "#eee4cf", secondary: "#d77a32", dark: "#2b2724", light: "#fff8e9", eye: "#85a94e", nose: "#d98983" }, patterns: { face: rows("ddssbssd", "dssbbssd", "ssbbbbss", "sbbbbbbs", "bbbbbbbb", "bbllllbb", "bbbnnbbb", "bbbbbbbb"), body: rows("dddbbsss", "dddbbsss", "ssdbbbss", "ssbbbsss", "bbbsssdd", "bbbsssdd", "bbssssdd", "bbssssdd"), legs: solid("light"), tail: rows("dddddddd", "dddddddd", "ssssssss", "ssssssss", "dddddddd", "dddddddd", "ssssssss", "ssssssss") } },
  { id: "cat-02", name: "橘子", detail: "橘色长毛", palette: { base: "#d98635", secondary: "#ad5b25", dark: "#6f3a22", light: "#f4d09d", eye: "#c8942d", nose: "#d68173" }, patterns: { face: rows("bbssbbss", "bbssbbss", "bbbbbbbb", "ssbbbbss", "bbbbbbbb", "bbllllbb", "bbbnnbbb", "bbbbbbbb"), body: rows("bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss"), legs: rows("bbbbbbbb", "bbbbbbbb", "ssssssss", "ssssssss", "bbbbbbbb", "bbbbbbbb", "llllllll", "llllllll"), tail: rows("bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss") } },
  { id: "cat-03", name: "墨墨", detail: "黑白燕尾服", palette: { base: "#242321", secondary: "#4a4742", dark: "#121212", light: "#f6f0df", eye: "#d7ac36", nose: "#c77e78" }, patterns: { face: rows("bbbbbbbb", "bbbllbbb", "bbbllbbb", "bbbbbbbb", "bbbbbbbb", "bbllllbb", "bbbnnbbb", "bbbllbbb"), body: rows("bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "bbbllbbb", "bbllllbb", "bllllllb", "bllllllb", "bbbbbbbb"), legs: rows("bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "llllllll", "llllllll", "llllllll"), tail: solid("base") } },
  { id: "cat-04", name: "银豆", detail: "银灰英短", palette: { base: "#a8a6a0", secondary: "#77756f", dark: "#45443f", light: "#dedbd1", eye: "#cc7f27", nose: "#a96867" }, patterns: { face: rows("bbssbbss", "bbssbbss", "ssbbbbss", "bbbbbbbb", "ssbbbbss", "bbllllbb", "bbbnnbbb", "bbbbbbbb"), body: rows("bbbbbbbb", "ssssssss", "bbbbbbbb", "bbssssbb", "bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss"), legs: rows("bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss", "llllllll", "llllllll"), tail: rows("bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss", "bbbbbbbb", "ssssssss", "bbbbbbbb", "dddddddd") } },
  { id: "cat-05", name: "奶盖", detail: "奶油布偶", palette: { base: "#e5d1ac", secondary: "#9a7351", dark: "#4f392e", light: "#f9f1df", eye: "#5b9fd1", nose: "#9d6865" }, patterns: { face: rows("ssddddss", "sdddddds", "sdddddds", "ssddddss", "bbbssbbb", "bbllllbb", "bbbnnbbb", "bbbbbbbb"), body: rows("bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "bbllllbb", "bbllllbb"), legs: rows("bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "bbbbbbbb", "llllllll", "llllllll", "llllllll", "llllllll"), tail: solid("dark") } },
];

for (const cat of cats) validateAppearance(cat);
export const CAT_APPEARANCES = cats;

export function getCatAppearance(id: string): { appearance: CatAppearance; didFallback: boolean } {
  const appearance = cats.find((cat) => cat.id === id);
  return appearance === undefined
    ? { appearance: cats[0], didFallback: true }
    : { appearance, didFallback: false };
}
```

Use the same unambiguous legend in `texture.ts`; never derive legend keys from palette-name initials.

- [ ] **Step 5: Write failing deterministic pixel tests**

Create `texture.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildTexturePixels } from "./texture";

describe("buildTexturePixels", () => {
  it("expands a pattern deterministically with opaque pixels", () => {
    const palette = { base: "#112233", secondary: "#445566", dark: "#000000", light: "#ffffff", eye: "#00ff00", nose: "#ff8888" } as const;
    const pattern = Array.from({ length: 8 }, () => "bbbbbbbb");
    const first = buildTexturePixels(pattern, palette);
    const second = buildTexturePixels(pattern, palette);
    expect(first).toEqual(second);
    expect([...first.slice(0, 4)]).toEqual([0x11, 0x22, 0x33, 0xff]);
    expect(first).toHaveLength(8 * 8 * 4);
  });
});
```

- [ ] **Step 6: Run the pixel test to prove RED**

Run: `pnpm --filter @pindou/web test -- src/app/voxel/texture.test.ts`
Expected: FAIL because `./texture` does not exist.

- [ ] **Step 7: Implement pure pixels and a nearest-neighbor CanvasTexture**

Create `texture.ts`:

```ts
import { CanvasTexture, NearestFilter, SRGBColorSpace } from "three";
import type { PaletteKey, PixelPattern } from "./appearances";

const LEGEND: Readonly<Record<string, PaletteKey>> = { b: "base", s: "secondary", d: "dark", l: "light", e: "eye", n: "nose" };

function rgb(hex: string): readonly [number, number, number] {
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)];
}

export function buildTexturePixels(pattern: PixelPattern, palette: Readonly<Record<PaletteKey, string>>): Uint8ClampedArray {
  const output = new Uint8ClampedArray(8 * 8 * 4);
  pattern.forEach((row, y) => [...row].forEach((cell, x) => {
    const [r, g, b] = rgb(palette[LEGEND[cell]]);
    const offset = (y * 8 + x) * 4;
    output.set([r, g, b, 255], offset);
  }));
  return output;
}

export function createPixelTexture(pattern: PixelPattern, palette: Readonly<Record<PaletteKey, string>>): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("2D canvas is unavailable for texture generation");
  context.putImageData(new ImageData(buildTexturePixels(pattern, palette), 8, 8), 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
```

- [ ] **Step 8: Run focused and full Web checks**

Run:

```bash
pnpm --filter @pindou/web test -- src/app/voxel/appearances.test.ts src/app/voxel/texture.test.ts
pnpm --filter @pindou/web typecheck
pnpm --filter @pindou/web build
```

Expected: all focused tests pass; typecheck and production build exit `0`.

- [ ] **Step 9: Commit Task 1**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/app/voxel/appearances.ts apps/web/src/app/voxel/appearances.test.ts apps/web/src/app/voxel/texture.ts apps/web/src/app/voxel/texture.test.ts
git commit -m "feat: define voxel cat appearances"
```

---

### Task 2: Implement deterministic motion and the reusable block rig

**Files:**
- Create: `apps/web/src/app/voxel/animation.ts`
- Create: `apps/web/src/app/voxel/animation.test.ts`
- Create: `apps/web/src/app/voxel/VoxelCatModel.tsx`

**Interfaces:**
- Consumes: `CatAppearance`, `createPixelTexture`.
- Produces: `AnimationState`, `CatMotion`, `startJump(state, nowMs)`, `sampleCatMotion(state, nowMs, reducedMotion)` and `<VoxelCatModel appearance reducedMotion onHeartChange />`.

- [ ] **Step 1: Write the failing animation tests**

Create `animation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { idleState, sampleCatMotion, startJump } from "./animation";

describe("cat animation", () => {
  it("samples deterministic idle motion and blink", () => {
    expect(sampleCatMotion(idleState(), 0, false).blinkClosed).toBe(false);
    expect(sampleCatMotion(idleState(), 4_400, false).blinkClosed).toBe(false);
    expect(sampleCatMotion(idleState(), 4_450, false).blinkClosed).toBe(true);
  });

  it("runs one 650ms jump and refuses stacking", () => {
    const jumping = startJump(idleState(), 100);
    expect(startJump(jumping, 200)).toEqual(jumping);
    expect(sampleCatMotion(jumping, 425, false).rootY).toBeGreaterThan(0);
    expect(sampleCatMotion(jumping, 750, false).nextState.kind).toBe("IDLE");
  });

  it("removes ambient and displacement motion when requested", () => {
    const motion = sampleCatMotion(startJump(idleState(), 0), 200, true);
    expect(motion.rootY).toBe(0);
    expect(motion.tailAngles).toEqual([0, 0, 0]);
    expect(motion.heartVisible).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to prove RED**

Run: `pnpm --filter @pindou/web test -- src/app/voxel/animation.test.ts`
Expected: FAIL because `./animation` does not exist.

- [ ] **Step 3: Implement the pure state sampler**

Create `animation.ts` with these exact exported shapes:

```ts
export type AnimationState = { readonly kind: "IDLE" } | { readonly kind: "JUMPING"; readonly startedAtMs: number };
export interface CatMotion {
  readonly nextState: AnimationState;
  readonly rootY: number;
  readonly breathScaleY: number;
  readonly blinkClosed: boolean;
  readonly tailAngles: readonly [number, number, number];
  readonly heartVisible: boolean;
  readonly heartProgress: number;
}

export const idleState = (): AnimationState => ({ kind: "IDLE" });
export function startJump(state: AnimationState, nowMs: number): AnimationState {
  return state.kind === "JUMPING" ? state : { kind: "JUMPING", startedAtMs: nowMs };
}

export function sampleCatMotion(state: AnimationState, nowMs: number, reducedMotion: boolean): CatMotion {
  const elapsed = state.kind === "JUMPING" ? Math.max(0, nowMs - state.startedAtMs) : 0;
  const progress = Math.min(1, elapsed / 650);
  const nextState = state.kind === "JUMPING" && progress >= 1 ? idleState() : state;
  if (reducedMotion) return { nextState, rootY: 0, breathScaleY: 1, blinkClosed: false, tailAngles: [0, 0, 0], heartVisible: state.kind === "JUMPING" && progress < 1, heartProgress: progress };
  const blinkPhase = nowMs % 4_500;
  return {
    nextState,
    rootY: state.kind === "JUMPING" ? Math.sin(Math.PI * progress) * 0.9 : 0,
    breathScaleY: 1 + Math.sin(nowMs / 900) * 0.015,
    blinkClosed: blinkPhase >= 4_380,
    tailAngles: [Math.sin(nowMs / 700) * 0.28, Math.sin(nowMs / 700 + 0.45) * 0.22, Math.sin(nowMs / 700 + 0.9) * 0.16],
    heartVisible: state.kind === "JUMPING" && progress < 1,
    heartProgress: progress,
  };
}
```

- [ ] **Step 4: Run animation tests GREEN**

Run: `pnpm --filter @pindou/web test -- src/app/voxel/animation.test.ts`
Expected: PASS.

- [ ] **Step 5: Build the block hierarchy**

Create `VoxelCatModel.tsx`. Use one root group and explicit refs for `bodyPivot`, both eyes and all three tail groups. Memoize four textures per appearance and dispose them in the memo cleanup owner. Use `useFrame(({ clock }) => ...)` to sample `sampleCatMotion` and apply only numeric transforms. Required dimensions and positions:

```tsx
const PARTS = {
  body: { size: [3.8, 2.1, 2.0], position: [0, 2.45, 0] },
  head: { size: [2.1, 2.0, 2.0], position: [-2.55, 3.15, 0] },
  muzzle: { size: [0.55, 0.65, 1.15], position: [-3.58, 2.9, 0] },
  ears: { size: [0.62, 0.72, 0.62] },
  legs: { size: [0.72, 1.9, 0.72] },
  tail: { size: [1.45, 0.42, 0.42] },
} as const;
```

Place front legs at X `-1.25`, rear legs at X `1.25`, left/right Z at `-0.62/0.62`; place the head toward negative X so the default front camera views the face. Create eye planes/cuboids on the head-facing X surface, with green/yellow/copper/blue material from `appearance.palette.eye`; hide the open-eye meshes and show a one-pixel dark line while `blinkClosed` is true. Put `userData.part` on every named root mesh/group so browser verification can count required parts.

Pointer handling must store `clientX/clientY` on pointer down and call `startJump` only when the pointer-up Euclidean distance is `<= 5`. Call `event.stopPropagation()` only for a qualified click so OrbitControls continues receiving drag input.

Expose:

```ts
interface VoxelCatModelProps {
  readonly appearance: CatAppearance;
  readonly reducedMotion: boolean;
  readonly onHeartChange: (visible: boolean, progress: number) => void;
}
```

- [ ] **Step 6: Run focused tests, typecheck and build**

Run:

```bash
pnpm --filter @pindou/web test -- src/app/voxel
pnpm --filter @pindou/web typecheck
pnpm --filter @pindou/web build
```

Expected: all voxel unit tests pass, no type errors, build exits `0`.

- [ ] **Step 7: Commit Task 2**

```bash
git add apps/web/src/app/voxel/animation.ts apps/web/src/app/voxel/animation.test.ts apps/web/src/app/voxel/VoxelCatModel.tsx
git commit -m "feat: build animated voxel cat rig"
```

---

### Task 3: Add the WebGL scene, camera presets, controls and failure boundary

**Files:**
- Create: `apps/web/src/app/voxel/camera.ts`
- Create: `apps/web/src/app/voxel/camera.test.ts`
- Create: `apps/web/src/app/voxel/VoxelCatScene.tsx`
- Create: `apps/web/src/app/voxel/VoxelCatStage.tsx`
- Create: `apps/web/src/app/voxel/VoxelCatStage.test.tsx`

**Interfaces:**
- Consumes: `CatAppearance`, `<VoxelCatModel />`.
- Produces: `CameraPreset`, `CAMERA_PRESETS`, `<VoxelCatScene appearance cameraPreset reducedMotion onHeartChange />`, `detectWebGLSupport()` and `<VoxelCatStage appearance cameraPreset />`.

- [ ] **Step 1: Write failing camera and fallback tests**

Create `camera.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CAMERA_PRESETS } from "./camera";

describe("camera presets", () => {
  it("defines front, side and top with the approved duration", () => {
    expect(Object.keys(CAMERA_PRESETS)).toEqual(["front", "side", "top"]);
    expect(CAMERA_PRESETS.front.durationMs).toBe(350);
    expect(CAMERA_PRESETS.side.position[0]).toBeGreaterThan(0);
    expect(CAMERA_PRESETS.top.position[1]).toBeGreaterThan(8);
  });
});
```

Create `VoxelCatStage.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getCatAppearance } from "./appearances";
import { VoxelCatStage } from "./VoxelCatStage";

describe("VoxelCatStage", () => {
  it("shows an accessible WebGL failure", () => {
    render(<VoxelCatStage appearance={getCatAppearance("cat-01").appearance} cameraPreset="front" webglSupported={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("当前浏览器不支持 3D");
  });
});
```

- [ ] **Step 2: Run tests RED**

Run: `pnpm --filter @pindou/web test -- src/app/voxel/camera.test.ts src/app/voxel/VoxelCatStage.test.tsx`
Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement camera data and the scene**

Create `camera.ts`:

```ts
export type CameraPreset = "front" | "side" | "top";
export interface CameraTarget { readonly position: readonly [number, number, number]; readonly lookAt: readonly [number, number, number]; readonly durationMs: 350; }
export const CAMERA_PRESETS: Readonly<Record<CameraPreset, CameraTarget>> = {
  front: { position: [-9.5, 4.0, 0], lookAt: [0, 2.2, 0], durationMs: 350 },
  side: { position: [0, 4.0, 9.5], lookAt: [0, 2.2, 0], durationMs: 350 },
  top: { position: [0, 11.5, 0.01], lookAt: [0, 2.0, 0], durationMs: 350 },
};
```

Create `VoxelCatScene.tsx` with a full-size R3F `<Canvas>` using shadows, `dpr={[1, 1.5]}`, FOV `38`, warm background, ambient light, directional light and a matte ground plane. `CameraController` owns Drei `<OrbitControls>` with `enablePan={false}`, `minDistance={6}`, `maxDistance={14}`, `minPolarAngle={0.08}`, `maxPolarAngle={Math.PI / 2 - 0.06}`. When `cameraPreset` changes, capture the current camera/target and interpolate both with a cubic ease-out for 350ms; use an immediate assignment when `reducedMotion` is true. Do not create more than one controls instance or render loop.

- [ ] **Step 4: Implement WebGL detection and local error boundary**

Create `VoxelCatStage.tsx`:

```tsx
import { Component, type ReactNode } from "react";
import type { CatAppearance } from "./appearances";
import type { CameraPreset } from "./camera";
import { VoxelCatScene } from "./VoxelCatScene";

export function detectWebGLSupport(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return canvas.getContext("webgl2") !== null || canvas.getContext("webgl") !== null;
  } catch {
    return false;
  }
}

class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <SceneFailure /> : this.props.children; }
}

function SceneFailure() {
  return <div className="webgl-failure" role="status"><strong>当前浏览器不支持 3D</strong><span>请开启硬件加速或更换现代浏览器。</span></div>;
}

export function VoxelCatStage({ appearance, cameraPreset, webglSupported = detectWebGLSupport() }: { appearance: CatAppearance; cameraPreset: CameraPreset; webglSupported?: boolean }) {
  if (!webglSupported) return <SceneFailure />;
  return (
    <SceneErrorBoundary>
      <VoxelCatScene
        appearance={appearance}
        cameraPreset={cameraPreset}
        reducedMotion={reducedMotion}
        onHeartChange={handleHeartChange}
      />
      {heartVisible && <div className="voxel-hearts" aria-label="宠物很开心">♥ ♥</div>}
    </SceneErrorBoundary>
  );
}
```

The abbreviated return above assumes `reducedMotion`, `heartVisible` and `handleHeartChange` are implemented in the component. Add reduced-motion detection inside the stage with `matchMedia("(prefers-reduced-motion: reduce)")`, including a change listener and cleanup. Keep heart visibility in stage state so the DOM overlay remains accessible and visually crisp above WebGL; `handleHeartChange` updates visibility without forcing unrelated scene reconstruction.

- [ ] **Step 5: Run focused tests and Web build**

Run:

```bash
pnpm --filter @pindou/web test -- src/app/voxel
pnpm --filter @pindou/web typecheck
pnpm --filter @pindou/web build
```

Expected: focused tests pass; typecheck/build exit `0`.

- [ ] **Step 6: Commit Task 3**

```bash
git add apps/web/src/app/voxel/camera.ts apps/web/src/app/voxel/camera.test.ts apps/web/src/app/voxel/VoxelCatScene.tsx apps/web/src/app/voxel/VoxelCatStage.tsx apps/web/src/app/voxel/VoxelCatStage.test.tsx
git commit -m "feat: add voxel cat 3d stage"
```

---

### Task 4: Replace the 2D studio, verify the real browser experience and finish

**Files:**
- Modify: `apps/web/src/app/PixelPetStudio.tsx`
- Modify: `apps/web/src/app/App.test.tsx`
- Modify: `apps/web/src/app/styles.css`
- Delete only after imports are gone: obsolete 2D canvas processing code inside `PixelPetStudio.tsx` (not the committed demo-cat photos).

**Interfaces:**
- Consumes: `CAT_APPEARANCES`, `getCatAppearance`, `CameraPreset`, `<VoxelCatStage />`.
- Produces: the usable `/` 3D Demo with five cat choices and three camera choices.

- [ ] **Step 1: Update the failing page contract**

In `App.test.tsx`, mock only the WebGL subtree and assert the public UI:

```tsx
vi.mock("./voxel/VoxelCatStage", () => ({
  VoxelCatStage: ({ appearance }: { appearance: { name: string } }) => <div data-testid="voxel-stage">{appearance.name} 3D</div>,
}));

it("renders the five-cat 3D studio", () => {
  render(<App initialPath="/" />);
  expect(screen.getByRole("heading", { name: "和方块宠物见面" })).toBeVisible();
  expect(screen.getAllByRole("button", { name: /测试猫：/ })).toHaveLength(5);
  expect(screen.getByTestId("voxel-stage")).toHaveTextContent("小满 3D");
  expect(screen.queryByLabelText("上传宠物图片")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "正面视角" })).toHaveAttribute("aria-pressed", "true");
});
```

Add a second test that clicks `测试猫：奶盖，奶油布偶` and `俯视视角`, then expects the mock stage to show `奶盖 3D` and the top button to have `aria-pressed="true"`.

- [ ] **Step 2: Run the page test RED**

Run: `pnpm --filter @pindou/web test -- src/app/App.test.tsx`
Expected: FAIL because the old 2D copy/upload controls are still present.

- [ ] **Step 3: Refactor `PixelPetStudio` into a thin 3D coordinator**

Replace image loading, quantization, canvas drawing, background removal, PNG download and 2D animation state with:

```tsx
const [selectedCatId, setSelectedCatId] = useState(DEFAULT_CAT_ID);
const [cameraPreset, setCameraPreset] = useState<CameraPreset>("front");
const { appearance, didFallback } = getCatAppearance(selectedCatId);

return (
  <section className="studio" aria-label="3D 方块宠物工作台">
    <aside className="studio-controls">
      <p className="eyebrow">本地 3D 体验 · 五只测试猫</p>
      <h1>和方块宠物见面</h1>
      <p className="studio-intro">拖动旋转、滚轮缩放，点击它会跳起来。</p>
      <CatLibrary selectedCatId={selectedCatId} onSelect={setSelectedCatId} />
      <div className="angle-switcher" aria-label="3D 相机视角">
        {(["front", "side", "top"] as const).map((preset) => (
          <button key={preset} type="button" aria-label={`${{ front: "正面", side: "侧面", top: "俯视" }[preset]}视角`} aria-pressed={cameraPreset === preset} onClick={() => setCameraPreset(preset)}>
            {{ front: "正面", side: "侧面", top: "俯视" }[preset]}
          </button>
        ))}
      </div>
      {didFallback && <p className="appearance-warning" role="status">外观配置无效，已使用默认三花。</p>}
      <div className="interaction-guide"><span>拖动</span><strong>旋转 360°</strong><span>滚轮 / 双指</span><strong>缩放</strong><span>点击</span><strong>跳跃互动</strong></div>
    </aside>
    <div className="studio-stage voxel-stage-shell">
      <div className="stage-toolbar"><span>VOXEL ROOM / 3D</span><span className="status ready">可以互动</span></div>
      <VoxelCatStage appearance={appearance} cameraPreset={cameraPreset} />
      <p className="interaction-hint">拖动看全身，点击和它打招呼</p>
    </div>
  </section>
);
```

Keep `CatLibrary` in the same file unless extracting it is necessary to keep `PixelPetStudio.tsx` under roughly 180 lines. It must use the existing fifteen images only as thumbnails; no image decoding occurs in the 3D path.

- [ ] **Step 4: Replace 2D-only styles with 3D stage styles**

Remove `.upload-button`, `.control-group`, `.toggle-row`, `.download-button`, `.pet-canvas-button`, `.canvas-wrap`, `.empty-stage` and `@keyframes pet-bounce`. Add:

```css
.voxel-stage-shell { min-height: calc(100svh - 66px); }
.voxel-canvas-wrap { position: relative; min-height: 0; width: 100%; height: 100%; }
.voxel-canvas-wrap canvas { display: block; width: 100% !important; height: 100% !important; touch-action: none; }
.interaction-guide { display: grid; grid-template-columns: auto 1fr; gap: 9px 16px; margin-top: 22px; padding-top: 18px; border-top: 1px solid rgb(37 31 26 / 22%); font-size: 12px; }
.interaction-guide span { color: #8a7d70; }
.webgl-failure { display: grid; min-height: 360px; place-content: center; gap: 8px; text-align: center; }
.webgl-failure span { color: #6b6056; font-size: 13px; }
.voxel-hearts { position: absolute; inset: 22% auto auto 50%; pointer-events: none; transform: translateX(-50%); }
```

At `max-width: 800px`, give the stage `min-height: 68svh`, keep the canvas at least `430px` high and preserve touch rotation. Existing topbar and five-cat strip remain responsive.

- [ ] **Step 5: Run automated verification**

Run:

```bash
pnpm --filter @pindou/web test
pnpm --filter @pindou/web typecheck
pnpm --filter @pindou/web build
git diff --check
```

Expected: all Web tests pass; typecheck/build exit `0`; no whitespace errors.

- [ ] **Step 6: Run real-browser acceptance**

Start or reuse the Vite server and verify at `http://127.0.0.1:5173/`:

1. The default calico 3D cat is visible and made from block geometry.
2. Drag rotates horizontally through 360° without triggering a jump.
3. Wheel zoom respects min/max distance and cannot enter the mesh.
4. Front/side/top buttons move the camera and remain freely rotatable afterward.
5. Each of five cats changes palette, face/body pattern and eye color without replacing the Canvas.
6. Idle breathing, deterministic blink and segmented tail motion are visible.
7. A click starts one jump and DOM hearts in the next frame; repeated clicks during 650ms do not stack.
8. Resize to a mobile-width viewport and confirm the stage remains usable.
9. Capture console errors and require an empty result.
10. Record a 10-second normal interaction sample and require observed average frame rate `>=30` on the development Mac.

- [ ] **Step 7: Run the full repository gate**

Run: `make check`
Expected: Python tests, Web tests, contracts, typecheck and production build all pass; the Redis integration test may remain explicitly skipped under the established Phase 0 rule.

- [ ] **Step 8: Commit Task 4**

```bash
git add apps/web/src/app/PixelPetStudio.tsx apps/web/src/app/App.test.tsx apps/web/src/app/styles.css
git commit -m "feat: ship interactive voxel cat demo"
```

- [ ] **Step 9: Final branch review and push**

Review the complete diff from `2b1aa3b` through HEAD against `docs/superpowers/specs/2026-07-19-pindou-pet-voxel-3d-demo-design.md`. Fix every material finding, rerun `make check`, confirm `git status --short` contains only the pre-existing `.pnpm-store/`, then push `codex/usable-pixel-pet-demo`.
