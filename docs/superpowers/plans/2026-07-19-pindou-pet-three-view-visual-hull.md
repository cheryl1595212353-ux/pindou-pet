# Three-View Personalized Voxel Cat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared fixed cat outline with locally generated, photo-colored voxel silhouettes derived from each built-in cat's front, side, and top images, including manual mask and proportion correction.

**Architecture:** Pure raster, mask, palette, and visual-hull modules turn three normalized image views into detailed and performance voxel models. A cached React hook owns asynchronous image loading, while a focused correction panel edits masks and bounded shape parameters; the existing Three.js scene receives a ready model and preserves its animation and interaction rig.

**Tech Stack:** React 19, TypeScript 5.9, Three.js 0.185, React Three Fiber 9, HTML Canvas, Vitest, Testing Library, Playwright browser acceptance.

## Global Constraints

- Use only the existing five cats and 15 local images; add no upload flow, paid API, cloud inference, or new runtime dependency.
- Normalize `cat-01` and `cat-02` top views from head-at-top; normalize `cat-03` through `cat-05` from head-at-bottom.
- Detailed grid is `56×48×24`; performance grid is `36×32×16`.
- Quantized photo palette contains at most 16 colors.
- Manual proportion controls are bounded to `80%–120%`.
- Main body and each animated tail segment use `InstancedMesh`, never one React element per voxel.
- Preserve current camera presets, drag, zoom, click jump, hearts, breathing, blinking, tail motion, reduced-motion behavior, WebGL fallback, and low-FPS warning.
- Preserve untracked `.pnpm-store/` and `apps/web/src/app/PixelPetStudio 2.tsx`; never stage them.

---

### Task 1: Deterministic raster masks and correction primitives

**Files:**
- Create: `apps/web/src/app/voxel/threeViewTypes.ts`
- Create: `apps/web/src/app/voxel/threeViewRaster.ts`
- Test: `apps/web/src/app/voxel/threeViewRaster.test.ts`

**Interfaces:**
- Consumes: browser RGBA pixels and `CatViewName` orientation metadata.
- Produces: `BinaryMask`, `NormalizedCatView`, `extractForegroundMask`, `normalizeCatView`, `dilateMask`, `paintMask`, `loadImageRgba`.

- [ ] **Step 1: Define shared immutable types**

```ts
export type CatViewName = "front" | "side" | "top";
export interface BinaryMask { readonly width: number; readonly height: number; readonly data: Uint8Array; }
export interface RgbaRaster { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray; }
export interface NormalizedCatView extends BinaryMask {
  readonly rgba: Uint8ClampedArray;
  readonly sourceMask: Uint8Array;
}
export interface MaskStroke { readonly x: number; readonly y: number; readonly radius: number; readonly value: 0 | 1; }
export interface ShapeCorrections {
  readonly headWidth: number;
  readonly bodyLength: number;
  readonly legLength: number;
  readonly earHeight: number;
  readonly tailThickness: number;
}
export const DEFAULT_SHAPE_CORRECTIONS: ShapeCorrections = {
  headWidth: 1, bodyLength: 1, legLength: 1, earHeight: 1, tailThickness: 1,
};
```

- [ ] **Step 2: Write failing mask tests**

Tests must construct small synthetic RGBA rasters and assert:

```ts
it("keeps the centered subject and rejects white border noise", () => {
  const raster = makeRaster(9, 9, "#faf8f4", [rect(3, 2, 3, 6, "#46372e")]);
  const mask = extractForegroundMask(raster);
  expect(mask.data[indexOf(mask, 4, 4)]).toBe(1);
  expect(mask.data[indexOf(mask, 0, 0)]).toBe(0);
});

it("paints and erases a bounded circular mask stroke", () => {
  const added = paintMask(emptyMask(7, 7), { x: 3, y: 3, radius: 1, value: 1 });
  const erased = paintMask(added, { x: 3, y: 3, radius: 0, value: 0 });
  expect(countMask(added)).toBe(5);
  expect(countMask(erased)).toBe(4);
});
```

- [ ] **Step 3: Run the tests and confirm red state**

Run: `pnpm --filter @pindou/web exec vitest run src/app/voxel/threeViewRaster.test.ts`  
Expected: FAIL because the module and functions do not exist.

- [ ] **Step 4: Implement the minimum raster pipeline**

`extractForegroundMask` must estimate the border median color, create strong and weak foreground thresholds, keep weak cells connected to strong cells, close one-cell gaps, fill interior holes, and retain the largest non-border component. `normalizeCatView` must crop the foreground bounds, optionally flip a top view by 180 degrees, and nearest-neighbor resample mask and RGBA arrays to the requested dimensions. `loadImageRgba` must downscale the longest edge to 192 pixels through an offscreen canvas before returning pixels.

```ts
export function normalizeCatView(
  raster: RgbaRaster,
  target: { readonly width: number; readonly height: number },
  rotate180 = false,
): NormalizedCatView;

export function paintMask(mask: BinaryMask, stroke: MaskStroke): BinaryMask;
export function dilateMask(mask: BinaryMask, radius?: number): BinaryMask;
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @pindou/web exec vitest run src/app/voxel/threeViewRaster.test.ts`  
Expected: all raster tests PASS.

```bash
git add apps/web/src/app/voxel/threeViewTypes.ts apps/web/src/app/voxel/threeViewRaster.ts apps/web/src/app/voxel/threeViewRaster.test.ts
git commit -m "feat: extract editable three-view silhouettes"
```

---

### Task 2: Photo palette and three-view visual hull

**Files:**
- Create: `apps/web/src/app/voxel/photoPalette.ts`
- Create: `apps/web/src/app/voxel/visualHull.ts`
- Test: `apps/web/src/app/voxel/photoPalette.test.ts`
- Test: `apps/web/src/app/voxel/visualHull.test.ts`

**Interfaces:**
- Consumes: three `NormalizedCatView` values, `CatAppearance`, `ShapeCorrections`, and `VoxelResolution`.
- Produces: `PersonalizedVoxelModel`, `buildPersonalizedVoxelModel`, `quantizePhotoPalette`, `applyShapeCorrections`.

- [ ] **Step 1: Write failing deterministic palette tests**

```ts
it("creates no more than sixteen stable colors", () => {
  const first = quantizePhotoPalette(samplePixels, 16);
  const second = quantizePhotoPalette(samplePixels, 16);
  expect(first).toEqual(second);
  expect(first.length).toBeLessThanOrEqual(16);
});
```

Use deterministic median-cut buckets ordered by RGB range and original index; do not add a color library.

- [ ] **Step 2: Write failing visual-hull tests**

Define the public types exactly:

```ts
export interface VoxelResolution { readonly length: number; readonly height: number; readonly width: number; }
export interface PersonalizedVoxelCell { readonly grid: readonly [number, number, number]; readonly position: readonly [number, number, number]; readonly color: string; }
export interface ModelAnchors {
  readonly faceX: number; readonly eyeY: number; readonly eyeZ: number;
  readonly noseY: number; readonly tailPivot: readonly [number, number, number];
  readonly tailNextPivotX: number;
}
export interface PersonalizedVoxelModel {
  readonly main: readonly PersonalizedVoxelCell[];
  readonly tailSegment: readonly PersonalizedVoxelCell[];
  readonly anchors: ModelAnchors;
  readonly bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number]; };
  readonly palette: readonly string[];
}
```

Tests must prove that a narrower front mask reduces model width, a shorter side mask reduces model length, all returned main cells are surface cells, performance mode has fewer cells, and changing `headWidth` affects only the front/high region.

- [ ] **Step 3: Run tests and confirm red state**

Run: `pnpm --filter @pindou/web exec vitest run src/app/voxel/photoPalette.test.ts src/app/voxel/visualHull.test.ts`  
Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement visual-hull occupancy and surface extraction**

```ts
export const DETAILED_RESOLUTION = { length: 56, height: 48, width: 24 } as const;
export const PERFORMANCE_RESOLUTION = { length: 36, height: 32, width: 16 } as const;

export function buildPersonalizedVoxelModel(args: {
  readonly views: Readonly<Record<CatViewName, NormalizedCatView>>;
  readonly appearance: CatAppearance;
  readonly corrections: ShapeCorrections;
  readonly resolution: VoxelResolution;
}): PersonalizedVoxelModel;
```

The implementation must dilate each view once, map `(x,y,z)` into the three masks, require all three projections, keep the largest connected component plus leg components touching `y=0`, remove cells with six occupied neighbors, quantize colors, calculate proportional face anchors, and generate a three-segment-compatible tail prism from the normalized top-view tail measurements. Reject empty models and models outside `400–20_000` surface cells.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @pindou/web exec vitest run src/app/voxel/photoPalette.test.ts src/app/voxel/visualHull.test.ts`  
Expected: all palette and visual-hull tests PASS.

```bash
git add apps/web/src/app/voxel/photoPalette.ts apps/web/src/app/voxel/photoPalette.test.ts apps/web/src/app/voxel/visualHull.ts apps/web/src/app/voxel/visualHull.test.ts
git commit -m "feat: carve photo-driven voxel silhouettes"
```

---

### Task 3: Built-in image metadata, cache, and React model hook

**Files:**
- Create: `apps/web/src/app/voxel/threeViewAssets.ts`
- Create: `apps/web/src/app/voxel/useThreeViewCatModel.ts`
- Test: `apps/web/src/app/voxel/threeViewAssets.test.ts`
- Test: `apps/web/src/app/voxel/useThreeViewCatModel.test.tsx`

**Interfaces:**
- Consumes: `CatId`, `CatAppearance`, per-cat mask overrides, and shape corrections.
- Produces: `CAT_THREE_VIEW_ASSETS`, `loadNormalizedCatViews`, `useThreeViewCatModel`.

- [ ] **Step 1: Lock resource direction metadata with a failing test**

```ts
expect(CAT_THREE_VIEW_ASSETS["cat-01"].topHeadAt).toBe("start");
expect(CAT_THREE_VIEW_ASSETS["cat-02"].topHeadAt).toBe("start");
for (const id of ["cat-03", "cat-04", "cat-05"] as const) {
  expect(CAT_THREE_VIEW_ASSETS[id].topHeadAt).toBe("end");
}
```

Every record must provide exact `/demo-cats/<id>/<view>.png` paths.

- [ ] **Step 2: Write hook state tests**

Mock `loadImageRgba` and assert the hook transitions `loading → ready`, returns both detailed and performance models, reuses a module-level per-cat Promise cache, rebuilds after a new mask override, and returns `error` without discarding the last valid model.

```ts
export interface ThreeViewCatModelState {
  readonly status: "loading" | "ready" | "error";
  readonly views: Readonly<Record<CatViewName, NormalizedCatView>> | null;
  readonly detailed: PersonalizedVoxelModel | null;
  readonly performance: PersonalizedVoxelModel | null;
  readonly message: string | null;
}
```

- [ ] **Step 3: Confirm red state**

Run: `pnpm --filter @pindou/web exec vitest run src/app/voxel/threeViewAssets.test.ts src/app/voxel/useThreeViewCatModel.test.tsx`  
Expected: FAIL because the asset registry and hook do not exist.

- [ ] **Step 4: Implement loading, normalization, overrides, and caching**

`loadNormalizedCatViews` must load all three images concurrently, normalize top orientation from metadata, remove the thin tail from the body masks while retaining tail measurements, and return immutable views. `useThreeViewCatModel` applies optional cloned mask overrides, builds detailed and performance models in `useMemo`, and preserves the last valid state through a failed edit.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @pindou/web exec vitest run src/app/voxel/threeViewAssets.test.ts src/app/voxel/useThreeViewCatModel.test.tsx`  
Expected: all hook and metadata tests PASS.

```bash
git add apps/web/src/app/voxel/threeViewAssets.ts apps/web/src/app/voxel/threeViewAssets.test.ts apps/web/src/app/voxel/useThreeViewCatModel.ts apps/web/src/app/voxel/useThreeViewCatModel.test.tsx
git commit -m "feat: load cached three-view cat models"
```

---

### Task 4: Personalized InstancedMesh renderer and existing rig integration

**Files:**
- Create: `apps/web/src/app/voxel/PersonalizedVoxelBody.tsx`
- Test: `apps/web/src/app/voxel/PersonalizedVoxelBody.test.ts`
- Modify: `apps/web/src/app/voxel/VoxelCatModel.tsx`
- Modify: `apps/web/src/app/voxel/VoxelCatModel.test.tsx`
- Modify: `apps/web/src/app/voxel/VoxelCatScene.tsx`
- Modify: `apps/web/src/app/voxel/VoxelCatStage.tsx`
- Modify: `apps/web/src/app/voxel/VoxelCatStage.test.tsx`

**Interfaces:**
- Consumes: one `PersonalizedVoxelModel`, `CatAppearance`, and existing `AnimatedVoxelRefs`.
- Produces: an animated personalized body with one main instance group and three tail instance groups.

- [ ] **Step 1: Write failing descriptor and component tests**

```ts
it("preserves personalized positions and colors", () => {
  expect(createPersonalizedDescriptors(model.main)).toEqual(
    model.main.map(({ position, color }) => ({ position, color })),
  );
});
```

Update `VoxelCatModel.test.tsx` so both `detailed` and `performance` render `PersonalizedVoxelBody` when a personalized model is present, while a missing or failed personalized model keeps the old fixed fallback.

- [ ] **Step 2: Confirm red state**

Run: `pnpm --filter @pindou/web exec vitest run src/app/voxel/PersonalizedVoxelBody.test.ts src/app/voxel/VoxelCatModel.test.tsx src/app/voxel/VoxelCatStage.test.tsx`  
Expected: FAIL because personalized rendering props are absent.

- [ ] **Step 3: Implement the renderer**

Use one shared `BoxGeometry(0.094, 0.094, 0.094)` and a `MeshStandardMaterial` with instance colors. Set `instanceMatrix` and `instanceColor` once per model. Derive eye, blink, and nose positions from `model.anchors`. Place the first tail group at `tailPivot` and nested groups at `tailNextPivotX`, reusing the current animation refs.

Add optional `personalizedModel?: PersonalizedVoxelModel` through `VoxelCatStage → VoxelCatScene → VoxelCatModel`. In `VoxelCatStage`, set `data-voxel-count` from the active model instead of the fixed constant. Keep the existing detail fallback boundary around the personalized renderer.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @pindou/web exec vitest run src/app/voxel/PersonalizedVoxelBody.test.ts src/app/voxel/VoxelCatModel.test.tsx src/app/voxel/VoxelCatStage.test.tsx`  
Expected: all renderer and stage tests PASS.

```bash
git add apps/web/src/app/voxel/PersonalizedVoxelBody.tsx apps/web/src/app/voxel/PersonalizedVoxelBody.test.ts apps/web/src/app/voxel/VoxelCatModel.tsx apps/web/src/app/voxel/VoxelCatModel.test.tsx apps/web/src/app/voxel/VoxelCatScene.tsx apps/web/src/app/voxel/VoxelCatStage.tsx apps/web/src/app/voxel/VoxelCatStage.test.tsx
git commit -m "feat: animate personalized voxel cat models"
```

---

### Task 5: Manual silhouette and proportion correction UI

**Files:**
- Create: `apps/web/src/app/voxel/ShapeCorrectionPanel.tsx`
- Test: `apps/web/src/app/voxel/ShapeCorrectionPanel.test.tsx`
- Modify: `apps/web/src/app/PixelPetStudio.tsx`
- Modify: `apps/web/src/app/App.test.tsx`
- Modify: `apps/web/src/app/styles.css`

**Interfaces:**
- Consumes: active normalized views, per-cat corrections, per-cat mask overrides.
- Produces: `onCorrectionsChange`, `onMaskChange`, and `onReset` events consumed by `useThreeViewCatModel`.

- [ ] **Step 1: Write failing accessible UI tests**

Tests must open `轮廓校正`, switch among exact buttons `正面轮廓`, `侧面轮廓`, `俯视轮廓`, toggle `补轮廓` and `擦轮廓`, change the `头宽` slider, and click `恢复自动轮廓`. Assert every callback receives a new immutable object and values remain in `0.8–1.2`.

- [ ] **Step 2: Confirm red state**

Run: `pnpm --filter @pindou/web exec vitest run src/app/voxel/ShapeCorrectionPanel.test.tsx src/app/App.test.tsx`  
Expected: FAIL because the correction panel is absent.

- [ ] **Step 3: Implement canvas editing and per-cat session state**

The panel renders one pixelated canvas at a time. Pointer coordinates map to mask cells; pointer down and move call `paintMask` with radius `1`, while pointer up commits the cloned mask. Sliders use exact ranges `min="0.8"`, `max="1.2"`, `step="0.02"`.

`PixelPetStudio` stores:

```ts
const [correctionsByCat, setCorrectionsByCat] = useState<Partial<Record<CatId, ShapeCorrections>>>({});
const [maskOverridesByCat, setMaskOverridesByCat] = useState<Partial<Record<CatId, Partial<Record<CatViewName, BinaryMask>>>>>({});
```

Call `useThreeViewCatModel` at the studio level, pass the active detailed or performance model into `VoxelCatStage`, show loading/error copy above the editor, and keep cat/camera/detail state unchanged during edits. `恢复自动轮廓` clears only the active cat's corrections and mask overrides.

- [ ] **Step 4: Add responsive styling**

Use the existing cream/black/orange visual language. Keep the panel collapsed by default, make the mask canvas `image-rendering: pixelated`, and on widths below 800px place controls before the 3D stage without horizontal overflow.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm --filter @pindou/web exec vitest run src/app/voxel/ShapeCorrectionPanel.test.tsx src/app/App.test.tsx
pnpm --filter @pindou/web typecheck
```

Expected: UI tests and typecheck PASS.

```bash
git add apps/web/src/app/voxel/ShapeCorrectionPanel.tsx apps/web/src/app/voxel/ShapeCorrectionPanel.test.tsx apps/web/src/app/PixelPetStudio.tsx apps/web/src/app/App.test.tsx apps/web/src/app/styles.css
git commit -m "feat: add personalized silhouette correction"
```

---

### Task 6: Real asset tuning and browser acceptance

**Files:**
- Modify only if evidence requires: `apps/web/src/app/voxel/threeViewAssets.ts`
- Modify only if evidence requires: `apps/web/src/app/voxel/threeViewRaster.ts`
- Modify only if evidence requires: `apps/web/src/app/voxel/visualHull.ts`
- Modify: `docs/superpowers/specs/2026-07-19-pindou-pet-three-view-visual-hull-design.md`

**Interfaces:**
- Consumes: the five real built-in image triplets and browser performance datasets.
- Produces: tuned deterministic extraction values and an acceptance record.

- [ ] **Step 1: Run complete Web verification before browser tuning**

```bash
pnpm --filter @pindou/web test
pnpm --filter @pindou/web typecheck
pnpm --filter @pindou/web build
```

Expected: tests, typecheck, and build exit `0`.

- [ ] **Step 2: Verify all five generated outlines in the browser**

At 1440×900, select all cats and record each active model's length, height, width, tail length, and voxel count in DOM data attributes. Confirm at least four metrics differ between cats and that the photos, not appearance IDs alone, reach the model-loading path. Inspect front, side, top, and freely rotated views.

- [ ] **Step 3: Exercise correction and interaction paths**

For one cat, add and erase mask cells and verify the model bounds change, operate all five sliders, reset, then test detailed/performance switching, three camera presets, drag, zoom, click hearts, blink, breathing, and all tail joints. Confirm edits do not switch the selected cat or camera.

- [ ] **Step 4: Check performance and mobile layout**

After the two-second warmup, read two completed five-second FPS windows. Detailed mode must average at least 45 FPS. At 390×844, confirm no horizontal overflow and that the correction panel and 3D canvas remain reachable. Read browser console errors; expected count is `0`.

- [ ] **Step 5: Record evidence and commit tuning**

Append `实施验收记录` to the spec with per-cat metrics, measured FPS, tested viewports, correction actions, and console error count.

```bash
git add apps/web/src/app/voxel/threeViewAssets.ts apps/web/src/app/voxel/threeViewRaster.ts apps/web/src/app/voxel/visualHull.ts docs/superpowers/specs/2026-07-19-pindou-pet-three-view-visual-hull-design.md
git commit -m "test: verify photo-driven cat silhouettes"
```

Only stage files that actually changed.

---

### Task 7: Repository completion gate

**Files:**
- No source edits unless a failing gate identifies a task regression.

**Interfaces:**
- Consumes: all preceding commits.
- Produces: a clean, verified feature branch and a running local demo.

- [ ] **Step 1: Run the full project gate**

```bash
make check
git diff --check
git status --short --branch
```

Expected: Ruff, contracts, Python tests, Web tests, typecheck, and build pass; `git diff --check` returns no output; only `.pnpm-store/` and `apps/web/src/app/PixelPetStudio 2.tsx` remain untracked.

- [ ] **Step 2: Recheck the original failure mode**

In the open local app, switch repeatedly among all five cats. The occupied voxel positions and measured bounds must change with the selected triplet; a test that replaces one view mask must produce a different model. This proves the app is no longer a fixed geometry with color-only switching.

- [ ] **Step 3: Leave the tested local page running and report exact evidence**

Report commit IDs, test totals, actual FPS, voxel ranges, per-cat outline metrics, fallback limitations, and the local URL. Do not push or merge without a new explicit user choice.
