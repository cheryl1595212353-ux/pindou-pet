# 拼豆宠物 Phase 4：五动作互动与 Approved-only PNG/PDF 导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 只读取 Phase 3 的不可变 approved asset，交付确定性五动作互动房间、可测首帧响应/帧时间，以及从 58×58 中立矩阵生成四块 29×29 底板、材料统计、PNG 和 A4 1:1 PDF 的实体拼豆导出闭环。

**Architecture:** Web 端用纯函数采样动画、解析父子变换和变体可见性，再把每个拼豆身体层缓存成离屏位图，由 Konva 仅变换整层；动作控制器采用可注入时钟/随机源，确保视觉回归不依赖墙钟。后端导出只接受不可变 `approvedVersionId`，先重建和校验中立矩阵，再进行四邻域风险分析；PNG、PDF 和 manifest 使用项目隔离的 `projectId + canonicalAssetHash + rendererVersion` 缓存键，绝不读取草稿或动画帧。

**Tech Stack:** Python 3.12、FastAPI、Pillow、ReportLab、pytest；React 19、TypeScript、react-konva、Vitest、Testing Library、Playwright；pnpm workspace。

## Global Constraints

- Phase 4 只读取 Phase 3 `ApprovedAssetVersion`；草稿、当前 Konva 状态和动画帧不得作为实体导出输入。
- 五个首版动作固定为呼吸、眨眼、摇尾、抬起画面左前爪、点击弹跳；歪头不属于首版验收。动作 ID 固定为 `breath`、`blink`、`tail_wag`、`raise_screen_left_front_paw`、`bounce`，全部使用 lower snake case。
- 资产命中区与动作方向一律按画面坐标命名；使用 `SCREEN_LEFT_FRONT_PAW` 和 `SCREEN_RIGHT_FRONT_PAW`，不得写成猫解剖学左右或复用输入照片的猫左前／右前视角名称。
- 固定角色模板的 `TAIL` 位于画面右侧，摇尾始终围绕该画面右侧尾根枢轴。
- 不拉伸单颗豆，动画数据和运行时 `LayerPose` 均不得包含缩放。
- 呼吸仅轻微错峰移动身体和头；眨眼切换睁眼/闭眼变体；摇尾绕画面右侧尾根约 ±12°；`raise_screen_left_front_paw` 将画面左前爪抬起约 10–15°；弹跳仅整体平移。
- 同一时刻只运行一个非中立动作；用户动作优先且不排队；触发后 100ms 内取消待机、恢复中立并启动用户动作。
- 动作结束必须精确回到单位变换和中立变体；动画不得修改任何 `sparseCells`。
- `pointerdown.event.timeStamp` 到首次提交含动作视觉变化的真实 `requestAnimationFrame` 必须最大不超过 200ms，并报告 P95 和最大值。
- `testClock` 只用于确定性关键帧视觉回归，不得生成性能结论。Phase 4 用五个确定性 approved fixture 资产 `F01`–`F05` 校验性能仪器和双设备预算：真实性能使用 `performance.now()`／真实 rAF，每动作预热 3 次后正式触发 30 次，并逐 fixture 记录首帧 P95/最大值和动作帧时间 P95，后者不超过 33.3ms。正式私有样本 `C01`–`C05` 的同一矩阵只在 Phase 5 验收运行中执行，不作为进入 Phase 5 的前置输入。
- 数字舞台须有运动留白，不以 58×58 硬裁剪角色；实体导出永远只读 58×58 中立姿势。
- 中立矩阵排除 `physicalExport=false` 层，只激活每个变体组 `neutralVariantId`，按 `zIndex` 从低到高合成，重叠格保留最上层豆。
- 四块底板是固定切片：左上、右上、左下、右下，各 29×29；不得旋转、镜像、遗漏或重复。
- 物理连通性使用四邻域；对角接触不算熔接；孤立豆、仅对角连接、单豆宽脆弱连接是警告，不是一律阻止导出。
- 用户必须确认当前所有稳定风险 ID 才能继续；风险变化后旧确认不能覆盖新风险。
- PDF 使用 A4；每块 29×29 底板单独一页并按 `pegPitchMm` 1:1 绘制，每个非空格必须在豆位中心打印冻结色板的 `printCode`（或完整 `colorId`），并包含 50mm 校准线；另有完整预览页和材料清单页。
- PNG、PDF、预览和材料统计必须来自同一 `canonicalAssetHash` 和 `neutralMatrixHash`；缓存查询包含 `projectId + canonicalAssetHash + rendererVersion`，禁止两个匿名项目跨项目复用同一导出记录或私有文件。
- 导出文件是最长保留 24 小时的派生产物，不是长期事实源；本计划只创建导出记录，清理由隐私阶段负责。
- 继承 Phase 2 所有权竞态合同：导出创建／风险确认等 owner mutation 的服务签名必须接收 `browser_session_id`，并在写入导出记录／文件引用的同一个 `BEGIN IMMEDIATE` 内调用 `require_project_owner_in_transaction`；路由层只认证会话，不能把事务外项目授权结果传成长期能力。
- 所有 Python 命令使用 `.venv/bin/python`；所有 Web 命令使用 `pnpm`。
- 任何任务运行 `make contracts` 都必须同时提交 `packages/contracts/openapi.json` 与 `packages/contracts/src/generated.ts`，提交命令使用 `git add packages/contracts`；下文单列 generated 路径只是简称。

## File map

```text
apps/api/src/pindou_pet/modules/assets/
├── neutral_matrix.py       # approved asset → 58×58 中立矩阵
└── risk.py                 # 四邻域制作风险

apps/api/src/pindou_pet/modules/exports/
├── __init__.py
├── models.py               # request/manifest/file/risk DTO
├── repository.py           # hash+renderer 缓存与 24h 派生记录
├── render_png.py           # 完整预览和四底板 PNG
├── render_pdf.py           # A4 1:1 PDF
├── service.py              # approved-only 导出编排
└── routes.py               # /api/v1/projects/{id}/exports...

apps/api/tests/modules/assets/
├── test_neutral_matrix.py
└── test_risk.py

apps/api/tests/modules/exports/
├── test_repository.py
├── test_render_png.py
├── test_render_pdf.py
├── test_service.py
└── test_routes.py

apps/web/src/features/interaction/
├── model/sampleAnimation.ts
├── model/transformTree.ts
├── model/interactionController.ts
├── render/renderBeadLayer.ts
├── components/InteractionPage.tsx
├── components/InteractionStage.tsx
└── components/ActionControls.tsx

apps/web/src/features/interaction/__tests__/
├── sampleAnimation.test.ts
├── transformTree.test.ts
├── interactionController.test.ts
├── renderBeadLayer.test.ts
└── InteractionStage.test.tsx

apps/web/src/features/export/
├── api/exportApi.ts
├── components/ExportPage.tsx
├── components/BoardPreview.tsx
├── components/MaterialTable.tsx
└── components/RiskConfirmation.tsx

apps/web/src/features/export/__tests__/
├── exportApi.test.ts
├── ExportPage.test.tsx
└── RiskConfirmation.test.tsx

apps/web/e2e/interaction.spec.ts
apps/web/e2e/export.spec.ts
tests/fixtures/assets/valid-approved.json
tests/fixtures/assets/neutral-matrix.json
tests/fixtures/assets/risk-patterns.json  # Phase 3 创建，Phase 4 Python 读取同一 golden
packages/contracts/src/generated.ts
```

---

### Task 1: Derive the authoritative neutral 58×58 matrix from an approved asset

**Files:**
- Create: `apps/api/src/pindou_pet/modules/assets/neutral_matrix.py`
- Create: `apps/api/tests/modules/assets/test_neutral_matrix.py`
- Create: `tests/fixtures/assets/valid-approved.json`
- Create: `tests/fixtures/assets/neutral-matrix.json`

**Interfaces:**
- Consumes: Phase 3 `ApprovedAssetVersion` and `assert_approvable_asset`.
- Produces: `NeutralMatrix`, `Board`, `neutral_matrix_hash(cells) -> str`, `compose_neutral_matrix(asset) -> NeutralMatrix`, `split_boards(matrix) -> tuple[Board, Board, Board, Board]`, and `count_colors(matrix) -> dict[str, int]`.

- [ ] **Step 1: Write RED composition, overlap, variant, and board-boundary tests**

```python
def test_neutral_composition_excludes_digital_layers_and_closed_eyes() -> None:
    matrix = compose_neutral_matrix(load_approved_fixture())
    assert matrix.cells[10][10] == "EYE_OPEN"
    assert "SHADOW" not in {cell for row in matrix.cells for cell in row if cell}


def test_highest_z_index_wins_overlap() -> None:
    asset = approved_with_overlap(bottom="B01", top="R01", x=20, y=20)
    assert compose_neutral_matrix(asset).cells[20][20] == "R01"


def test_board_split_preserves_boundary_orientation() -> None:
    matrix = matrix_with_markers({(28, 28): "A", (29, 28): "B", (28, 29): "C", (29, 29): "D"})
    lu, ru, ll, rl = split_boards(matrix)
    assert lu.cells[28][28] == "A"
    assert ru.cells[28][0] == "B"
    assert ll.cells[0][28] == "C"
    assert rl.cells[0][0] == "D"


def test_neutral_matrix_hash_is_stable_and_changes_with_any_cell() -> None:
    first = compose_neutral_matrix(load_approved_fixture())
    second = compose_neutral_matrix(load_approved_fixture())
    assert first.neutral_matrix_hash == second.neutral_matrix_hash
    assert first.neutral_matrix_hash != neutral_matrix_hash(change_one_cell(first.cells))
```

Also assert animation tracks/non-identity runtime poses have no effect, output hash references `canonicalAssetHash`, total occupied cells equals sum of counts, and recombining four boards is byte-for-byte equal to the original matrix.

- [ ] **Step 2: Run neutral matrix tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_neutral_matrix.py -q
```

Expected: FAIL with missing `neutral_matrix` module.

- [ ] **Step 3: Implement strict neutral composition and fixed board slicing**

```python
class NeutralMatrix(BaseModel):
    derived_from_canonical_asset_hash: str = Field(alias="derivedFromCanonicalAssetHash")
    neutral_matrix_hash: str = Field(alias="neutralMatrixHash")
    cells: list[list[str | None]]


class Board(BaseModel):
    board_id: Literal["LU", "RU", "LL", "RL"]
    origin_x: Literal[0, 29]
    origin_y: Literal[0, 29]
    cells: list[list[str | None]]


def compose_neutral_matrix(asset: ApprovedAssetVersion) -> NeutralMatrix:
    assert_approvable_asset(asset, load_deployment_palette())
    active = _physical_neutral_layers(asset)
    cells: list[list[str | None]] = [[None for _ in range(58)] for _ in range(58)]
    for layer in sorted(active, key=lambda item: item.z_index):
        for cell in layer.sparse_cells:
            cells[cell.y][cell.x] = cell.color_id
    return NeutralMatrix(
        derivedFromCanonicalAssetHash=asset.canonical_asset_hash,
        neutralMatrixHash=neutral_matrix_hash(cells),
        cells=cells,
    )
```

`_physical_neutral_layers` resolves each `VariantGroup.neutralVariantId` against bead-layer `(variantGroupId, variantId)` fields, rejects zero/multiple matches, and never follows source-layer IDs. `neutral_matrix_hash` serializes only the 58 rows as compact UTF-8 JSON with stable `null`/`colorId` cells and returns lowercase SHA-256. Implement board origins `(0,0)`, `(29,0)`, `(0,29)`, `(29,29)` and preserve row/column direction exactly.

- [ ] **Step 4: Run tests and compare the golden matrix**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_neutral_matrix.py -q
```

Expected: PASS; serialized result equals `tests/fixtures/assets/neutral-matrix.json` exactly.

- [ ] **Step 5: Commit neutral composition**

```bash
git add apps/api/src/pindou_pet/modules/assets/neutral_matrix.py apps/api/tests/modules/assets/test_neutral_matrix.py tests/fixtures/assets/valid-approved.json tests/fixtures/assets/neutral-matrix.json
git commit -m "feat(assets): derive authoritative neutral bead matrix"
```

### Task 2: Detect stable four-neighbor physical construction risks

**Files:**
- Create: `apps/api/src/pindou_pet/modules/assets/risk.py`
- Create: `apps/api/tests/modules/assets/test_risk.py`
- Modify: `tests/fixtures/assets/risk-patterns.json`

**Interfaces:**
- Consumes: `NeutralMatrix` from Task 1.
- Produces: `analyze_physical_risks(matrix) -> list[PhysicalRisk]` with stable IDs `KIND:x:y`.

- [ ] **Step 1: Write RED tests for exact risk locations**

```python
def test_isolated_and_diagonal_only_cells_are_located() -> None:
    risks = analyze_physical_risks(load_risk_fixture("isolated-and-diagonal"))
    assert {(r.id, r.kind) for r in risks} == {
        ("ISOLATED:1:1", "ISOLATED"),
        ("DIAGONAL_ONLY:3:3", "DIAGONAL_ONLY"),
    }


def test_bridge_cell_is_reported_as_single_bead_weak_connection() -> None:
    risks = analyze_physical_risks(load_risk_fixture("one-cell-bridge"))
    assert "WEAK_ARTICULATION:4:2" in {risk.id for risk in risks}


def test_solid_block_has_no_warning() -> None:
    assert analyze_physical_risks(solid_block(4, 4)) == []
```

Load the exact Phase 3 shared golden fixture and assert the Python output equals its complete ordered risk arrays, providing TS/Python parity. Include diagonal neighbors without orthogonal neighbors, multiple connected components, board-edge cells, and a two-cell-wide neck that must not be marked as a one-cell articulation.

- [ ] **Step 2: Run risk tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_risk.py -q
```

Expected: FAIL with missing risk analyzer.

- [ ] **Step 3: Implement four-neighbor graph analysis**

Build an occupied-cell graph using offsets `(-1,0),(1,0),(0,-1),(0,1)`. Classify zero-degree cells as isolated unless they have a diagonal neighbor, in which case use diagonal-only. Use Tarjan articulation-point detection for weak single-cell connectors. Sort output by `(kind, y, x)` and generate exact IDs `f"{kind}:{x}:{y}"`.

- [ ] **Step 4: Run risk tests and confirm GREEN**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_risk.py -q
```

Expected: PASS; repeated runs return identical risk IDs/order.

- [ ] **Step 5: Commit physical risk analysis**

```bash
git add apps/api/src/pindou_pet/modules/assets/risk.py apps/api/tests/modules/assets/test_risk.py tests/fixtures/assets/risk-patterns.json
git commit -m "feat(assets): detect physical bead construction risks"
```

### Task 3: Implement a pure deterministic animation sampler

**Files:**
- Create: `apps/web/src/features/interaction/model/sampleAnimation.ts`
- Create: `apps/web/src/features/interaction/__tests__/sampleAnimation.test.ts`

**Interfaces:**
- Consumes: generated `ApprovedAssetVersion`, animation tracks, variant groups.
- Produces: `sampleAnimation(asset, actionName, elapsedMs) -> AnimationSample`; `nodePoses` is keyed by stable `nodeId`, while discrete visibility is represented separately as active variant IDs. Visual tests and runtime share this exact sampler.

- [ ] **Step 1: Write RED interpolation, variant, and terminal-state tests**

```ts
it("interpolates rotation and translation without exposing scale", () => {
  const sample = sampleAnimation(asset, "tail_wag", 250);
  expect(sample.nodePoses["node-tail"].rotationDeg).toBeCloseTo(12);
  expect(Object.keys(sample.nodePoses["node-tail"]))
    .toEqual(["dx", "dy", "rotationDeg", "visible"]);
});

it("switches open and closed eye variants during blink", () => {
  expect(sampleAnimation(asset, "blink", 80).activeVariantByGroup["eyes-state"])
    .toBe("eyes-closed");
});

it.each(["breath", "blink", "tail_wag", "raise_screen_left_front_paw", "bounce"])(
  "%s returns exact neutral pose at duration",
  (name) => expect(sampleAnimation(asset, name, duration(asset, name))).toEqual(neutralSample(asset)),
);
```

Cover easing boundaries, negative elapsed clamp, elapsed beyond duration, fractional rotations, and non-mutation of `sparseCells`.

- [ ] **Step 2: Run sampler tests and confirm RED**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/interaction/__tests__/sampleAnimation.test.ts
```

Expected: FAIL because sampler module does not exist.

- [ ] **Step 3: Implement typed pure sampling**

```ts
export type LayerPose = {
  dx: number;
  dy: number;
  rotationDeg: number;
  visible: boolean;
};

export type NodeId = string;

export type AnimationSample = {
  nodePoses: Record<NodeId, LayerPose>;
  activeVariantByGroup: Record<string, string>;
};

export type AnimationName =
  | "breath"
  | "blink"
  | "tail_wag"
  | "raise_screen_left_front_paw"
  | "bounce";

export function sampleAnimation(
  asset: ApprovedAssetVersion,
  actionName: AnimationName,
  elapsedMs: number,
): AnimationSample {
  const animation = requireAnimation(asset, actionName);
  if (elapsedMs >= animation.durationMs) return neutralSample(asset);
  return sampleTracks(asset, animation, Math.max(0, elapsedMs));
}
```

Implement named easing functions recorded in the asset; blink uses discrete variant visibility at keyframe boundaries. The terminal branch must allocate a fresh neutral pose and never update the asset.

- [ ] **Step 4: Run sampler tests and confirm GREEN**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/interaction/__tests__/sampleAnimation.test.ts
```

Expected: PASS; all five actions return exact identity/neutral variants at their duration.

- [ ] **Step 5: Commit animation sampling**

```bash
git add apps/web/src/features/interaction/model/sampleAnimation.ts apps/web/src/features/interaction/__tests__/sampleAnimation.test.ts
git commit -m "feat(web): sample bead pet animations deterministically"
```

### Task 4: Resolve parent-before-child global transforms

**Files:**
- Create: `apps/web/src/features/interaction/model/transformTree.ts`
- Create: `apps/web/src/features/interaction/__tests__/transformTree.test.ts`

**Interfaces:**
- Consumes: `AnimationSample.nodePoses`, layer node/parent-node/pivot data, neutral global grid coordinates.
- Produces: `resolveWorldTransforms(asset, poses) -> Record<nodeId, WorldTransform>` for renderer and hit tests; it traverses `parentNodeId`, never layer-instance IDs.

- [ ] **Step 1: Write RED matrix-composition tests**

```ts
it("applies body rotation before child head translation", () => {
  const world = resolveWorldTransforms(parentChildFixture(), posesFixture());
  expect(world["node-head"].origin.x).toBeCloseTo(expectedHeadX);
  expect(world["node-head"].origin.y).toBeCloseTo(expectedHeadY);
});

it("rotates the tail around its global tail-root pivot", () => {
  const world = resolveWorldTransforms(tailFixture({ pivotGlobal: { x: 42, y: 35 } }), {
    tail: { dx: 0, dy: 0, rotationDeg: 12, visible: true },
  });
  expect(apply(world["node-tail"].matrix, { x: 42, y: 35 })).toEqual({ x: 42, y: 35 });
});

it("keeps animation continuity when source and bead layer ids differ", () => {
  const asset = sourceBeadContinuityFixture({
    sourceLayerId: "source-tail-v3", beadLayerId: "bead-tail-v8", nodeId: "node-tail",
  });
  const poses = sampleAnimation(asset, "tail_wag", 250);
  const world = resolveWorldTransforms(asset, poses.nodePoses);
  expect(world[asset.beadLayers[0].nodeId]).toEqual(world["node-tail"]);
  expect(asset.beadLayers[0].id).not.toBe(asset.sourceLayers[0].id);
});
```

- [ ] **Step 2: Run transform tests and confirm RED**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/interaction/__tests__/transformTree.test.ts
```

Expected: FAIL with unresolved transform-tree module.

- [ ] **Step 3: Implement topological transform composition**

Validate/assume the backend-approved acyclic node graph, topologically visit `parentNodeId` before child `nodeId`, form `T(parent) × T(pivot) × R(clockwise) × T(-pivot) × T(local dx,dy)`, and propagate visibility from parent and variant. A bead layer looks up the resulting pose by its stable `nodeId`; open/closed eye variants share the same transform. Do not introduce a scale matrix helper into the public model.

- [ ] **Step 4: Run transform tests and confirm GREEN**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/interaction/__tests__/transformTree.test.ts
```

Expected: PASS within `1e-6` floating-point tolerance.

- [ ] **Step 5: Commit transform hierarchy**

```bash
git add apps/web/src/features/interaction/model/transformTree.ts apps/web/src/features/interaction/__tests__/transformTree.test.ts
git commit -m "feat(web): resolve hierarchical layer transforms"
```

### Task 5: Implement the single-action interaction controller with injectable time and randomness

**Files:**
- Create: `apps/web/src/features/interaction/model/interactionController.ts`
- Create: `apps/web/src/features/interaction/__tests__/interactionController.test.ts`

**Interfaces:**
- Consumes: Task 3 sampler, Task 4 transforms, injected `Clock`, `RandomSource`, and frame callback.
- Produces: one `requestAction(action: AnimationName, triggerSource: TriggerSource) -> ActionRunId` entry point plus `currentRunId()` for idle scheduling, stage hits, metrics and all five explicit demonstration controls. Every accepted request receives a new monotonic run ID.

- [ ] **Step 1: Write RED state-machine tests at timing boundaries**

```ts
it.each([99, 100])("cancels idle and starts user action by %dms", (cancelDelay) => {
  const harness = controllerHarness({ idleAction: "tail_wag", cancelDelay });
  harness.controller.requestAction("raise_screen_left_front_paw",
    { kind: "stage_hit", eventTimeStamp: 1000 });
  harness.clock.advance(cancelDelay);
  expect(harness.controller.currentAction()).toBe("raise_screen_left_front_paw");
});

it("does not queue a second user action", () => {
  const harness = controllerHarness();
  harness.controller.requestAction("bounce", { kind: "stage_hit", eventTimeStamp: 1000 });
  harness.controller.requestAction("raise_screen_left_front_paw",
    { kind: "stage_hit", eventTimeStamp: 1010 });
  expect(harness.controller.pendingActions()).toEqual([]);
  expect(harness.controller.currentAction()).toBe("raise_screen_left_front_paw");
});

it.each(["breath", "blink", "tail_wag", "raise_screen_left_front_paw", "bounce"] as const)(
  "allows demo controls to request %s explicitly", (action) => {
    const harness = controllerHarness();
    harness.controller.requestAction(action, { kind: "demo_control", eventTimeStamp: 1000 });
    expect(harness.controller.currentAction()).toBe(action);
  },
);

it("returns byte-exact neutral poses after action completion", () => {
  const harness = controllerHarness();
  harness.controller.requestAction("bounce", { kind: "stage_hit", eventTimeStamp: 1000 });
  harness.clock.advance(durationFor("bounce"));
  expect(harness.controller.currentSample()).toEqual(neutralSample(asset));
});
```

Test 101ms as a failure in a deliberately delayed fake scheduler, idle randomness from a fixed sequence, tab visibility pause/resume, and explicit disposal of scheduled callbacks.

- [ ] **Step 2: Run controller tests and confirm RED**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/interaction/__tests__/interactionController.test.ts
```

Expected: FAIL because controller module is absent.

- [ ] **Step 3: Implement a small explicit state machine**

```ts
type ActionRunId = number;

type ControllerState =
  | { kind: "neutral" }
  | { kind: "idle"; action: IdleAction; runId: ActionRunId; startedAt: number }
  | { kind: "restoring"; requested: AnimationName; runId: ActionRunId; source: TriggerSource; deadline: number }
  | { kind: "active"; action: AnimationName; runId: ActionRunId; source: TriggerSource; startedAt: number };

type IdleAction = "breath" | "blink" | "tail_wag";
type TriggerSource =
  | { kind: "idle" }
  | { kind: "stage_hit"; eventTimeStamp: number }
  | { kind: "demo_control"; eventTimeStamp: number };

type Clock = {
  now(): number;
  requestFrame(cb: FrameRequestCallback): number;
  cancelFrame(id: number): void;
};
```

Expose only `requestAction(action, triggerSource)` and read-only `currentRunId/currentAction/currentSample`. The call returns its new `ActionRunId`; the same ID survives restoring→active and is never reused. The idle scheduler preserves the original random breathing/blink/tail rules by calling it with `{kind:"idle"}` and never preempts a stage/control action. Stage and demonstration sources may explicitly request any of the five actions, cancel an idle action within 100ms, and replace an earlier requested action rather than append it. Hit-region-to-action mapping remains in `InteractionStage`, not the controller. Restore neutral synchronously when safe, otherwise within the explicit 100ms restoring state.

- [ ] **Step 4: Run controller tests and confirm GREEN**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/interaction/__tests__/interactionController.test.ts
```

Expected: PASS with fake-clock tests and no real timers.

- [ ] **Step 5: Commit controller**

```bash
git add apps/web/src/features/interaction/model/interactionController.ts apps/web/src/features/interaction/__tests__/interactionController.test.ts
git commit -m "feat(web): coordinate idle and user pet actions"
```

### Task 6: Rasterize and cache bead layers for Konva runtime rendering

**Files:**
- Create: `apps/web/src/features/interaction/render/renderBeadLayer.ts`
- Create: `apps/web/src/features/interaction/__tests__/renderBeadLayer.test.ts`

**Interfaces:**
- Consumes: approved bead layer, palette RGB values, display pixel scale.
- Produces: `renderBeadLayer(layer, palette, options) -> CanvasImageSource` and cache key independent of animation pose.

- [ ] **Step 1: Write RED pixel and cache tests**

```ts
it("renders a bead as a colored circle with a transparent center hole", () => {
  const image = renderBeadLayer(singleRedBeadLayer(), palette, { pixelsPerCell: 12 });
  expect(pixel(image, 6, 6).alpha).toBe(0);
  expect(pixel(image, 3, 6).red).toBe(palette.R01.rgb.r);
});

it("reuses a layer bitmap across animation poses", () => {
  const cache = new BeadLayerBitmapCache();
  expect(cache.get(layer, palette)).toBe(cache.get(layer, palette));
  expect(cache.size).toBe(1);
});
```

- [ ] **Step 2: Run renderer tests and confirm RED**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/interaction/__tests__/renderBeadLayer.test.ts
```

Expected: FAIL with missing renderer.

- [ ] **Step 3: Implement offscreen rasterization and content-keyed cache**

Draw cells on `OffscreenCanvas` where supported and an injected canvas factory in tests. Bitmap cache may use immutable bead-layer instance key `canonicalAssetHash/beadLayer.id/pixelsPerCell`, but pose lookup must use `beadLayer.nodeId`; never use a layer instance ID as an animation target. Use palette RGB exactly, a consistent outline, and a transparent center hole. Expose one bitmap per layer; never create one Konva node per bead.

- [ ] **Step 4: Run renderer tests and confirm GREEN**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/interaction/__tests__/renderBeadLayer.test.ts
```

Expected: PASS; two pose changes do not grow cache size or rerasterize cells.

- [ ] **Step 5: Commit layer rasterization**

```bash
git add apps/web/src/features/interaction/render/renderBeadLayer.ts apps/web/src/features/interaction/__tests__/renderBeadLayer.test.ts
git commit -m "perf(web): cache rasterized bead layers"
```

### Task 7: Build the interaction room and measurable first-frame hook

**Files:**
- Create: `apps/web/src/features/interaction/components/InteractionPage.tsx`
- Create: `apps/web/src/features/interaction/components/InteractionStage.tsx`
- Create: `apps/web/src/features/interaction/components/ActionControls.tsx`
- Create: `apps/web/src/features/interaction/__tests__/InteractionStage.test.tsx`
- Create: `apps/web/src/features/interaction/__tests__/InteractionPage.test.tsx`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:**
- Consumes: project GET `activeAssetVersionId`, approved asset GET endpoint, Tasks 3–6.
- Produces: the Phase 0 placeholder route `/projects/:projectId/room`, accessible five-action controls, hit regions, and `ActionFrameMetric` custom event/callback for repeatable Playwright measurement.

- [ ] **Step 1: Write RED component tests for hits, margins, and metrics**

```tsx
it("maps left-paw hit to raise-paw and body hit to bounce", async () => {
  renderInteractionRoom(asset);
  pointerDownHitRegion("SCREEN_LEFT_FRONT_PAW", 1000);
  expect(controller.requestAction).toHaveBeenCalledWith(
    "raise_screen_left_front_paw", { kind: "stage_hit", eventTimeStamp: 1000 });
  pointerDownHitRegion("body", 1200);
  expect(controller.requestAction).toHaveBeenCalledWith(
    "bounce", { kind: "stage_hit", eventTimeStamp: 1200 });
});

it.each(["breath", "blink", "tail_wag", "raise_screen_left_front_paw", "bounce"] as const)(
  "demo control explicitly requests %s", async (action) => {
    renderInteractionRoom(asset);
    await user.click(screen.getByRole("button", { name: actionLabel(action) }));
    expect(controller.requestAction).toHaveBeenCalledWith(
      action, expect.objectContaining({ kind: "demo_control" }));
  },
);

it("emits first changed-frame latency from pointer event timestamp", () => {
  renderInteractionRoom(asset, { onActionFrameMetric });
  pointerDownHitRegion("body", 1000);
  flushAnimationFrame(1064);
  expect(onActionFrameMetric).toHaveBeenCalledWith(expect.objectContaining({
    action: "bounce", pointerTimeStamp: 1000, rafTimeStamp: 1064, latencyMs: 64,
  }));
});

it("counts a variant-only blink frame for the requested run", () => {
  renderInteractionRoom(asset, { onActionFrameMetric });
  clickDemoControl("blink", 2000);
  flushAnimationFrameWithSample(2040, sampleWithVariant("eyes-state", "eyes-closed"));
  expect(onActionFrameMetric).toHaveBeenCalledWith(expect.objectContaining({
    action: "blink", latencyMs: 40,
  }));
});

it("does not count an old idle/restoring pose as the new requested action frame", () => {
  const harness = renderInteractionRoom(asset, { onActionFrameMetric, idleAction: "tail_wag" });
  const requestedRunId = pointerDownHitRegion("body", 3000);
  flushAnimationFrameForRun(3020, harness.oldIdleRunId, tailWagSample());
  expect(onActionFrameMetric).not.toHaveBeenCalled();
  flushAnimationFrameForRun(3060, requestedRunId, bounceChangedSample());
  expect(onActionFrameMetric).toHaveBeenCalledWith(expect.objectContaining({
    action: "bounce", latencyMs: 60,
  }));
});

it("recovers the active approved version after a direct room refresh", async () => {
  mockProject({ activeAssetVersionId: "version-7" });
  mockApprovedAsset("version-7", asset);
  renderInteractionPage("project-1");
  expect(await screen.findByTestId("interaction-stage")).toBeVisible();
  expect(lastApprovedAssetRequest()).toContain("/assets/version-7");
});
```

- [ ] **Step 2: Run interaction component tests and confirm RED**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/interaction/__tests__/InteractionStage.test.tsx
```

Expected: FAIL because interaction components do not exist.

- [ ] **Step 3: Implement stage, hit regions, and testable metrics**

`InteractionPage` first loads the owned project, requires non-null `activeAssetVersionId`, then loads that immutable asset; direct refresh must not depend on in-memory navigation state or a query-only version ID. Reuse Phase 2's `ProjectHandoffButton` in the room header so a READY project's current owner can explicitly transfer the same immutable asset to another browser without copying it. Create a motion-margin stage at least 10 grid cells beyond each character side. Render cached layer bitmaps in z-order with resolved world transforms. `InteractionStage` maps `SCREEN_LEFT_FRONT_PAW` to `raise_screen_left_front_paw` and other character hits to `bounce`; `ActionControls` exposes all five actions and both call `requestAction`. On stage/control trigger, preserve `event.timeStamp` and the returned `requestedRunId`. Emit only on the first rAF where `controller.currentRunId() === requestedRunId`, `currentAction()` equals the requested action, and the complete `AnimationSample` differs from neutral in either node poses or active variants. Old idle/restoring frames and changes from another run cannot satisfy the metric. Then invoke callback and dispatch the single frozen event:

```ts
window.dispatchEvent(new CustomEvent<ActionFrameMetric>("pindou:action-frame", {
  detail: { action, pointerTimeStamp, rafTimeStamp, latencyMs: rafTimeStamp - pointerTimeStamp },
}));
```

The event is diagnostic only and contains no project/image data.

- [ ] **Step 4: Run interaction unit suite, typecheck, and build**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/interaction
pnpm --filter @pindou/web typecheck
pnpm --filter @pindou/web build
```

Expected: all exit 0; interaction stage creates one image node per visible layer, not per bead.

- [ ] **Step 5: Commit interaction room**

```bash
git add apps/web/src/features/interaction apps/web/src/app/router.tsx
git commit -m "feat(web): add interactive bead pet room"
```

### Task 8: Define approved-only export records and cache repository

**Files:**
- Create: `apps/api/src/pindou_pet/modules/exports/__init__.py`
- Create: `apps/api/src/pindou_pet/modules/exports/models.py`
- Create: `apps/api/src/pindou_pet/modules/exports/db_models.py`
- Create: `apps/api/src/pindou_pet/modules/exports/repository.py`
- Create: `apps/api/tests/modules/exports/test_repository.py`
- Create: `migrations/versions/0006_exports.py`

**Interfaces:**
- Consumes: approved asset repository and private storage.
- Produces: `ExportRepository.find_valid_cache`, `insert_export`, `get_export`; cache identity is exact `(projectId, canonicalAssetHash, rendererVersion)` and never crosses anonymous project ownership.

- [ ] **Step 1: Write RED cache and immutability tests**

```python
def test_cache_hit_requires_hash_and_renderer_version(repository) -> None:
    repository.insert_export(export_record(project="p1", hash="abc", renderer="v1"))
    assert repository.find_valid_cache("p1", "abc", "v1") is not None
    assert repository.find_valid_cache("p1", "abc", "v2") is None
    assert repository.find_valid_cache("p1", "def", "v1") is None
    assert repository.find_valid_cache("p2", "abc", "v1") is None


def test_export_record_requires_approved_version(repository, draft_only_project) -> None:
    with pytest.raises(ApprovedAssetRequiredError):
        repository.insert_export(export_for(draft_only_project))
```

- [ ] **Step 2: Run repository tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/exports/test_repository.py -q
```

Expected: FAIL because exports module/table does not exist.

- [ ] **Step 3: Add export record model and repository**

Persist `export_id`, `project_id`, `approved_version_id`, `canonical_asset_hash`, `neutral_matrix_hash`, `renderer_version`, file content hashes/private storage keys, manifest JSON, `created_at`, and `expires_at=created_at+24h`; `project_id` and `approved_version_id` FKs use `ON DELETE CASCADE`, and any normalized export-file child rows cascade from `export_id`. Add a lookup index on `(project_id, canonical_asset_hash, renderer_version, expires_at)`. Never store draft revision as an export input, and never return a cache record whose `project_id` differs even when hashes match.

Define the renderer exchange types in `models.py`:

```python
class ExportFileKind(StrEnum):
    FULL_PNG = "FULL_PNG"
    LU_PNG = "LU_PNG"
    RU_PNG = "RU_PNG"
    LL_PNG = "LL_PNG"
    RL_PNG = "RL_PNG"
    PDF = "PDF"


class TemporaryRenderedFile(BaseModel):
    kind: ExportFileKind
    path: Path
    content_hash: str
    media_type: str
    canonical_asset_hash: str
    neutral_matrix_hash: str
    renderer_version: str


class RenderedFile(BaseModel):
    kind: ExportFileKind
    private_storage_key: str
    content_hash: str
    media_type: str
    canonical_asset_hash: str
    neutral_matrix_hash: str
    renderer_version: str


class PngBundle(BaseModel):
    files: dict[ExportFileKind, TemporaryRenderedFile]
```

Renderers return only `TemporaryRenderedFile(path=...)`. `ExportService` verifies those paths, publishes bytes through `ObjectStorage.put_atomic`, and only then creates `RenderedFile(privateStorageKey=...)` for persistence/API. A private storage key is never accepted by `Path`, Pillow or PdfReader.

- [ ] **Step 4: Run repository tests and confirm GREEN**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/exports/test_repository.py -q
```

Expected: PASS; renderer `v2` and project `p2` both miss without mutating or deleting project `p1` renderer `v1` files.

- [ ] **Step 5: Commit export persistence**

```bash
git add apps/api/src/pindou_pet/modules/exports migrations/versions/0006_exports.py apps/api/tests/modules/exports/test_repository.py
git commit -m "feat(exports): persist approved asset export records"
```

### Task 9: Render deterministic full-preview and four-board PNG files

**Files:**
- Create: `apps/api/src/pindou_pet/modules/exports/render_png.py`
- Create: `apps/api/tests/modules/exports/test_render_png.py`

**Interfaces:**
- Consumes: Task 1 neutral matrix/boards and frozen palette.
- Produces: `render_png_bundle(matrix, palette, output_dir) -> PngBundle` with full preview plus LU/RU/LL/RL images.

- [ ] **Step 1: Write RED image-open and orientation tests**

```python
def test_png_bundle_opens_and_uses_expected_dimensions(tmp_path) -> None:
    bundle = render_png_bundle(marker_matrix(), palette(), tmp_path)
    with Image.open(bundle.files[ExportFileKind.FULL_PNG].path) as image:
        assert image.size == (58 * 16, 58 * 16)
        assert image.mode == "RGBA"


def test_board_png_boundaries_are_not_mirrored(tmp_path) -> None:
    bundle = render_png_bundle(boundary_marker_matrix(), palette(), tmp_path)
    assert sample_board_cell(bundle.files[ExportFileKind.LU_PNG].path, 28, 28) == color("A")
    assert sample_board_cell(bundle.files[ExportFileKind.RU_PNG].path, 0, 28) == color("B")
```

Assert deterministic SHA-256 across two temp directories and labels/orientation markers outside the 29×29 data area.

- [ ] **Step 2: Run PNG tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/exports/test_render_png.py -q
```

Expected: FAIL with missing PNG renderer.

- [ ] **Step 3: Implement deterministic Pillow rendering**

Use fixed integer cell geometry, palette RGB, round bead exterior and center hole, bundled fixed-version font, no timestamps or random metadata. Save inside the supplied temporary directory, reopen/verify dimensions, and compute content hashes without publishing. Every `TemporaryRenderedFile` records the same canonical hash, neutral-matrix hash, and renderer version. Return exactly one `PngBundle.files` map with keys `FULL_PNG`, `LU_PNG`, `RU_PNG`, `LL_PNG`, and `RL_PNG`; Task 11 owns storage publication.

- [ ] **Step 4: Run PNG tests and confirm GREEN**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/exports/test_render_png.py -q
```

Expected: PASS; repeated renders have identical hashes and Pillow verifies all five files.

- [ ] **Step 5: Commit PNG rendering**

```bash
git add apps/api/src/pindou_pet/modules/exports/render_png.py apps/api/tests/modules/exports/test_render_png.py
git commit -m "feat(exports): render deterministic bead pattern PNGs"
```

### Task 10: Render the A4 1:1 PDF with calibration and material pages

**Files:**
- Create: `apps/api/src/pindou_pet/modules/exports/render_pdf.py`
- Create: `apps/api/tests/modules/exports/test_render_pdf.py`
- Create: `apps/api/src/pindou_pet/modules/exports/fonts/NotoSansSC-Regular.subset.ttf`
- Create: `apps/api/src/pindou_pet/modules/exports/fonts/LICENSE.txt`
- Modify: `pyproject.toml`

**Interfaces:**
- Consumes: neutral matrix, four boards, palette names/counts, `pegPitchMm`, approved hash.
- Produces: `render_pdf(manifest, output_path) -> TemporaryRenderedFile` with six A4 pages: full preview, four board pages, material list.

- [ ] **Step 1: Write RED PDF structure and physical-scale tests**

Add `pypdf>=5,<7` to root `[project].dependencies`, not only the `dev` extra, because production `ExportService` uses `PdfReader` before publishing a PDF. Reinstall the project before running the PDF tests; clean checkouts and production installs must not rely on a globally installed reader.

```python
def test_pdf_has_preview_four_boards_and_material_page(tmp_path) -> None:
    rendered = render_pdf(export_manifest(), tmp_path / "pattern.pdf")
    reader = PdfReader(rendered.path)
    assert len(reader.pages) == 6
    assert all(page.mediabox.width == pytest.approx(mm_to_points(210)) for page in reader.pages)
    assert all(page.mediabox.height == pytest.approx(mm_to_points(297)) for page in reader.pages)


def test_board_pitch_and_calibration_line_are_physical_size(tmp_path) -> None:
    rendered = render_pdf(export_manifest(peg_pitch_mm=5.0), tmp_path / "pattern.pdf")
    geometry = inspect_vector_geometry(rendered.path, page=1)
    assert geometry.peg_pitch_points == pytest.approx(mm_to_points(5.0), abs=0.01)
    assert geometry.calibration_line_points == pytest.approx(mm_to_points(50), abs=0.01)


def test_every_nonempty_board_cell_prints_its_color_code(tmp_path) -> None:
    manifest = export_manifest_with_unique_position_markers()
    rendered = render_pdf(manifest, tmp_path / "pattern.pdf")
    labels = inspect_cell_center_labels(rendered.path, pages=(1, 2, 3, 4))
    assert labels == expected_nonempty_cell_labels(manifest.boards, manifest.palette)
```

Assert text contains board ID/direction, brand/series/version, color IDs/names/counts, total, canonical hash, neutral-matrix hash, and renderer version.

- [ ] **Step 2: Run PDF tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/exports/test_render_pdf.py -q
```

Expected: FAIL with missing PDF renderer.

- [ ] **Step 3: Implement fixed-layout ReportLab rendering**

Register the bundled licensed font, define `mm_to_points(mm) = mm / 25.4 * 72`, and create ReportLab canvases with `invariant=1` so timestamps/object IDs do not change bytes. Center each 29×29 board without scaling away from `pegPitchMm`; for every nonempty cell, draw its frozen palette `printCode` at that peg center using a font size that stays inside one pitch. Draw row/column coordinates and joining markers outside the peg field, and add an exactly 50mm labeled line. Raise `BoardDoesNotFitA4Error` if `29 * pegPitchMm` plus fixed margins exceeds A4 rather than silently shrinking.

- [ ] **Step 4: Run PDF tests and confirm GREEN**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/exports/test_render_pdf.py -q
```

Expected: PASS; PDF opens, has six A4 pages, exact physical scale, and embedded Chinese-capable font.

- [ ] **Step 5: Commit PDF rendering and font attribution**

```bash
git add apps/api/src/pindou_pet/modules/exports/render_pdf.py apps/api/src/pindou_pet/modules/exports/fonts apps/api/tests/modules/exports/test_render_pdf.py pyproject.toml
git commit -m "feat(exports): render printable A4 bead pattern PDF"
```

### Task 11: Orchestrate approved-only export and risk acknowledgement

**Files:**
- Create: `apps/api/src/pindou_pet/modules/exports/service.py`
- Create: `apps/api/src/pindou_pet/modules/exports/renderer_manifest.py`
- Create: `apps/api/tests/modules/exports/test_service.py`

**Interfaces:**
- Consumes: approved repository, Tasks 1–2 and 8–10, private atomic storage.
- Produces: `ExportService.create_export(project_id, browser_session_id, approved_version_id, acknowledged_risk_ids) -> ExportManifest`.

- [ ] **Step 1: Write RED service tests for authority, counts, risk drift, and cache**

```python
def test_service_rejects_draft_or_wrong_project_version(service) -> None:
    with pytest.raises(ApprovedAssetRequiredError):
        service.create_export(project_id="p1", browser_session_id="s1", approved_version_id="draft", acknowledged_risk_ids=[])
    with pytest.raises(ApprovedAssetOwnershipError):
        service.create_export(project_id="p1", browser_session_id="s1", approved_version_id=version_for("p2"), acknowledged_risk_ids=[])


def test_current_risks_must_be_acknowledged_exactly(service) -> None:
    with pytest.raises(UnacknowledgedRisksError) as exc:
        service.create_export("p1", "s1", risky_version(), acknowledged_risk_ids=[])
    assert exc.value.required_ids == ["ISOLATED:1:1"]


def test_manifest_counts_match_matrix_and_files_share_hash(service) -> None:
    manifest = service.create_export("p1", "s1", safe_version(), [])
    assert sum(item.count for item in manifest.materials) == manifest.total_beads
    assert all(file.canonical_asset_hash == manifest.canonical_asset_hash
               for file in manifest.files.values())
    assert all(file.neutral_matrix_hash == manifest.neutral_matrix_hash
               for file in manifest.files.values())


def test_published_files_are_opened_through_object_storage(service, object_storage) -> None:
    manifest = service.create_export("p1", "s1", safe_version(), [])
    for rendered in manifest.files.values():
        with object_storage.open(rendered.private_storage_key) as stream:
            assert hashlib.sha256(stream.read()).hexdigest() == rendered.content_hash


def test_identical_asset_hash_does_not_cross_project_cache_boundary(service) -> None:
    first = service.create_export("p1", "s1", shared_hash_version("p1"), [])
    second = service.create_export("p2", "s2", shared_hash_version("p2"), [])
    assert first.export_id != second.export_id
    assert first.project_id == "p1" and second.project_id == "p2"


def test_cache_hit_still_requires_current_owner(service, cached_export, stranger_session) -> None:
    with pytest.raises(ProjectNotFound):
        service.create_export(
            "p1", stranger_session.id, cached_export.approved_version_id, []
        )


def test_claim_and_cache_hit_are_linearized(service, cached_export, owner, receiver, race) -> None:
    export_status, claim_status = race(
        lambda: service.create_export(
            "p1", owner.id, cached_export.approved_version_id, []
        ),
        lambda: claim_project(receiver, "p1"),
    )
    assert claim_status == 200
    assert export_status in {200, 404}
    assert no_old_owner_export_response_after_claim("p1")
```

Test obsolete acknowledgements do not acknowledge a newly introduced stable risk ID, cache hit avoids renderer calls, and renderer-version change creates a new record without overwriting old files.
Also change one of Pillow version, ReportLab version, pypdf version, font checksum or rendering-parameter checksum in a fake manifest and assert the cache misses.

- [ ] **Step 2: Run service tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/exports/test_service.py -q
```

Expected: FAIL because export service does not exist.

- [ ] **Step 3: Implement strict orchestration order**

The service starts with a short authorization/read transaction before any project-derived error or cache return: open `BEGIN IMMEDIATE`, call `require_project_owner_in_transaction(project_id, browser_session_id)`, load the project-scoped active approved version, validate its canonical hash, compute/read current risks, and look up the project-local cache. A valid cache hit returns only from this guarded transaction; wrong owner/project returns 404 before revealing version/risk/cache details. On cache miss, capture immutable input hashes and leave the transaction, then compose/validate/render into an unreferenced private temporary directory. The final publication path opens a second `BEGIN IMMEDIATE`, repeats the owner guard and re-reads active version/current risks/cache. If state/acknowledgements changed it discards temp output; if a concurrent winner filled the cache it returns that guarded hit; otherwise it publishes private objects and inserts DB references before commit. Any failure removes staged/unreferenced outputs. This linearizes both cache-hit and cache-miss paths against handoff without holding a stale route authorization. The service must:

1. load the requested immutable version scoped to project;
2. validate its canonical hash;
3. compose neutral matrix;
4. compute current risks;
5. compare required IDs with submitted acknowledgements;
6. return a cached record only if `(projectId, hash, rendererVersion)` remains valid;
7. render PNG/PDF as `TemporaryRenderedFile(path=...)` inside a temporary directory;
8. verify temp paths with Pillow/PdfReader and check canonical/neutral-matrix/renderer hashes plus all counts;
9. read each verified temp file and publish it with `ObjectStorage.put_atomic(namespace=f"projects/{project_id}/exports/{export_id}", data=path.read_bytes())`, create `RenderedFile(privateStorageKey=...)`, verify via `ObjectStorage.open`, then insert the export record.

Build a canonical `RendererManifest` containing application renderer schema `pindou-export-v1`, exact runtime Pillow/ReportLab/pypdf versions, bundled font SHA-256, PNG/PDF drawing-parameter checksum and relevant color/profile settings. Set public `rendererVersion = "pindou-export-v1:" + sha256(canonical_manifest)[:16]` and persist the complete manifest/checksum with each export. The cache key uses that derived version; any dependency/font/parameter change is therefore a miss and cannot silently reuse old bytes. Interval dependencies remain acceptable only because runtime identity is bound this way.

- [ ] **Step 4: Run service tests and confirm GREEN**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/exports/test_service.py -q
```

Expected: PASS; no test can obtain an export from draft JSON or animated poses.

- [ ] **Step 5: Commit export orchestration**

```bash
git add apps/api/src/pindou_pet/modules/exports/service.py \
  apps/api/src/pindou_pet/modules/exports/renderer_manifest.py \
  apps/api/tests/modules/exports/test_service.py
git commit -m "feat(exports): build approved-only export bundles"
```

### Task 12: Expose export creation, manifest, and file endpoints

**Files:**
- Create: `apps/api/src/pindou_pet/modules/exports/routes.py`
- Create: `apps/api/tests/modules/exports/test_routes.py`
- Modify: `apps/api/src/pindou_pet/api/router.py`
- Modify: `packages/contracts/src/generated.ts`

**Interfaces:**
- Consumes: Task 11 service and existing signed anonymous session/file streaming helpers.
- Produces:
  - `POST /api/v1/projects/{project_id}/exports`
  - `GET /api/v1/projects/{project_id}/exports/{export_id}`
  - `GET /api/v1/projects/{project_id}/exports/{export_id}/files/{file_kind}`

- [ ] **Step 1: Write RED route tests**

```python
def test_unacknowledged_risks_return_409_with_current_ids(client, risky_project) -> None:
    response = client.post(
        f"/api/v1/projects/{risky_project.id}/exports",
        json={"approvedVersionId": risky_project.version_id, "acknowledgedRiskIds": []},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PHYSICAL_RISK_ACK_REQUIRED"
    assert response.json()["error"]["details"]["risks"][0]["id"] == "ISOLATED:1:1"


def test_file_endpoint_is_project_scoped_and_private(client, project) -> None:
    export = create_export(client, project)
    assert client.get(file_url(export, "PDF"), headers=session_for(project)).status_code == 200
    assert client.get(file_url(export, "PDF"), headers=session_for(other_project())).status_code == 404
```

- [ ] **Step 2: Run route tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/exports/test_routes.py -q
```

Expected: FAIL because export router is not registered.

- [ ] **Step 3: Implement exact request/response contracts**

```python
class CreateExportRequest(BaseModel):
    approved_version_id: str = Field(alias="approvedVersionId")
    acknowledged_risk_ids: list[str] = Field(alias="acknowledgedRiskIds")


class ExportManifestResponse(BaseModel):
    export_id: str = Field(alias="exportId")
    approved_version_id: str = Field(alias="approvedVersionId")
    canonical_asset_hash: str = Field(alias="canonicalAssetHash")
    neutral_matrix_hash: str = Field(alias="neutralMatrixHash")
    renderer_version: str = Field(alias="rendererVersion")
    boards: list[BoardManifest]
    materials: list[MaterialCount]
    total_beads: int = Field(alias="totalBeads")
    risks: list[PhysicalRisk]
    files: dict[ExportFileKind, ExportFileResponse]
    expires_at: datetime = Field(alias="expiresAt")
```

The POST route authenticates the browser session only and passes `browser_session_id` into `create_export`; it does not reuse a route-level project-ownership check. Add a claim-vs-create-export race test proving the old owner either commits before claim or receives 404, with no export row/file reference committed afterward. `ExportFileResponse` exposes `kind`, `contentHash`, `mediaType`, `canonicalAssetHash`, `neutralMatrixHash`, `rendererVersion`, and a project-scoped `downloadPath`; it never exposes `privateStorageKey`. Return `201` for a new render, `200` for a project-local cache hit, `409` for missing current acknowledgements, `422` for invalid approved data, and `404` for cross-project access. All failures reuse `{error:{code,message,details?}}`; current risk objects live under `error.details.risks`. Stream files by `ExportFileKind` as attachments with no permanent public URL.

- [ ] **Step 4: Run route tests and full export backend suite**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_neutral_matrix.py apps/api/tests/modules/assets/test_risk.py apps/api/tests/modules/exports -q
make contracts
pnpm contracts:check
```

Expected: PASS; file responses carry correct content type and a private attachment filename, and generated export contracts have no drift.

- [ ] **Step 5: Commit export API**

```bash
git add apps/api/src/pindou_pet/modules/exports/routes.py apps/api/src/pindou_pet/api/router.py apps/api/tests/modules/exports/test_routes.py packages/contracts
git commit -m "feat(api): expose private physical export bundles"
```

### Task 13: Regenerate contracts and build the export API client

**Files:**
- Modify: `packages/contracts/src/generated.ts`
- Create: `apps/web/src/features/export/api/exportApi.ts`
- Create: `apps/web/src/features/export/__tests__/exportApi.test.ts`

**Interfaces:**
- Consumes: Task 12 OpenAPI and existing Web request/session wrapper.
- Produces: typed `createExport`, `getExportManifest`, `getExportFileBlob`, and `PhysicalRiskAckRequiredError`.

- [ ] **Step 1: Write RED client tests**

```ts
it("maps 409 risk response to a typed error with stable ids", async () => {
  server.use(riskAckResponse([{ id: "ISOLATED:1:1", kind: "ISOLATED", x: 1, y: 1 }]));
  await expect(createExport("p1", "v1", [])).rejects.toMatchObject({
    risks: [expect.objectContaining({ id: "ISOLATED:1:1" })],
  });
});

it("fetches files as authenticated blobs instead of public urls", async () => {
  const blob = await getExportFileBlob("p1", "e1", "PDF");
  expect(blob.type).toBe("application/pdf");
});
```

- [ ] **Step 2: Run client tests and confirm RED**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/export/__tests__/exportApi.test.ts
```

Expected: FAIL because export API client/generated response types are absent.

- [ ] **Step 3: Regenerate and implement the thin client**

Run:

```bash
make contracts
```

Expected: generated export request/manifest/risk types appear, including `files: Record<ExportFileKind, ExportFileResponse>` and `neutralMatrixHash`. Implement the client without defining parallel DTO interfaces; download through authenticated fetch and `URL.createObjectURL` only for the current browser session.

- [ ] **Step 4: Run client tests, contracts check, and typecheck**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/export/__tests__/exportApi.test.ts
pnpm contracts:check
pnpm --filter @pindou/web typecheck
```

Expected: all exit 0 with no OpenAPI generation drift.

- [ ] **Step 5: Commit generated contracts and export client**

```bash
git add packages/contracts apps/web/src/features/export/api/exportApi.ts apps/web/src/features/export/__tests__/exportApi.test.ts
git commit -m "feat(web): add typed physical export API"
```

### Task 14: Build the export preview, materials, risk confirmation, and download page

**Files:**
- Create: `apps/web/src/features/export/components/ExportPage.tsx`
- Create: `apps/web/src/features/export/components/BoardPreview.tsx`
- Create: `apps/web/src/features/export/components/MaterialTable.tsx`
- Create: `apps/web/src/features/export/components/RiskConfirmation.tsx`
- Create: `apps/web/src/features/export/__tests__/ExportPage.test.tsx`
- Create: `apps/web/src/features/export/__tests__/RiskConfirmation.test.tsx`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:**
- Consumes: Task 13 API plus project GET `activeAssetVersionId`; no navigation-only version context.
- Produces: `/projects/:projectId/export`, four-board preview, counts, current-risk acknowledgement, PNG/PDF downloads.

- [ ] **Step 1: Write RED page tests**

```tsx
it("renders boards in fixed LU RU LL RL order and matching total count", async () => {
  renderExportPage(manifestFixture());
  expect(await screen.findAllByRole("img", { name: /底板/ })).toHaveLength(4);
  expect(boardLabels()).toEqual(["左上", "右上", "左下", "右下"]);
  expect(screen.getByText("总计 1248 颗")).toBeVisible();
});

it("requires each current risk before retrying export", async () => {
  renderExportPageWithRisk409(twoRiskFixture());
  expect(screen.getByRole("button", { name: "确认风险并生成" })).toBeDisabled();
  await acknowledgeAllCurrentRisks();
  await user.click(screen.getByRole("button", { name: "确认风险并生成" }));
  expect(createExport).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), [
    "DIAGONAL_ONLY:2:2", "ISOLATED:1:1",
  ]);
});

it("recovers the active approved version on direct export refresh", async () => {
  mockProject({ activeAssetVersionId: "version-7" });
  renderExportRoute("project-1");
  await user.click(await screen.findByRole("button", { name: "生成实体图纸" }));
  expect(createExport).toHaveBeenCalledWith("project-1", "version-7", []);
});

it("warns that screen and physical bead colors may differ", () => {
  renderExportPage(manifestFixture());
  expect(screen.getByText(/屏幕显示与实物及不同批次可能存在色差/)).toBeVisible();
});
```

- [ ] **Step 2: Run export UI tests and confirm RED**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/export/__tests__/ExportPage.test.tsx src/features/export/__tests__/RiskConfirmation.test.tsx
```

Expected: FAIL because export page components do not exist.

- [ ] **Step 3: Implement the minimum complete export experience**

On load, fetch the owned project and require its persisted `activeAssetVersionId`; a direct refresh cannot rely on router memory or a query-only version value. Reuse Phase 2's `ProjectHandoffButton` in the export header. Show `manifest.files.FULL_PNG`, four labeled board images from `LU_PNG/RU_PNG/LL_PNG/RL_PNG`, orientation/join markers, brand/series/palette version, material table sorted by `colorId`, total count, canonical hash and neutral-matrix hash short forms, renderer version, and expiry. Beside the material table show the fixed notice “屏幕显示与实物及不同批次可能存在色差，请以实际拼豆为准”。On 409, discard prior checkbox state, display the exact current risks over the board preview, require each checkbox, then retry with sorted current IDs. Download `files.PDF`/PNG through authenticated blobs and revoke object URLs after use.

- [ ] **Step 4: Run export tests, typecheck, and build**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/export
pnpm --filter @pindou/web typecheck
pnpm --filter @pindou/web build
```

Expected: all exit 0; no UI path accepts a draft ID or constructs a public persistent file URL.

- [ ] **Step 5: Commit export page**

```bash
git add apps/web/src/features/export apps/web/src/app/router.tsx
git commit -m "feat(web): add physical bead pattern export page"
```

### Task 15: Add deterministic visual and real-device interaction performance E2E coverage

**Files:**
- Create: `apps/web/e2e/interaction.spec.ts`
- Create: `apps/web/e2e/fixtures/approved/{F01,F02,F03,F04,F05}.json`
- Create: `config/interaction-performance-devices.json`
- Create: `tools/device/android-chrome.mjs`
- Create: `tools/device/android-chrome.test.mjs`
- Create: `apps/web/e2e/device/androidChrome.ts`
- Modify: `tests/e2e/seed_project.py`
- Modify: `apps/web/playwright.config.ts`
- Create: `apps/web/playwright.visual.config.ts`

**Interfaces:**
- Consumes: five synthetic/deterministic approved fixture assets `F01`–`F05`, Task 7 diagnostic event, and frozen desktop/mobile device records. These are instrumentation fixtures, not the Phase 5 private formal cats.
- Produces: test-clock-only visual snapshots plus real-clock per-device/per-fixture/per-action JSON containing 30 first-frame samples, P95, maximum, and action-frame-time P95.

- [ ] **Step 1: Write the RED Playwright tests**

```ts
test.describe("visual clock only", () => {
  for (const action of ACTION_NAMES) {
    test(`${action} deterministic keyframe`, async ({ page }) => {
      await seedApprovedAsset(page, "F01");
      await page.goto("/projects/F01/room?testClock=1");
      await setTestClock(page, keyframeTime(action));
      expect(await page.locator("[data-testid=interaction-stage]").screenshot())
        .toMatchSnapshot(`${action}-keyframe.png`);
    });
  }
});

test.describe("real performance clock", () => {
  for (const fixtureId of ["F01", "F02", "F03", "F04", "F05"] as const) {
    for (const action of ACTION_NAMES) {
      test(`@hardware-performance ${fixtureId} ${action} real rAF metrics`, async ({ page }, testInfo) => {
        await seedApprovedAsset(page, fixtureId);
        await page.goto(`/projects/${fixtureId}/room`);
        expect(await page.evaluate(() => new URL(location.href).searchParams.has("testClock")))
          .toBe(false);
        await warmAction(page, action, 3);
        const metrics = await triggerActionAndCollectRealRaf(page, action, 30);
        const report = {
          fixtureId, action, deviceProject: testInfo.project.name,
          sampleCount: 30,
          firstFrameP95Ms: percentile(metrics.latencies, 95),
          firstFrameMaxMs: Math.max(...metrics.latencies),
          frameTimeP95Ms: percentile(metrics.frameTimes, 95),
        };
        expect(report.firstFrameMaxMs).toBeLessThanOrEqual(200);
        expect(report.frameTimeP95Ms).toBeLessThanOrEqual(33.3);
        await testInfo.attach(`${fixtureId}-${action}-performance.json`, {
          body: JSON.stringify(report), contentType: "application/json",
        });
      });
    }
  }
});
```

- [ ] **Step 2: Run E2E and confirm RED**

Run:

```bash
pnpm --filter @pindou/web test:e2e -- interaction.spec.ts --project=chromium-ci --grep-invert @hardware-performance
```

Expected: FAIL until visual-only clock injection and the five approved instrumentation fixtures are wired; hardware timing remains an explicit Step 4 gate.

- [ ] **Step 3: Add test-only clock injection without changing production semantics**

Under the explicit visual-only Vite mode `pindou-visual-test`, expose controller clock advance only to visual tests; throw if a performance collector detects that build flag or `testClock`. Production/performance always uses `performance.now()` and real `requestAnimationFrame`. Extend the non-HTTP `tests/e2e/seed_project.py` helper so `seedApprovedAsset` prepares approved fixtures in the temporary E2E DB before navigation; never add a test-control API. `config/interaction-performance-devices.json` freezes desktop and one dedicated Android test phone: hashed ADB serial, manufacturer/model, Android build, Chrome package/version, DPR, viewport and transport `android-chrome-adb-cdp-v1`.

`tools/device/android-chrome.mjs` is the only mobile transport. `preflight` verifies `PINDOU_ANDROID_SERIAL`, `adb -s <serial> get-state`, manifest identity/build/Chrome version, then establishes `adb reverse tcp:4173 tcp:4173` and `adb forward tcp:9223 localabstract:chrome_devtools_remote`. Thus `http://127.0.0.1:4173` in phone Chrome reaches the host same-origin gateway rather than the phone itself. It opens one dedicated test tab, exposes its CDP endpoint to `apps/web/e2e/device/androidChrome.ts`, and `cleanup` closes only that tab and removes both mappings. Add `with-session --manifest <file> -- <command...>` that performs preflight, runs one child command, and cleanup in a `finally`/signal handler while preserving the child's exit code; unit tests cover child failure and SIGINT cleanup. The fixture uses Playwright `chromium.connectOverCDP`, imports the synthetic-fixture owner HttpOnly cookie with `context.addCookies`, verifies `/api/v1` through the Vite proxy, browser version/viewport/DPR and canonical hash, then runs real-rAF assertions. This cookie import is only for Phase 4 deterministic fixture instrumentation; Phase 5 formal product evidence must use real ownership handoff. Missing ADB/CDP, a version mismatch or inaccessible gateway is a hard failure, not an emulation fallback.

`android-chrome.test.mjs` uses temporary fake `adb` and child executables, never a physical phone. One case makes the child exit nonzero and asserts the wrapper preserves that code after closing the dedicated tab and removing both mappings; another spawns the CLI, waits until preflight is complete, sends SIGINT, and asserts the child is terminated, cleanup runs exactly once, the two mappings are removed, and the wrapper exits with interruption semantics. A timeout or leftover child fails the test and is force-cleaned by the test fixture.

Define a local non-hardware `chromium-ci` project and separate opt-in `frozen-desktop-real`/`frozen-mobile-real` projects in the main config; every physical timing test carries `@hardware-performance`. Because Playwright `webServer` is top-level, create `playwright.visual.config.ts` for the sole `visual-test` project; it inherits shared timeouts/fixtures but starts Vite on port 4174 with `--mode pindou-visual-test`. The main config always serves the production clock on 4173. `frozen-mobile-real` uses the Android fixture above; desktop viewport emulation is diagnostic only. Collect rAF deltas and `pindou:action-frame` events; write per-fixture/action P95 and maximum attachments. Freeze screenshots separately at neutral plus one meaningful keyframe per action.

- [ ] **Step 4: Run visual snapshots separately, then real timing on both frozen devices**

Run:

```bash
node --test tools/device/android-chrome.test.mjs
pnpm --filter @pindou/web exec playwright test interaction.spec.ts \
  --config=playwright.visual.config.ts --project=visual-test \
  --grep "visual clock only" --update-snapshots
pnpm --filter @pindou/web test:e2e -- interaction.spec.ts \
  --config=playwright.visual.config.ts --project=visual-test --grep "visual clock only"
node tools/device/android-chrome.mjs with-session \
  --manifest config/interaction-performance-devices.json -- \
  pnpm --filter @pindou/web test:e2e -- interaction.spec.ts \
    --project=frozen-desktop-real --project=frozen-mobile-real \
    --grep "real performance clock"
```

The update command is permitted only to create/review baselines. Inspect every generated image, then require the ordinary `visual-test` command to pass without updates. The `with-session` wrapper owns mobile cleanup on success, child failure and interruption; Playwright global teardown may call idempotent cleanup as a second safety net.

Expected: PASS; visual snapshots use test clock only. Real timing emits 2 devices × 5 deterministic fixtures × 5 actions reports, each with exactly 30 samples after 3 warmups, real-rAF first-frame P95/maximum, and frame-time P95 ≤33.3ms; every first-frame maximum is ≤200ms. No Phase 5 private input is required.

- [ ] **Step 5: Commit interaction acceptance tests**

```bash
git add apps/web/e2e/interaction.spec.ts apps/web/e2e/interaction.spec.ts-snapshots \
  apps/web/e2e/fixtures/approved apps/web/playwright.config.ts \
  apps/web/src/features/interaction config/interaction-performance-devices.json \
  tools/device/android-chrome.mjs tools/device/android-chrome.test.mjs \
  apps/web/e2e/device/androidChrome.ts \
  tests/e2e/seed_project.py apps/web/playwright.visual.config.ts
git commit -m "test(e2e): verify pet actions and interaction timing"
```

### Task 16: Add approved-only export E2E and complete Phase 4 verification

**Files:**
- Create: `apps/web/e2e/export.spec.ts`
- Modify: `tests/e2e/seed_project.py`
- Modify: `apps/web/playwright.config.ts`
- Modify: `config/interaction-performance-devices.json`

**Interfaces:**
- Consumes: completed interaction/export implementation and deterministic approved fixture.
- Produces: executable end-to-end proof that approved neutral data alone generates correct boards, counts, PNG, and PDF.

- [ ] **Step 1: Write the RED export path**

```ts
test("acknowledges risks and downloads matching approved-only files", async ({ page }) => {
  const seeded = await seedApprovedRiskyAsset(page, "export-main-path");
  await page.goto("/projects/export-main-path/export");
  await page.getByRole("button", { name: "生成实体图纸" }).click();
  await expect(page.getByText(/发现制作风险/)).toBeVisible();
  await acknowledgeAllCurrentRisks(page);
  await page.getByRole("button", { name: "确认风险并生成" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await expect(page.getByText(seeded.canonicalAssetHash.slice(0, 12))).toBeVisible();
  expect(await boardOrder(page)).toEqual(["左上", "右上", "左下", "右下"]);
  expect(await displayedMaterialTotal(page)).toBe(await occupiedMatrixCells(seeded));
  await assertDownloadOrRecordCapability(page, test.info(), "下载 PNG", "image/png");
  await assertDownloadOrRecordCapability(page, test.info(), "下载 PDF", "application/pdf");
});

test("never exports the currently displayed animation pose", async ({ page }) => {
  const seeded = await seedApprovedAsset(page, "export-while-bouncing");
  await startBounce(page, seeded.projectId);
  const manifest = await requestExportFromPage(page, seeded.projectId);
  expect(manifest.neutralMatrixHash).toBe(seeded.neutralMatrixHash);
});

test("@hardware-performance frozen physical mobile keeps the full export preview operable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "frozen-mobile-real", "physical mobile project only");
  await seedApprovedRiskyAsset(page, "export-mobile-path");
  await page.goto("/projects/export-mobile-path/export");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.getByRole("button", { name: "生成实体图纸" }).click();
  await acknowledgeAllCurrentRisks(page);
  await page.getByRole("button", { name: "确认风险并生成" }).click();
  for (const label of ["左上", "右上", "左下", "右下"]) {
    await expect(page.getByRole("img", { name: new RegExp(label) })).toBeVisible();
  }
  await expect(page.getByRole("table", { name: "材料清单" })).toBeVisible();
  await assertDownloadOrRecordCapability(page, testInfo, "下载 PDF", "application/pdf");
});
```

- [ ] **Step 2: Run export E2E and confirm RED**

Run:

```bash
pnpm --filter @pindou/web test:e2e -- export.spec.ts --project=chromium-ci
```

Expected: FAIL until the final route, risk retry, and file download wiring are complete.

- [ ] **Step 3: Fix only acceptance wiring and add file-artifact inspection**

Have Playwright save supported downloads into its test output. The existing non-HTTP seed CLI prepares risky approved fixtures in the temporary E2E DB before navigation. `config/interaction-performance-devices.json` records `capabilities.downloads` per frozen device. `assertDownloadOrRecordCapability` opens and verifies the file when true; when false it records one `capability-exception` annotation for the download action only and continues all preview, board, material-table, and risk-confirmation assertions—never skip the mobile test wholesale. After the browser path, use the test helper to open PNG dimensions and PDF page count; compare manifest hash, total beads, four-board recomposition hash, and file metadata. Do not add a test HTTP route or any draft fallback when an approved ID is absent.

- [ ] **Step 4: Run the complete Phase 4 verification matrix**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_neutral_matrix.py apps/api/tests/modules/assets/test_risk.py apps/api/tests/modules/exports -q
pnpm --filter @pindou/web test --run src/features/interaction src/features/export
node --test tools/device/android-chrome.test.mjs
pnpm --filter @pindou/web test:e2e -- interaction.spec.ts \
  --config=playwright.visual.config.ts --project=visual-test --grep "visual clock only"
node tools/device/android-chrome.mjs with-session \
  --manifest config/interaction-performance-devices.json -- \
  pnpm --filter @pindou/web test:e2e -- interaction.spec.ts export.spec.ts \
    --project=frozen-desktop-real --project=frozen-mobile-real \
    --grep "real performance clock|acknowledges risks|never exports|frozen physical mobile"
pnpm contracts:check
pnpm --filter @pindou/web typecheck
pnpm --filter @pindou/web build
git diff --check
```

Expected: every command exits 0; Python opens every generated PNG/PDF; four boards recompose exactly; real performance contains the complete two-device/five-fixture/five-action report matrix and never uses test clock; frozen physical mobile has no horizontal overflow and keeps four boards/materials/risks operable, with any unsupported download recorded only as a capability exception; `git diff --check` prints nothing.

- [ ] **Step 5: Commit the Phase 4 acceptance gate**

```bash
git add apps/web/e2e/export.spec.ts apps/web/playwright.config.ts config/interaction-performance-devices.json tests/e2e/seed_project.py
git commit -m "test(e2e): verify approved-only physical exports"
```

## Phase 4 self-review checklist

- [ ] Pure sampler covers all five actions and exact terminal neutral pose without wall-clock dependency.
- [ ] Parent-before-child transforms, global pivots, variant visibility, and no-scale contract have unit tests.
- [ ] Idle cancellation is tested at 99/100/101ms and user actions never queue.
- [ ] Runtime rendering is one cached bitmap per layer, not thousands of Konva nodes.
- [ ] Test clock is visual-only; Phase 4 real first-frame metrics use pointer timestamp and the first changed rAF on frozen desktop/mobile for each of five deterministic fixture assets, with 30 samples after three warmups and per-fixture P95/max output; Phase 5 repeats the matrix for private `C01`–`C05`.
- [ ] Neutral composition excludes auxiliary layers, chooses open-eye neutral variant, ignores animation, and respects top z-order.
- [ ] Board boundary cells 28/29 prove fixed LU/RU/LL/RL slicing without mirror/rotation.
- [ ] Four-neighbor isolated, diagonal-only, and articulation warnings have stable exact IDs.
- [ ] Export requires an approved version owned by the project and current risk acknowledgements; cache lookup includes project ID and never reuses files across anonymous projects.
- [ ] Renderers return temporary paths; only ObjectStorage publication creates private keys, and no image/PDF reader treats a key as a filesystem path.
- [ ] PNG/PDF/materials use files-by-kind and all record one canonical hash, neutral-matrix hash, and renderer version; renderer upgrades miss cache without rewriting older files.
- [ ] PDF has six A4 pages, 1:1 peg pitch, one printed color code in every nonempty board cell, a 50mm calibration line, fixed font attribution, and no silent scale-to-fit.
- [ ] Frozen physical mobile export preview has no horizontal overflow and keeps all four boards, materials and risk controls operable; unsupported downloads are capability exceptions only.
- [ ] 占位词扫描无命中，所有实现步骤均给出精确文件、接口、测试命令和预期结果。
