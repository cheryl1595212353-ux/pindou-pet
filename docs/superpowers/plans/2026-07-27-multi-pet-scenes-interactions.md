# Multi-Pet Scenes and Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the existing 2D pixel-pet page into a tested, responsive product with five identity-locked pets, six rich scenes, five additional interactions, and corrected mobile boundaries and focus order.

**Architecture:** Keep the existing `8 × 9` sprite-atlas contract and add static pet and scene catalogs. Each pet receives its own validated atlas; the React reducer maps fourteen product states onto the fixed nine atlas rows, while scene backgrounds and interaction props provide the additional visual context.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, CSS sprite animation, hatch-pet deterministic atlas tools, built-in image generation, Pillow, WebP.

## Global Constraints

- Preserve the user’s uncommitted changes in `PixelDogStudio.tsx` and `styles.css`; extend them instead of reverting them.
- Keep the existing atlas dimensions exactly `1536 × 1872`, with `192 × 208` cells in an `8 × 9` grid.
- Deliver five pets: `doubao`, `jinbao`, `xuetuan`, `keke`, and `jutuan`.
- Deliver six scenes: `living-room`, `garden`, `beach`, `snow-cabin`, `camping`, and `rooftop`.
- Add exactly five new user-triggered interactions: `playing-ball`, `grooming`, `bathing`, `dancing`, and `posing`.
- Do not add 3D, WebGL, accounts, cloud storage, user uploads, currency, tasks, or progression systems.
- Keep all buttons at least `44px` high on mobile and preserve `prefers-reduced-motion`.
- Do not use CSS `order` to make visual order differ from DOM and keyboard focus order.
- Treat deterministic image validation as necessary but not sufficient; every new atlas and final page must receive visual QA.
- Use `/Users/chy/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3` for Pillow-backed hatch-pet scripts.

---

### Task 1: Add Typed Pet and Scene Catalogs

**Files:**
- Create: `apps/web/src/app/pixel-dog/petCatalog.ts`
- Create: `apps/web/src/app/pixel-dog/petCatalog.test.ts`
- Create: `apps/web/src/app/pixel-dog/sceneCatalog.ts`
- Create: `apps/web/src/app/pixel-dog/sceneCatalog.test.ts`

**Interfaces:**
- Produces: `PetId`, `PetProfile`, `PETS`, `DEFAULT_PET_ID`, `getPetById`
- Produces: `SceneId`, `SceneProfile`, `SCENES`, `DEFAULT_SCENE_ID`, `getSceneById`
- Consumed by: `PixelDogStudio.tsx` and later catalog tests

- [ ] **Step 1: Write failing catalog tests**

```ts
expect(PETS.map((pet) => pet.id)).toEqual([
  "doubao", "jinbao", "xuetuan", "keke", "jutuan",
]);
expect(new Set(PETS.map((pet) => pet.id)).size).toBe(5);
expect(PETS.every((pet) => pet.spritesheetPath.endsWith("/spritesheet.webp"))).toBe(true);

expect(SCENES.map((scene) => scene.id)).toEqual([
  "living-room", "garden", "beach", "snow-cabin", "camping", "rooftop",
]);
expect(new Set(SCENES.map((scene) => scene.id)).size).toBe(6);
expect(SCENES.every((scene) => scene.backgroundPath.endsWith(".webp"))).toBe(true);
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
pnpm --filter @pindou/web test -- petCatalog.test.ts sceneCatalog.test.ts
```

Expected: FAIL because the catalog modules do not exist.

- [ ] **Step 3: Implement the pet catalog**

Use these exact public fields:

```ts
export type PetId = "doubao" | "jinbao" | "xuetuan" | "keke" | "jutuan";

export interface PetProfile {
  readonly id: PetId;
  readonly displayName: string;
  readonly breed: string;
  readonly description: string;
  readonly basePath: string;
  readonly spritesheetPath: string;
}
```

Populate names and breeds as:

```ts
[
  ["doubao", "豆包", "红柴犬"],
  ["jinbao", "金宝", "金毛"],
  ["xuetuan", "雪团", "比熊"],
  ["keke", "可可", "棕色泰迪"],
  ["jutuan", "橘团", "橘色异国短毛猫"],
]
```

Build paths with `` `/pixel-dog/${id}/base.png` `` and
`` `/pixel-dog/${id}/spritesheet.webp` ``.

- [ ] **Step 4: Implement the scene catalog**

Use these exact public fields:

```ts
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
```

Build each background path with `` `/pixel-dog/scenes/${id}.webp` ``.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm --filter @pindou/web test -- petCatalog.test.ts sceneCatalog.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the catalog task**

```bash
git add apps/web/src/app/pixel-dog/petCatalog.ts \
  apps/web/src/app/pixel-dog/petCatalog.test.ts \
  apps/web/src/app/pixel-dog/sceneCatalog.ts \
  apps/web/src/app/pixel-dog/sceneCatalog.test.ts
git commit -m "feat: add pixel pet and scene catalogs"
```

### Task 2: Extend the Interaction State Machine

**Files:**
- Modify: `apps/web/src/app/pixel-dog/pixelDogModel.ts`
- Modify: `apps/web/src/app/pixel-dog/pixelDogModel.test.ts`

**Interfaces:**
- Consumes: fixed atlas row and frame dimensions
- Produces: `PixelDogState` with fourteen states and `DogEvent` with five new events
- Produces: `DOG_CLIPS[state].status` without a hard-coded pet name
- Produces: `getPropSide(stagePosition: number): "left" | "right"`

- [ ] **Step 1: Add failing reducer tests**

Add exact assertions:

```ts
expect(dogReducer("idle", { type: "play-ball" })).toBe("playing-ball");
expect(dogReducer("idle", { type: "groom" })).toBe("grooming");
expect(dogReducer("idle", { type: "bathe" })).toBe("bathing");
expect(dogReducer("idle", { type: "dance" })).toBe("dancing");
expect(dogReducer("idle", { type: "pose" })).toBe("posing");

for (const state of [
  "playing-ball", "grooming", "bathing", "dancing", "posing",
] as const) {
  expect(dogReducer(state, { type: "complete" })).toBe("idle");
}
```

Also assert the new rows:

```ts
expect(DOG_CLIPS["playing-ball"].row).toBe(4);
expect(DOG_CLIPS.grooming.row).toBe(8);
expect(DOG_CLIPS.bathing.row).toBe(6);
expect(DOG_CLIPS.dancing.row).toBe(3);
expect(DOG_CLIPS.posing.row).toBe(3);
```

- [ ] **Step 2: Run the model test and verify it fails**

```bash
pnpm --filter @pindou/web test -- pixelDogModel.test.ts
```

Expected: FAIL because the states and events are absent.

- [ ] **Step 3: Implement the fourteen-state model**

Add:

```ts
| "playing-ball"
| "grooming"
| "bathing"
| "dancing"
| "posing"
```

Add events:

```ts
| { readonly type: "play-ball" }
| { readonly type: "groom" }
| { readonly type: "bathe" }
| { readonly type: "dance" }
| { readonly type: "pose" }
```

Rename `DogClip.label` to `DogClip.status`. Existing statuses become name-free phrases such as `正在呼吸和眨眼`; new statuses are `正在玩球`, `正在梳毛`, `正在洗澡`, `正在跳舞`, and `正在摆姿势拍照`.

Add all five new states to `ONE_SHOT_STATES`.

Add the boundary helper:

```ts
export function getPropSide(stagePosition: number): "left" | "right" {
  return stagePosition > 70 ? "left" : "right";
}
```

Test it with:

```ts
expect(getPropSide(MIN_STAGE_POSITION)).toBe("right");
expect(getPropSide(MAX_STAGE_POSITION)).toBe("left");
```

- [ ] **Step 4: Run focused tests**

```bash
pnpm --filter @pindou/web test -- pixelDogModel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the model task**

```bash
git add apps/web/src/app/pixel-dog/pixelDogModel.ts \
  apps/web/src/app/pixel-dog/pixelDogModel.test.ts
git commit -m "feat: add five pixel pet interactions"
```

### Task 3: Generate and Validate the Golden Retriever Atlas

**Files:**
- Create: `apps/web/public/pixel-dog/jinbao/base.png`
- Create: `apps/web/public/pixel-dog/jinbao/pet.json`
- Create: `apps/web/public/pixel-dog/jinbao/spritesheet.webp`
- Create: `var/interactive-pixel-dog/pets/jinbao/`

**Interfaces:**
- Produces: an atlas compatible with `PETS[1].spritesheetPath`
- Uses: hatch-pet nine-row layout and image generation workers

- [ ] **Step 1: Prepare the Jinbao hatch-pet run**

```bash
PY=/Users/chy/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
SKILL=/Users/chy/.codex/skills/hatch-pet
$PY "$SKILL/scripts/prepare_pet_run.py" \
  --pet-name "金宝" \
  --description "一只友好活泼的金毛像素宠物。" \
  --output-dir "$PWD/var/interactive-pixel-dog/pets/jinbao" \
  --pet-notes "friendly adult golden retriever; warm golden long fur; floppy ears; dark brown eyes; black nose; broad feathered tail; blue collar; full-body compact game-sprite proportions" \
  --style-preset pixel \
  --style-notes "Crisp authentic pixel art, about 128x128 visible sprite density, limited warm palette, deliberate block clusters, stepped edges, simple dark outline, no antialiasing, no scenery, no shadow." \
  --force
```

- [ ] **Step 2: Generate base and row jobs**

Use one hatch-pet image worker per ready job from `imagegen-jobs.json`. Generate `base`, `idle`, and `running-right` first. Mirror `running-left` only after a visual check proves the blue collar and markings are symmetric; otherwise generate it. Generate `waving`, `jumping`, `failed`, `waiting`, `running`, and `review` as independent rows.

- [ ] **Step 3: Compose and validate Jinbao**

Run `extract_strip_frames.py`, `inspect_frames.py`, `compose_atlas.py`, `validate_atlas.py`, `make_contact_sheet.py`, and `render_animation_previews.py` with the bundled Python executable.

Expected:

- `final/validation.json` has `errors: []`
- `qa/review.json` has `errors: []`
- visual QA accepts all nine rows

- [ ] **Step 4: Export Jinbao public assets**

Copy `final/spritesheet.webp` to `apps/web/public/pixel-dog/jinbao/spritesheet.webp`. Build `base.png` from the transparent `frames/idle/00.png`, fitting the visible pet inside a centered `128 × 128` transparent canvas with nearest-neighbor sampling. Add `pet.json` with the same atlas and state contract as Doubao and Jinbao’s identity fields.

- [ ] **Step 5: Commit Jinbao**

```bash
git add apps/web/public/pixel-dog/jinbao
git commit -m "feat: add Jinbao golden retriever atlas"
```

### Task 4: Generate and Validate the Bichon Atlas

**Files:**
- Create: `apps/web/public/pixel-dog/xuetuan/base.png`
- Create: `apps/web/public/pixel-dog/xuetuan/pet.json`
- Create: `apps/web/public/pixel-dog/xuetuan/spritesheet.webp`
- Create: `var/interactive-pixel-dog/pets/xuetuan/`

**Interfaces:**
- Produces: an atlas compatible with `PETS[2].spritesheetPath`

- [ ] **Step 1: Prepare the Xuetuan hatch-pet run**

```bash
PY=/Users/chy/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
SKILL=/Users/chy/.codex/skills/hatch-pet
$PY "$SKILL/scripts/prepare_pet_run.py" \
  --pet-name "雪团" \
  --description "一只圆润亲人的比熊像素宠物。" \
  --output-dir "$PWD/var/interactive-pixel-dog/pets/xuetuan" \
  --pet-notes "small adult Bichon Frise; fluffy white curly coat; round cloud-like head; black button eyes and black nose; short legs; curled plume tail; pink collar; full-body compact game-sprite proportions" \
  --style-preset pixel \
  --style-notes "Crisp authentic pixel art, about 128x128 visible sprite density, limited white and cream palette with readable outline, deliberate block clusters, stepped edges, no antialiasing, no scenery, no shadow." \
  --force
```

- [ ] **Step 2: Generate all Xuetuan visual jobs**

Generate the canonical base and every required row with identity grounding. Mirroring `running-right` is allowed only after confirming the pink collar, face, coat and tail remain semantically correct when flipped.

- [ ] **Step 3: Compose, validate, and visually QA Xuetuan**

Run the six hatch-pet deterministic scripts. Accept only when validation and review contain no errors and the white body remains readable on transparent and light scene backgrounds.

- [ ] **Step 4: Export Xuetuan public assets**

Export `spritesheet.webp`, a centered transparent `128 × 128 base.png`, and a matching `pet.json` to `apps/web/public/pixel-dog/xuetuan/`.

- [ ] **Step 5: Commit Xuetuan**

```bash
git add apps/web/public/pixel-dog/xuetuan
git commit -m "feat: add Xuetuan bichon atlas"
```

### Task 5: Generate and Validate the Teddy Poodle Atlas

**Files:**
- Create: `apps/web/public/pixel-dog/keke/base.png`
- Create: `apps/web/public/pixel-dog/keke/pet.json`
- Create: `apps/web/public/pixel-dog/keke/spritesheet.webp`
- Create: `var/interactive-pixel-dog/pets/keke/`

**Interfaces:**
- Produces: an atlas compatible with `PETS[3].spritesheetPath`

- [ ] **Step 1: Prepare the Keke hatch-pet run**

```bash
PY=/Users/chy/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
SKILL=/Users/chy/.codex/skills/hatch-pet
$PY "$SKILL/scripts/prepare_pet_run.py" \
  --pet-name "可可" \
  --description "一只温暖聪明的棕色泰迪像素宠物。" \
  --output-dir "$PWD/var/interactive-pixel-dog/pets/keke" \
  --pet-notes "small brown toy poodle in teddy trim; warm cocoa curly coat; long soft ears; round muzzle; dark eyes; black nose; short curled tail; yellow collar; full-body compact game-sprite proportions" \
  --style-preset pixel \
  --style-notes "Crisp authentic pixel art, about 128x128 visible sprite density, limited cocoa palette, deliberate curl clusters, stepped edges, simple dark outline, no antialiasing, no scenery, no shadow." \
  --force
```

- [ ] **Step 2: Generate all Keke visual jobs**

Generate the canonical base and nine rows. Only mirror the directional row after confirming coat highlights, yellow collar and ear shapes remain correct.

- [ ] **Step 3: Compose, validate, and visually QA Keke**

Run all deterministic hatch-pet stages. Reject identity drift toward a generic bear, straight-haired dog, or a different poodle color.

- [ ] **Step 4: Export Keke public assets**

Export `spritesheet.webp`, centered transparent `128 × 128 base.png`, and the matching manifest to `apps/web/public/pixel-dog/keke/`.

- [ ] **Step 5: Commit Keke**

```bash
git add apps/web/public/pixel-dog/keke
git commit -m "feat: add Keke teddy poodle atlas"
```

### Task 6: Generate and Validate the Exotic Shorthair Atlas

**Files:**
- Create: `apps/web/public/pixel-dog/jutuan/base.png`
- Create: `apps/web/public/pixel-dog/jutuan/pet.json`
- Create: `apps/web/public/pixel-dog/jutuan/spritesheet.webp`
- Create: `var/interactive-pixel-dog/pets/jutuan/`

**Interfaces:**
- Produces: an atlas compatible with `PETS[4].spritesheetPath`

- [ ] **Step 1: Prepare the Jutuan hatch-pet run**

```bash
PY=/Users/chy/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
SKILL=/Users/chy/.codex/skills/hatch-pet
$PY "$SKILL/scripts/prepare_pet_run.py" \
  --pet-name "橘团" \
  --description "一只安静圆润的橘色异国短毛猫像素宠物。" \
  --output-dir "$PWD/var/interactive-pixel-dog/pets/jutuan" \
  --pet-notes "adult orange exotic shorthair cat; round flat face; small rounded ears; copper eyes; short dense orange tabby coat; short legs; thick tail; green collar; clearly a real pet breed and not a copyrighted cartoon character; full-body compact game-sprite proportions" \
  --style-preset pixel \
  --style-notes "Crisp authentic pixel art, about 128x128 visible sprite density, limited orange tabby palette, deliberate block clusters, stepped edges, simple dark outline, no antialiasing, no scenery, no shadow." \
  --force
```

- [ ] **Step 2: Generate all Jutuan visual jobs**

Generate the canonical base and all nine rows. Preserve feline anatomy, the flat round face, copper eyes, tabby marks and thick tail. Do not copy the design, face, expression, or accessories of the Garfield entertainment character.

- [ ] **Step 3: Compose, validate, and visually QA Jutuan**

Run every hatch-pet deterministic stage. Reject rows that become canine, long-haired Persian, thin-faced cat, or cartoon-character imitation.

- [ ] **Step 4: Export Jutuan public assets**

Export `spritesheet.webp`, centered transparent `128 × 128 base.png`, and the matching manifest to `apps/web/public/pixel-dog/jutuan/`.

- [ ] **Step 5: Commit Jutuan**

```bash
git add apps/web/public/pixel-dog/jutuan
git commit -m "feat: add Jutuan exotic shorthair atlas"
```

### Task 7: Generate Six Rich Scene Backgrounds

**Files:**
- Create: `apps/web/public/pixel-dog/scenes/living-room.webp`
- Create: `apps/web/public/pixel-dog/scenes/garden.webp`
- Create: `apps/web/public/pixel-dog/scenes/beach.webp`
- Create: `apps/web/public/pixel-dog/scenes/snow-cabin.webp`
- Create: `apps/web/public/pixel-dog/scenes/camping.webp`
- Create: `apps/web/public/pixel-dog/scenes/rooftop.webp`
- Create: `var/interactive-pixel-dog/scenes/qa/contact-sheet.png`

**Interfaces:**
- Produces: six `1600 × 900` WebP backgrounds for `SCENES`

- [ ] **Step 1: Generate the six source images**

Use image generation with one centered empty play area covering the lower-middle 55% of every image. Require crisp handcrafted pixel art, no pets, people, text, logos, UI, frames, or embedded checkerboards.

Exact scene content:

- `living-room`: warm morning living room, wood floor, large window, rug, shelf, plant, framed art
- `garden`: bright flower garden, grass, wooden fence, leafy trees, distant hills, small butterfly accents
- `beach`: sunny beach, pale sand, layered blue sea, distant island, umbrella, shells, slow clouds
- `snow-cabin`: warm wooden cabin interior, fireplace, rug, window showing snow, folded blanket
- `camping`: moonlit campsite, tent, pine trees, lantern, stars, grass and small fireflies
- `rooftop`: sunset city rooftop, skyline, railing, planters, bench, distant clouds and lit windows

- [ ] **Step 2: Normalize scene files**

For each selected PNG source, use Pillow to center-crop to `16:9`, resize to `1600 × 900` with nearest-neighbor sampling, then convert all six files with:

```bash
for scene_id in living-room garden beach snow-cabin camping rooftop; do
  cwebp -quiet -lossless \
    "var/interactive-pixel-dog/scenes/normalized/$scene_id.png" \
    -o "apps/web/public/pixel-dog/scenes/$scene_id.webp"
done
```

- [ ] **Step 3: Create and inspect a scene contact sheet**

Build a labeled 3-by-2 contact sheet under `var/interactive-pixel-dog/scenes/qa/`. Confirm all six are visibly distinct, retain a safe lower-middle pet area, and contain no text or accidental animals.

- [ ] **Step 4: Validate dimensions and file size**

```bash
sips -g pixelWidth -g pixelHeight apps/web/public/pixel-dog/scenes/*.webp
ls -lh apps/web/public/pixel-dog/scenes/*.webp
```

Expected: every file is `1600 × 900`; total scene payload remains below 12MB.

- [ ] **Step 5: Commit scene assets**

```bash
git add apps/web/public/pixel-dog/scenes
git commit -m "feat: add six pixel pet scenes"
```

### Task 8: Add Pet and Scene Selection to the Studio

**Files:**
- Modify: `apps/web/src/app/pixel-dog/PixelDogStudio.tsx`
- Modify: `apps/web/src/app/pixel-dog/PixelDogStudio.test.tsx`

**Interfaces:**
- Consumes: `PETS`, `SCENES`, `getPetById`, `getSceneById`
- Produces: dynamic sprite path, dynamic accessible copy, `data-pet`, and `data-scene`

- [ ] **Step 1: Write failing component tests**

Test:

```ts
expect(screen.getAllByRole("button", { name: /选择宠物/ })).toHaveLength(5);
fireEvent.click(screen.getByRole("button", { name: "选择宠物：雪团·比熊" }));
expect(screen.getByRole("heading", { name: "和雪团一起玩" })).toBeVisible();
expect(screen.getByRole("status")).toHaveTextContent("雪团正在呼吸和眨眼");

expect(screen.getAllByRole("button", { name: /切换场景/ })).toHaveLength(6);
fireEvent.click(screen.getByRole("button", { name: "切换场景：星光露营" }));
expect(screen.getByRole("region", { name: "雪团的星光露营" })).toHaveAttribute(
  "data-scene",
  "camping",
);
```

- [ ] **Step 2: Run the component test and verify it fails**

```bash
pnpm --filter @pindou/web test -- PixelDogStudio.test.tsx
```

Expected: FAIL because selection controls are absent.

- [ ] **Step 3: Implement selected pet and scene state**

Add:

```ts
const [petId, setPetId] = useState<PetId>(DEFAULT_PET_ID);
const [sceneId, setSceneId] = useState<SceneId>(DEFAULT_SCENE_ID);
const pet = getPetById(petId);
const scene = getSceneById(sceneId);
```

On pet change, clear the selected asset error and dispatch `wake`. Keep the current scene and stage position.

- [ ] **Step 4: Render accessible selectors**

Pet buttons use `aria-pressed`, the base image, display name and breed. Scene buttons use `aria-pressed`, display name, description and background thumbnail. Build all visible status copy from `pet.displayName + clip.status`.

- [ ] **Step 5: Run focused tests**

```bash
pnpm --filter @pindou/web test -- PixelDogStudio.test.tsx
```

Expected: selection and original interaction tests PASS.

- [ ] **Step 6: Commit selection behavior**

Stage the modified component, its test, and the user’s existing visual edits now incorporated into the component:

```bash
git add apps/web/src/app/pixel-dog/PixelDogStudio.tsx \
  apps/web/src/app/pixel-dog/PixelDogStudio.test.tsx
git commit -m "feat: add pet and scene switching"
```

### Task 9: Add Five New Interaction Props and Fix the Bowl Boundary

**Files:**
- Modify: `apps/web/src/app/pixel-dog/PixelDogStudio.tsx`
- Modify: `apps/web/src/app/pixel-dog/PixelDogStudio.test.tsx`
- Modify: `apps/web/src/app/styles.css`

**Interfaces:**
- Consumes: five new `DogEvent` values
- Produces: `.pixel-dog-prop--ball`, `--brush`, `--bath`, `--dance`, and `--camera`
- Produces: `data-side="left|right"` on the food bowl

- [ ] **Step 1: Write failing interaction tests**

For each button, click it and assert state text plus prop label:

```ts
[
  ["玩球", "正在玩球", "玩具球"],
  ["梳毛", "正在梳毛", "梳毛刷"],
  ["洗澡", "正在洗澡", "宠物浴盆"],
  ["跳舞", "正在跳舞", "跳舞节拍"],
  ["拍照", "正在摆姿势拍照", "拍照闪光"],
].forEach(([button, status, prop]) => {
  fireEvent.click(screen.getByRole("button", { name: button }));
  expect(screen.getByRole("status")).toHaveTextContent(status);
  expect(screen.getByLabelText(prop)).toBeVisible();
});
```

Add a bowl-side test around the exported pure helper:

```ts
expect(getPropSide(MIN_STAGE_POSITION)).toBe("right");
expect(getPropSide(MAX_STAGE_POSITION)).toBe("left");
```

In the component test, hold the right movement control until the room bar reports
`92 / 100`, click “喂食”, and assert that the rendered bowl has
`data-side="left"`.

- [ ] **Step 2: Run focused tests and verify they fail**

```bash
pnpm --filter @pindou/web test -- PixelDogStudio.test.tsx
```

- [ ] **Step 3: Implement five action buttons and prop layers**

Render one `role="img"` prop per new state. Anchor props to the same `--dog-left` custom property as the pet so they follow horizontal movement. Use the reducer events `play-ball`, `groom`, `bathe`, `dance`, and `pose`.

- [ ] **Step 4: Fix food-bowl placement**

Consume the pure helper:

```ts
const propSide = getPropSide(stagePosition);
```

Apply `data-side={propSide}` to the bowl. Place the right-side bowl with `translateX(72px)` and the left-side bowl with `translateX(calc(-100% - 72px))`.

- [ ] **Step 5: Remove CSS visual reordering**

Delete mobile `order: -1` from `.pixel-dog-room` and remove `order` values from `.pixel-dog-action-controls` and `.pixel-dog-move-controls`. Keep DOM and rendered rows in the same order.

- [ ] **Step 6: Run focused tests**

```bash
pnpm --filter @pindou/web test -- PixelDogStudio.test.tsx
```

Expected: all original and new interaction tests PASS.

- [ ] **Step 7: Commit interaction behavior**

```bash
git add apps/web/src/app/pixel-dog/PixelDogStudio.tsx \
  apps/web/src/app/pixel-dog/PixelDogStudio.test.tsx \
  apps/web/src/app/styles.css
git commit -m "feat: add rich pixel pet interactions"
```

### Task 10: Finish Responsive Scene and Control Styling

**Files:**
- Modify: `apps/web/src/app/styles.css`

**Interfaces:**
- Consumes: `data-scene`, `data-state`, catalog selector classes, prop classes
- Produces: responsive desktop and mobile composition with reduced-motion behavior

- [ ] **Step 1: Style the compact selection panel**

Use one horizontal pet strip and one horizontal scene strip. Make selected buttons visibly pressed without turning the page into a card grid. Keep descriptive copy to one line per selector.

- [ ] **Step 2: Style the scene surface**

Set the selected background image from the scene profile’s inline custom property. Use `background-size: cover`, preserve a quiet lower-middle play area, and add one `.pixel-dog-ambient` layer keyed by `data-scene` for subtle sun, leaves, waves, snow, stars, or city lights.

- [ ] **Step 3: Style the five props**

Use crisp borders and pixel shapes. The ball rolls, brush crosses the back, bath surrounds the lower body, dance markers pulse close to the pet, and camera flash briefly covers only the scene. Keep props below the status bubble and above the background.

- [ ] **Step 4: Complete mobile layout**

At `max-width: 800px`, keep the compact selector panel first, then the room and controls. Ensure the scene is at least `320px` tall, all controls are at least `44px`, selector strips scroll inside themselves, and the page does not scroll horizontally.

- [ ] **Step 5: Complete reduced-motion styling**

Disable ambient and prop keyframes under `prefers-reduced-motion: reduce` while preserving static props and state visibility.

- [ ] **Step 6: Run CSS and build checks**

```bash
git diff --check
pnpm --filter @pindou/web typecheck
pnpm --filter @pindou/web build
```

Expected: all commands succeed.

- [ ] **Step 7: Commit responsive styling**

```bash
git add apps/web/src/app/styles.css
git commit -m "style: refine multi-pet scenes and controls"
```

### Task 11: Complete Automated and Asset Contract Verification

**Files:**
- Modify: `apps/web/src/app/pixel-dog/pixelDogModel.test.ts`
- Modify: `apps/web/src/app/pixel-dog/PixelDogStudio.test.tsx`
- Create: `apps/web/src/app/pixel-dog/petAssets.test.ts`

**Interfaces:**
- Consumes: five public pet manifests and six scene files
- Produces: regression proof for the complete requested scope

- [ ] **Step 1: Add asset contract tests**

For all five pet manifests, assert atlas dimensions, row mappings, and public asset existence. For all six scenes, assert file existence and nonzero size.

- [ ] **Step 2: Add scope-count tests**

Assert:

```ts
expect(PETS).toHaveLength(5);
expect(SCENES).toHaveLength(6);
expect(
  ["playing-ball", "grooming", "bathing", "dancing", "posing"]
    .every((state) => state in DOG_CLIPS),
).toBe(true);
```

- [ ] **Step 3: Run all Web tests**

```bash
pnpm --filter @pindou/web test
```

Expected: all test files PASS.

- [ ] **Step 4: Run typecheck and production build**

```bash
pnpm --filter @pindou/web typecheck
pnpm --filter @pindou/web build
```

Expected: both PASS.

- [ ] **Step 5: Commit verification tests**

```bash
git add apps/web/src/app/pixel-dog
git commit -m "test: cover multi-pet scene expansion"
```

### Task 12: Browser QA and Product Documentation

**Files:**
- Modify: `docs/product/interactive-pixel-dog-feature-spec.md`
- Create: `docs/qa/multi-pet-scenes-interactions-qa.json`

**Interfaces:**
- Consumes: completed application, automated test output, validated assets
- Produces: requirement-by-requirement browser evidence

- [ ] **Step 1: Start the local app**

```bash
pnpm --filter @pindou/web dev --host 127.0.0.1
```

- [ ] **Step 2: Verify desktop at `1440 × 900`**

Switch through five pets, six scenes, five new interactions, feeding, movement and sleep/wake. Record bounding boxes, horizontal overflow, asset load state and console logs.

- [ ] **Step 3: Verify mobile at `390 × 844`**

Repeat all selection and interaction checks. Move the pet to both endpoints and feed at each endpoint; prove the bowl bounds remain inside the scene. Tab through controls and record that focus order matches visual order.

- [ ] **Step 4: Verify intermediate mobile at `578 × 863`**

Confirm no horizontal overflow, selector-strip containment, complete pet and prop visibility, and correct bowl placement.

- [ ] **Step 5: Inspect representative screenshots**

Capture at least one screenshot per scene and a contact view of all five pets. Fail QA for background repetition, unreadable white fur, pet identity drift, clipped props, or a scene that overpowers the pet.

- [ ] **Step 6: Update the product specification**

Document the five-pet catalog, six-scene catalog, fourteen-state model, new controls, updated asset layout, accessibility behavior, and final automated/browser evidence.

- [ ] **Step 7: Write the QA evidence JSON**

Include exact viewport sizes, pet IDs, scene IDs, interaction states, test commands, console result, overflow result, bowl boundary measurements, and screenshot paths.

- [ ] **Step 8: Run final diff and status checks**

```bash
git diff --check
git status --short
git log --oneline -12
```

- [ ] **Step 9: Commit documentation and QA**

```bash
git add docs/product/interactive-pixel-dog-feature-spec.md \
  docs/qa/multi-pet-scenes-interactions-qa.json
git commit -m "docs: verify multi-pet interactive experience"
```
