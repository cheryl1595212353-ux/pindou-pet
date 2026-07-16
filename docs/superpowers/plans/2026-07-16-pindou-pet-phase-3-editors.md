# 拼豆宠物 Phase 3：高清拆层校正与 58×58 逐豆编辑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Phase 1–2 已完成的项目、上传、生成任务和用户已确认高清透明形象之上，先通过本地可恢复的 `LAYER_GENERATION` 自动生成高清分层草稿，再交付桌面端图层校正、确定性 58×58 拼豆量化、逐豆编辑，以及通过严格校验产生不可变 approved asset 的完整闭环。

**Architecture:** FastAPI 中的 `assets` 模块是角色资产唯一事实源。用户确认高清形象后，既有 RQ/job 基础设施运行不调用生成 Provider 的本地 `LAYER_GENERATION`，使用 Phase 1 冻结 perception bundle 和确定性补全算法创建 SourceLayer、rig 节点、默认动作与检查点，成功保存草稿后才进入 `LAYER_REVIEW`。后续使用 Pydantic 判别联合定义编辑操作，以 SQLite `revision` 乐观锁保存可变草稿，并在批准时生成包含高清源层和拼豆层的不可变快照。React/Konva 只负责呈现和生成领域编辑操作，不保存 Konva JSON；所有色板、量化、规范化哈希和最终批准校验由后端负责。

**Tech Stack:** Python 3.12、FastAPI、Pydantic v2、SQLAlchemy 2、Pillow、NumPy、pytest；React 19、TypeScript、Vite、react-konva、Vitest、Testing Library、Playwright；pnpm workspace。

## Global Constraints

- 仅支持猫，固定模板为脸朝向用户、身体向画面右侧偏转约 20°、尾巴位于画面右侧的三分之四坐姿。
- 高清拆层和逐豆编辑器只承诺桌面浏览器，验收视口不小于 `1280×800`。
- 六个必需逻辑组是 `BODY`、`HEAD`、`SCREEN_LEFT_FRONT_PAW`（画面左前爪）、`SCREEN_RIGHT_FRONT_PAW`（画面右前爪）、`TAIL`、`EYES`；允许最多两个确有独立运动或遮挡需求的可选逻辑组。
- 这六个必需逻辑组与 Phase 0 `PartLabel` 一一同值；`FOREGROUND` 不进入资产逻辑组，`EYES_OPEN`／`EYES_CLOSED` 只作为 `sourceLayerId`／variant 区分并都使用 `partLabel=EYES`。可选第 7–8 组不在首版局部 Provider 重生成合同内。
- 资产与动作方向一律按画面坐标命名；不得把 `SCREEN_LEFT_FRONT_PAW`／`SCREEN_RIGHT_FRONT_PAW` 写成猫解剖学左右。输入照片的猫左前／右前拍摄方向沿用 Phase 2 `PhotoView`，不得复用为资产部件 ID。
- 固定角色模板的 `TAIL` 必须位于画面右侧；校正工具不能把首版尾巴语义改成画面左侧模板。
- Phase 2 不产生拆层；Phase 3 必须先完成本地 `LAYER_GENERATION` 检查点，生成可通过 `validate_layer_review_draft` 的草稿后才允许打开校正工作台。
- `nodeId` 是 source/bead/animation 间稳定 rig 标识；量化不得重新生成节点 ID，所有动画轨道只引用 `targetNodeId`。
- 睁眼／闭眼共同属于 `eyes` 变体组；隐藏补丁、阴影等 `physicalExport=false` 辅助层不计入 6–8 个逻辑组。
- 所有拼豆层共用一个 `58×58` 全局坐标系；原点在左上，`x` 向右、`y` 向下，单位为一格。
- 所有层的中立变换必须为单位变换；动画和编辑模型不得存在缩放字段。
- 父变换先于子变换；父子图无环；眼睛跟随头部，头、前爪和尾巴跟随身体。
- 同一图层同一格最多一颗豆；透明格是“无单元格”，白色豆是合法 `colorId`，两者不得混淆。
- 冻结一套真实品牌／系列色板；8 位 sRGB 使用 D65 白点转 CIELAB 和固定版本 CIEDE2000；色差并列按 `colorId` 升序选择。
- 部署色板只从 `config/palette.freeze.json` 加载；该文件必须记录来源 URL、来源提交、MIT 许可证路径、品牌、系列、版本、孔距、颜色清单和颜色清单 SHA-256，启动、量化和批准均校验同一 checksum。
- 规范量化参数只从 `config/quantizer.freeze.json` 加载；Task 0 在任何 `DraftAsset` fixture/草稿产生前冻结它，后续量化实现必须逐字段匹配而不得改写。
- 全角色自动选择最多 32 色的一个全局子色板；默认关闭抖动；图层不得独立量化或自行扩展子色板。
- 草稿保存必须携带 `revision`；陈旧 revision 返回 `409 STALE_REVISION`，不得覆盖服务端新版本。
- 规范化资产 JSON 使用 UTF-8、字典键排序和稳定数组顺序；`canonicalAssetHash` 覆盖高清／拼豆层、动作、完整色板清单和量化清单。
- approved asset 不可变；批准后的后续编辑必须从已批准版本派生新草稿，不能原位修改快照。
- 继承 Phase 2 所有权竞态合同：HTTP 写路由只认证浏览器会话，并将 `browser_session_id` 传给服务；`LAYER_GENERATION`／`PART_REGENERATION` 创建、媒体上传、draft PATCH、三门确认、量化、批准都必须在实施 mutation 的同一 `BEGIN IMMEDIATE` 内调用 `require_project_owner_in_transaction`，不得使用路由层缓存的 owner 结果。
- 不在本阶段实现生成队列、供应商、TTL 清理、互动房间或 PNG/PDF；这些分别属于 Phase 2、Phase 4/5。
- 所有 Python 命令使用 `.venv/bin/python`；所有 Web 命令使用 `pnpm`，不使用 npm、yarn 或系统 Python。
- 任何任务运行 `make contracts` 都必须同时提交 `packages/contracts/openapi.json` 与 `packages/contracts/src/generated.ts`，提交命令使用 `git add packages/contracts`；下文单列 generated 路径只是简称。

## File map

```text
apps/api/src/pindou_pet/modules/assets/
├── __init__.py             # assets 模块公开入口
├── models.py               # canonical draft/approved Pydantic 类型
├── operations.py           # DraftOperation 判别联合
├── validation.py           # 结构、父子、变体、色板和单元格校验
├── canonical.py            # 稳定规范化 JSON 与 SHA-256
├── repository.py           # revision CAS 草稿与不可变版本持久化
├── palette.py              # 部署冻结色板加载与 checksum 校验
├── quantizer.py            # D65 Lab、CIEDE2000、全局子色板和 58×58 量化
├── service.py              # 操作应用、审查门、量化、批准编排
└── routes.py               # /api/v1/projects/{project_id}/draft...

apps/api/src/pindou_pet/modules/jobs/
├── schemas.py              # modify：加入 PART_REGENERATION union member
├── service.py              # modify：服务端次数/所有权/revision 校验
└── tasks.py                # modify：Provider mask edit 与原子 source-layer 更新

apps/api/src/pindou_pet/modules/pipeline/
└── layer_generation.py     # 本地 frozen-perception 拆层、补丁、rig 和默认动作

apps/api/tests/modules/assets/
├── test_models.py
├── test_operations.py
├── test_validation.py
├── test_canonical.py
├── test_repository.py
├── test_palette.py
├── test_quantizer.py
├── test_service.py
└── test_routes.py

tests/unit/jobs/test_part_regeneration.py
tests/unit/pipeline/test_layer_generation.py
tests/integration/jobs/test_part_regeneration_task.py
tests/integration/jobs/test_layer_generation_task.py
tests/integration/api/test_generation_job_routes.py

apps/web/src/features/editor/
├── api/editorApi.ts
├── model/editorReducer.ts
├── model/gridCoordinates.ts
├── model/maskRaster.ts
├── model/beadTools.ts
├── model/history.ts
├── model/beadRiskPreview.ts
├── components/EditorPage.tsx
├── components/HighResEditor.tsx
├── components/LayerPanel.tsx
├── components/JointOverlay.tsx
├── components/ActionPreview.tsx
├── components/BeadEditor.tsx
├── components/BeadCanvas.tsx
├── components/BeadToolbar.tsx
└── components/RiskPanel.tsx

apps/web/src/features/editor/__tests__/
├── editorReducer.test.ts
├── gridCoordinates.test.ts
├── maskRaster.test.ts
├── beadTools.test.ts
├── history.test.ts
├── beadRiskPreview.test.ts
├── HighResEditor.test.tsx
└── BeadEditor.test.tsx

apps/web/e2e/editor.spec.ts
tests/fixtures/assets/valid-draft.json
tests/fixtures/assets/valid-layer-review-draft.json
tests/fixtures/assets/invalid-parent-cycle.json
tests/fixtures/assets/invalid-cells.json
tests/fixtures/assets/risk-patterns.json
config/palette.freeze.json
config/quantizer.freeze.json
docs/decisions/palette-selection.md
licenses/palette-source-license.txt
packages/contracts/src/generated.ts
```

---

### Task 0: Freeze the deployment palette and quantizer manifests before asset construction

**Files:**
- Create: `config/palette.freeze.json`
- Create: `config/quantizer.freeze.json`
- Create: `docs/decisions/palette-selection.md`
- Create: `licenses/palette-source-license.txt`
- Create: `apps/api/src/pindou_pet/modules/assets/palette.py`
- Create: `apps/api/tests/modules/assets/test_palette.py`

**Interfaces:**
- Produces: checksum-verified `FrozenPalette`, `load_deployment_palette()`, and immutable palette/quantizer manifest JSON used by Task 1 fixtures, Task 6A layer drafts and Task 7 quantization.

- [ ] **Step 1: Write the failing freeze/loader tests**

Require a real pinned source commit/file, per-file MIT result, copied license text, documented compatible-board `pegPitchMm`, unique print codes, normalized color checksum and decision-document checksum. Also require `config/quantizer.freeze.json` to equal the planned manifest exactly: `pindou-ciede2000-v1`, CIELAB, D65, CIEDE2000, ascending `colorId` tie break, max 32 colors, dithering false.

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_palette.py -q
```

Expected: FAIL because neither freeze nor loader exists.

- [ ] **Step 2: Audit candidates, freeze one source, and implement the loader**

In `docs/decisions/palette-selection.md`, list every candidate repository and exact file, pinned 40-hex commit, per-file license finding, complete color-ID/RGB coverage and documented compatible-board pitch. Select exactly one only when all checks pass, copy its exact MIT text, and write actual brand/series/version/source metadata and colors to `palette.freeze.json`; never invent colors, pitch or provenance. If none passes, stop Phase 3 here. Implement `FrozenPalette(extra="forbid")` and fail startup on source/license/decision/color checksum drift. Write `quantizer.freeze.json` independently so a valid pre-quantization draft can carry the final manifest before quantizer code exists.

- [ ] **Step 3: Verify and commit the prerequisite**

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_palette.py -q
git add config/palette.freeze.json config/quantizer.freeze.json \
  docs/decisions/palette-selection.md licenses/palette-source-license.txt \
  apps/api/src/pindou_pet/modules/assets/palette.py \
  apps/api/tests/modules/assets/test_palette.py
git commit -m "chore(assets): freeze deployment bead palette"
```

Expected: both manifests load byte-stably and their checksums can be copied into Task 1 fixtures. No later task changes these files without a separately approved manifest migration.

---

### Task 1: Define the canonical draft and approved asset contracts

**Files:**
- Create: `apps/api/src/pindou_pet/modules/assets/__init__.py`
- Create: `apps/api/src/pindou_pet/modules/assets/models.py`
- Create: `apps/api/tests/modules/assets/test_models.py`
- Create: `tests/fixtures/assets/valid-draft.json`
- Create: `tests/fixtures/assets/valid-layer-review-draft.json`

**Interfaces:**
- Consumes: Phase 2 `ProjectStatus`, `ProjectStep`, UUID-string conventions and project `revision`; this phase adds and owns `active_asset_version_id` when the first immutable version is approved.
- Produces: `DraftAsset`, `ApprovedAssetVersion`, `SourceLayer`, `BeadLayer`, `VariantGroup`, `Animation`, `PaletteManifest`, `QuantizerManifest`, and `NeutralTransform` for every later Phase 3/4 task.

- [ ] **Step 1: Write a representative valid fixture and failing schema tests**

Create `valid-draft.json` with six required physical logical groups, separate open/closed eye variants, one `physicalExport=false` chest patch in both source/bead forms, frozen palette/quantizer manifests, and identity neutral transforms. Add these assertions:

```python
from pathlib import Path
from pydantic import ValidationError

from pindou_pet.modules.assets.models import DraftAsset, NeutralTransform


FIXTURE = Path("tests/fixtures/assets/valid-draft.json")


def test_valid_draft_fixture_round_trips() -> None:
    asset = DraftAsset.model_validate_json(FIXTURE.read_text())
    assert asset.grid_width == 58
    assert asset.grid_height == 58
    assert asset.revision == 7
    assert len(asset.bead_layers) >= 7


def test_layer_review_draft_may_have_no_bead_layers() -> None:
    asset = DraftAsset.model_validate_json(
        Path("tests/fixtures/assets/valid-layer-review-draft.json").read_text()
    )
    assert asset.bead_layers == []
    assert {layer.logical_group for layer in asset.source_layers} >= {
        "BODY", "HEAD", "SCREEN_LEFT_FRONT_PAW",
        "SCREEN_RIGHT_FRONT_PAW", "TAIL", "EYES",
    }


def test_neutral_transform_does_not_accept_scale() -> None:
    with pytest.raises(ValidationError):
        NeutralTransform.model_validate(
            {"dx": 0, "dy": 0, "rotationDeg": 0, "scaleX": 1}
        )
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_models.py -q
```

Expected: FAIL during collection with `ModuleNotFoundError: No module named 'pindou_pet.modules.assets'`.

- [ ] **Step 3: Implement strict Pydantic asset types**

Implement aliases and models with `ConfigDict(extra="forbid", populate_by_name=True)` and camel-case JSON aliases. The essential shape must be:

```python
class GridPoint(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    x: float
    y: float


class RGB8(BaseModel):
    model_config = ConfigDict(extra="forbid")
    r: int = Field(ge=0, le=255)
    g: int = Field(ge=0, le=255)
    b: int = Field(ge=0, le=255)


class PaletteColorManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    color_id: str = Field(alias="colorId", min_length=1)
    name: str = Field(min_length=1)
    print_code: str = Field(alias="printCode", min_length=1)
    rgb: RGB8


class PaletteManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    brand: str = Field(min_length=1)
    series: str = Field(min_length=1)
    version: str = Field(min_length=1)
    source_checksum: str = Field(alias="sourceChecksum", pattern=r"^[0-9a-f]{64}$")
    peg_pitch_mm: float = Field(alias="pegPitchMm", gt=0)
    colors: list[PaletteColorManifest] = Field(min_length=1)


class QuantizerManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    version: Literal["pindou-ciede2000-v1"]
    color_space: Literal["CIELAB"] = Field(alias="colorSpace")
    white_point: Literal["D65"] = Field(alias="whitePoint")
    distance_formula: Literal["CIEDE2000"] = Field(alias="distanceFormula")
    tie_break_rule: Literal["colorId-ascending"] = Field(alias="tieBreakRule")
    max_colors: Literal[32] = Field(alias="maxColors")
    dithering: Literal[False]


class NeutralTransform(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    dx: float = 0
    dy: float = 0
    rotation_deg: float = Field(0, alias="rotationDeg")


class SparseCell(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    x: int
    y: int
    color_id: str = Field(alias="colorId")


LogicalGroup = Literal[
    "BODY", "HEAD", "SCREEN_LEFT_FRONT_PAW",
    "SCREEN_RIGHT_FRONT_PAW", "TAIL", "EYES", "EAR", "MUZZLE",
]


class SourceLayer(BaseModel):
    id: str
    node_id: str = Field(alias="nodeId")
    logical_group: LogicalGroup = Field(alias="logicalGroup")
    parent_node_id: str | None = Field(alias="parentNodeId")
    z_index: int = Field(alias="zIndex")
    physical_export: bool = Field(alias="physicalExport")
    variant_group_id: str | None = Field(alias="variantGroupId")
    variant_id: str | None = Field(alias="variantId")
    pivot_global: GridPoint = Field(alias="pivotGlobal")
    neutral_transform: NeutralTransform = Field(alias="neutralTransform")
    image_content_hash: str = Field(alias="imageContentHash")
    mask_content_hash: str = Field(alias="maskContentHash")
    completion_mask_hash: str | None = Field(alias="completionMaskHash")


class BeadLayer(BaseModel):
    id: str
    node_id: str = Field(alias="nodeId")
    logical_group: LogicalGroup = Field(alias="logicalGroup")
    source_layer_id: str = Field(alias="sourceLayerId")
    parent_node_id: str | None = Field(alias="parentNodeId")
    z_index: int = Field(alias="zIndex")
    pivot_global: GridPoint = Field(alias="pivotGlobal")
    physical_export: bool = Field(alias="physicalExport")
    variant_group_id: str | None = Field(alias="variantGroupId")
    variant_id: str | None = Field(alias="variantId")
    sparse_cells: list[SparseCell] = Field(alias="sparseCells")
    neutral_transform: NeutralTransform = Field(alias="neutralTransform")


class VariantGroup(BaseModel):
    id: str
    target_node_id: str = Field(alias="targetNodeId")
    neutral_variant_id: str = Field(alias="neutralVariantId")
    variant_ids: list[str] = Field(alias="variantIds", min_length=2)


class TransformKeyframe(BaseModel):
    time_ms: int = Field(alias="timeMs", ge=0)
    dx: float
    dy: float
    rotation_deg: float = Field(alias="rotationDeg")
    easing: Literal["linear", "ease_in", "ease_out", "ease_in_out"]


class TransformTrack(BaseModel):
    kind: Literal["transform"]
    target_node_id: str = Field(alias="targetNodeId")
    keyframes: list[TransformKeyframe]


class VariantVisibilityKeyframe(BaseModel):
    time_ms: int = Field(alias="timeMs", ge=0)
    variant_id: str = Field(alias="variantId")


class VariantVisibilityTrack(BaseModel):
    kind: Literal["variant_visibility"]
    target_node_id: str = Field(alias="targetNodeId")
    variant_group_id: str = Field(alias="variantGroupId")
    keyframes: list[VariantVisibilityKeyframe]


AnimationTrack = Annotated[
    TransformTrack | VariantVisibilityTrack,
    Field(discriminator="kind"),
]


class Animation(BaseModel):
    name: Literal[
        "breath", "blink", "tail_wag", "raise_screen_left_front_paw", "bounce"
    ]
    duration_ms: int = Field(alias="durationMs", gt=0)
    tracks: list[AnimationTrack]
    exportable: Literal[False]


class DraftAsset(BaseModel):
    schema_version: int = Field(alias="schemaVersion")
    project_id: str = Field(alias="projectId")
    revision: int = Field(ge=0)
    source_hash: str = Field(alias="sourceHash")
    grid_width: Literal[58] = Field(alias="gridWidth")
    grid_height: Literal[58] = Field(alias="gridHeight")
    board_size: Literal[29] = Field(alias="boardSize")
    palette_manifest: PaletteManifest = Field(alias="paletteManifest")
    quantizer_manifest: QuantizerManifest = Field(alias="quantizerManifest")
    selected_color_ids: list[str] = Field(alias="selectedColorIds", max_length=32)
    source_layers: list[SourceLayer] = Field(alias="sourceLayers")
    bead_layers: list[BeadLayer] = Field(alias="beadLayers")
    variant_groups: list[VariantGroup] = Field(alias="variantGroups")
    animations: list[Animation]
```

`selectedColorIds` is `[]` before quantization; after quantization it contains 1–32 unique ascending IDs from `paletteManifest.colors` and is the sole bead-editor palette. `ApprovedAssetVersion` adds `immutableVersionId`, `approvedAt`, and `canonicalAssetHash`, requires a nonempty valid selection, and omits mutable review/UI fields.

- [ ] **Step 4: Run schema tests and confirm GREEN**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_models.py -q
```

Expected: PASS; valid fixture round-trips and any undeclared transform field is rejected.

- [ ] **Step 5: Commit the contract slice**

```bash
git add apps/api/src/pindou_pet/modules/assets apps/api/tests/modules/assets/test_models.py tests/fixtures/assets/valid-draft.json tests/fixtures/assets/valid-layer-review-draft.json
git commit -m "feat(assets): define canonical character asset models"
```

### Task 2: Validate topology, variants, cells, palette, and required groups

**Files:**
- Create: `apps/api/src/pindou_pet/modules/assets/validation.py`
- Create: `apps/api/tests/modules/assets/test_validation.py`
- Create: `tests/fixtures/assets/invalid-parent-cycle.json`
- Create: `tests/fixtures/assets/invalid-cells.json`

**Interfaces:**
- Consumes: `DraftAsset` and nested models from Task 1.
- Produces: `validate_layer_review_draft(asset) -> list[AssetIssue]`, which allows `beadLayers=[]`; and `validate_approvable_asset(asset, deployment_palette) -> list[AssetIssue]`, which requires complete non-empty source/bead correspondence and exact deployment palette equality. Approval and Phase 4 export call only `assert_approvable_asset(asset, deployment_palette)`.

- [ ] **Step 1: Write RED tests for every structural invariant**

Use fixture mutation helpers and assert stable machine-readable codes:

```python
def issue_codes(asset: DraftAsset) -> set[str]:
    return {
        issue.code
        for issue in validate_approvable_asset(asset, deployment_palette())
    }


@pytest.mark.parametrize(
    ("mutation", "expected"),
    [
        (drop_body_group, "MISSING_REQUIRED_GROUP"),
        (add_ninth_logical_group, "TOO_MANY_LOGICAL_GROUPS"),
        (add_parent_cycle, "PARENT_CYCLE"),
        (detach_eye_from_head, "INVALID_REQUIRED_PARENT"),
        (duplicate_visible_z_index, "DUPLICATE_VISIBLE_Z_INDEX"),
        (duplicate_cell, "DUPLICATE_LAYER_CELL"),
        (move_cell_to_x_58, "CELL_OUT_OF_RANGE"),
        (use_unknown_color, "UNKNOWN_COLOR_ID"),
        (remove_neutral_eye_variant, "MISSING_NEUTRAL_VARIANT"),
        (remove_source_node_id, "MISSING_NODE_ID"),
        (make_source_pivot_nan, "NON_FINITE_PIVOT"),
        (make_neutral_transform_non_identity, "NON_IDENTITY_NEUTRAL_TRANSFORM"),
    ],
)
def test_asset_invariant_codes(mutation, expected) -> None:
    asset = mutation(load_valid_draft())
    assert expected in issue_codes(asset)


def test_layer_review_accepts_empty_bead_layers_but_approval_does_not() -> None:
    asset = load_valid_layer_review_draft()
    assert validate_layer_review_draft(asset) == []
    assert "MISSING_BEAD_LAYER" in {
        issue.code
        for issue in validate_approvable_asset(asset, deployment_palette())
    }


def test_approval_requires_nonempty_one_to_one_source_bead_groups() -> None:
    asset = empty_cells_for_group(load_valid_draft(), "TAIL")
    assert "EMPTY_REQUIRED_BEAD_LAYER" in issue_codes(asset)
    asset = point_head_bead_at_tail_source(load_valid_draft())
    assert "SOURCE_BEAD_GROUP_MISMATCH" in issue_codes(asset)
    asset = flip_source_physical_export_flag(load_valid_draft(), "TAIL")
    assert "SOURCE_BEAD_EXPORT_FLAG_MISMATCH" in issue_codes(asset)


def test_approval_requires_exactly_five_valid_neutral_ending_actions() -> None:
    asset = drop_animation(load_valid_draft(), "blink")
    assert "INVALID_ACTION_SET" in issue_codes(asset)
    assert "TRACK_TARGET_NOT_FOUND" in issue_codes(bad_track_target(load_valid_draft()))
    assert "KEYFRAME_TIME_INVALID" in issue_codes(out_of_order_keyframes(load_valid_draft()))
    assert "NON_FINITE_TRACK_VALUE" in issue_codes(nan_transform(load_valid_draft()))
    assert "ACTION_END_NOT_NEUTRAL" in issue_codes(non_neutral_final_frame(load_valid_draft()))


def test_track_targets_resolve_before_and_after_quantization() -> None:
    review = load_valid_layer_review_draft()
    source_nodes = {layer.node_id for layer in review.source_layers}
    assert all(track.target_node_id in source_nodes
               for animation in review.animations for track in animation.tracks)
    approved = load_valid_draft()
    bead_nodes = {layer.node_id for layer in approved.bead_layers}
    assert all(track.target_node_id in bead_nodes
               for animation in approved.animations for track in animation.tracks)
```

Also assert duplicate `zIndex` is allowed for the open/closed eye layers because they are mutually exclusive members of the same variant group.

- [ ] **Step 2: Run validation tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_validation.py -q
```

Expected: FAIL with import error for `pindou_pet.modules.assets.validation`.

- [ ] **Step 3: Implement deterministic issue collection**

Define:

```python
class AssetIssue(BaseModel):
    code: str
    path: str
    message: str


class InvalidAssetError(ValueError):
    def __init__(self, issues: list[AssetIssue]) -> None:
        self.issues = issues
        super().__init__("; ".join(f"{i.code}:{i.path}" for i in issues))


def validate_layer_review_draft(
    asset: DraftAsset | ApprovedAssetVersion,
) -> list[AssetIssue]:
    issues: list[AssetIssue] = []
    issues.extend(_validate_required_source_groups(asset))
    issues.extend(_validate_parent_graph(asset))
    issues.extend(_validate_source_rig_fields(asset))
    issues.extend(_validate_variants_and_z_order(asset))
    issues.extend(_validate_action_tracks(asset, require_exact_action_set=True))
    return sorted(issues, key=lambda issue: (issue.code, issue.path))


def validate_approvable_asset(
    asset: DraftAsset | ApprovedAssetVersion,
    deployment_palette: PaletteManifest,
) -> list[AssetIssue]:
    issues = validate_layer_review_draft(asset)
    issues.extend(_validate_source_bead_one_to_one_nonempty(asset))
    issues.extend(_validate_cells_and_palette(asset))
    issues.extend(_validate_deployment_palette_match(asset, deployment_palette))
    issues.extend(_validate_neutral_transforms(asset))
    return sorted(issues, key=lambda issue: (issue.code, issue.path))
```

Use DFS over stable `nodeId`/`parentNodeId` to detect cycles; variants may share one node. Explicitly require `HEAD.parentNodeId == BODY.nodeId`, both screen-paw nodes and `TAIL.parentNodeId == BODY.nodeId`, and `EYES.parentNodeId == HEAD.nodeId`. `_validate_required_source_groups` counts only `physicalExport=true` semantic layers, folds open/closed eye variants into one `EYES` group, and ignores auxiliary patch/shadow sources. A `VariantGroup` lists stable `variantIds`, targets exactly one `nodeId`, has one listed `neutralVariantId`, and each `(variantGroupId, variantId)` resolves to exactly one source layer before quantization and one corresponding bead layer after quantization; open/closed eyes therefore never rely on representation-specific layer IDs. The approval validator requires each required source logical group to map to corresponding non-empty bead layers through `sourceLayerId`, requires source/bead `nodeId`, `parentNodeId`, `logicalGroup`, `zIndex`, `physicalExport`, `variantGroupId`, `variantId`, `pivotGlobal`, and `neutralTransform` continuity, and rejects cross-group mappings. It validates exactly the five named actions once through `validate_layer_review_draft`. Every `targetNodeId` must resolve before quantization against source nodes and after approval against bead nodes; keyframe times must be finite integers, strictly increasing and within `[0,durationMs]`; transform values must be finite; the final transform frame is `{dx:0,dy:0,rotationDeg:0}` and final variant frame selects the group neutral variant.

- [ ] **Step 4: Run validation tests and confirm GREEN**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_validation.py -q
```

Expected: PASS; all expected issue codes and stable ordering match.

- [ ] **Step 5: Commit validation**

```bash
git add apps/api/src/pindou_pet/modules/assets/validation.py apps/api/tests/modules/assets/test_validation.py tests/fixtures/assets/invalid-parent-cycle.json tests/fixtures/assets/invalid-cells.json
git commit -m "feat(assets): validate character topology and bead data"
```

### Task 3: Normalize canonical JSON and compute stable asset hashes

**Files:**
- Create: `apps/api/src/pindou_pet/modules/assets/canonical.py`
- Create: `apps/api/tests/modules/assets/test_canonical.py`

**Interfaces:**
- Consumes: Task 1 asset models and Task 2 validation.
- Produces: `canonical_asset_bytes(asset) -> bytes` and `canonical_asset_hash(asset) -> str` for immutable approval and Phase 4 export cache keys.

- [ ] **Step 1: Write RED tests for ordering and excluded fields**

```python
def test_hash_is_independent_of_input_object_order() -> None:
    left = load_valid_draft()
    right = load_valid_draft_with_reversed_input_lists()
    assert canonical_asset_hash(left) == canonical_asset_hash(right)


def test_hash_changes_when_palette_or_animation_changes() -> None:
    base = load_valid_draft()
    assert canonical_asset_hash(base) != canonical_asset_hash(change_color_rgb(base))
    assert canonical_asset_hash(base) != canonical_asset_hash(change_keyframe(base))


def test_hash_ignores_draft_revision_and_preview_urls() -> None:
    base = load_valid_draft()
    edited = base.model_copy(update={"revision": base.revision + 1})
    assert canonical_asset_hash(base) == canonical_asset_hash(edited)
```

- [ ] **Step 2: Run canonical tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_canonical.py -q
```

Expected: FAIL with import error for `canonical_asset_hash`.

- [ ] **Step 3: Implement explicit canonical projection**

Do not hash `model_dump()` wholesale. Build a projection that includes manifests, sorted `selectedColorIds`, source layers, bead layers, variant groups (including ordered stable `variantIds`), and animations, sorts each list by stable semantic keys, omits revision/UI/preview/derived cache fields, then serializes:

```python
def canonical_asset_bytes(asset: DraftAsset | ApprovedAssetVersion) -> bytes:
    document = _canonical_projection(asset)
    return json.dumps(
        document,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def canonical_asset_hash(asset: DraftAsset | ApprovedAssetVersion) -> str:
    return hashlib.sha256(canonical_asset_bytes(asset)).hexdigest()
```

Sort cells by `(y, x, colorId)`, layers by `(nodeId,id)`, variant groups by `id` and each group's `variantIds` lexically, animations by `name`, tracks by `(kind,targetNodeId,variantGroupId-or-empty)`, transform keyframes by `(timeMs,dx,dy,rotationDeg,easing)`, variant-visibility keyframes by `(timeMs,variantId)`, and palette colors by `colorId`. Exclude `revision`, `immutableVersionId`, `approvedAt`, `canonicalAssetHash`, preview URLs, and derived caches; including `canonicalAssetHash` would make the digest self-referential.

- [ ] **Step 4: Run canonical tests and confirm GREEN**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_canonical.py -q
```

Expected: PASS with stable 64-character lowercase SHA-256 strings.

- [ ] **Step 5: Commit hashing**

```bash
git add apps/api/src/pindou_pet/modules/assets/canonical.py apps/api/tests/modules/assets/test_canonical.py
git commit -m "feat(assets): add deterministic canonical hashing"
```

### Task 4: Define discriminated draft operations and an in-memory reducer

**Files:**
- Create: `apps/api/src/pindou_pet/modules/assets/operations.py`
- Create: `apps/api/tests/modules/assets/test_operations.py`

**Interfaces:**
- Consumes: Task 1 asset models.
- Produces: exact OpenAPI `DraftOperation` union and `apply_operations(asset, operations) -> DraftAsset` used by service/routes and generated TypeScript.

- [ ] **Step 1: Write RED tests for parsing and atomic reduction**

```python
def test_operation_union_uses_kind_discriminator() -> None:
    op = DraftOperation.model_validate(
        {"kind": "set_pivot", "nodeId": "node-tail", "pivotGlobal": {"x": 42, "y": 35}}
    ).root
    assert isinstance(op, SetPivotOp)


def test_operation_batch_is_applied_without_mutating_original() -> None:
    original = load_valid_draft()
    changed = apply_operations(original, [set_tail_pivot(), set_tail_z_index()])
    assert original != changed
    assert get_layer(original, "tail").pivot_global.x != 42
    assert get_layer(changed, "tail").pivot_global.x == 42
    assert all(layer.pivot_global.x == 42
               for layer in layers_for_node(changed, "node-tail"))


def test_invalid_operation_rolls_back_entire_batch() -> None:
    original = load_valid_draft()
    with pytest.raises(OperationError):
        apply_operations(original, [set_tail_pivot(), set_missing_layer_parent()])
    assert get_layer(original, "tail").pivot_global.x != 42
```

- [ ] **Step 2: Run operation tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_operations.py -q
```

Expected: FAIL with missing `operations` module.

- [ ] **Step 3: Implement the operation union**

```python
class SetPivotOp(BaseModel):
    kind: Literal["set_pivot"]
    node_id: str = Field(alias="nodeId")
    pivot_global: GridPoint = Field(alias="pivotGlobal")


class SetParentNodeOp(BaseModel):
    kind: Literal["set_parent_node"]
    node_id: str = Field(alias="nodeId")
    parent_node_id: str | None = Field(alias="parentNodeId")


class ReplaceSourceMaskOp(BaseModel):
    kind: Literal["replace_source_mask"]
    layer_id: str = Field(alias="layerId")
    expected_mask_content_hash: str = Field(alias="expectedMaskContentHash")
    staged_media_id: str = Field(alias="stagedMediaId")
    mask_content_hash: str = Field(alias="maskContentHash")


class ReplaceBeadCellsOp(BaseModel):
    kind: Literal["replace_bead_cells"]
    layer_id: str = Field(alias="layerId")
    sparse_cells: list[SparseCell] = Field(alias="sparseCells")


class SetZIndexOp(BaseModel):
    kind: Literal["set_z_index"]
    layer_id: str = Field(alias="layerId")
    z_index: int = Field(alias="zIndex")


class ReplaceAnimationOp(BaseModel):
    kind: Literal["replace_animation"]
    animation_name: Literal[
        "breath", "blink", "tail_wag", "raise_screen_left_front_paw", "bounce"
    ] = Field(alias="animationName")
    animation: Animation


Operation = Annotated[
    ReplaceSourceMaskOp | SetPivotOp | SetParentNodeOp | SetZIndexOp
    | ReplaceBeadCellsOp | ReplaceAnimationOp,
    Field(discriminator="kind"),
]


class DraftOperation(RootModel[Operation]):
    root: Operation
```

Clone once, apply all operations, reject a missing layer/node/hash mismatch, require `ReplaceAnimationOp.animation.name == animationName`, and validate the resulting asset only after the whole batch; return no partially changed object. `set_pivot` and `set_parent_node` update every source/bead layer sharing the target `nodeId` so the rig cannot diverge across representations; mask/cell/z-order operations remain layer-instance targeted. Tests parse each of the six discriminator variants and prove an invalid z-index or mismatched animation replacement rolls back the whole batch.

- [ ] **Step 4: Run operation tests and confirm GREEN**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_operations.py -q
```

Expected: PASS; OpenAPI-visible operation variants use `kind` as discriminator.

- [ ] **Step 5: Commit operation contracts**

```bash
git add apps/api/src/pindou_pet/modules/assets/operations.py apps/api/tests/modules/assets/test_operations.py
git commit -m "feat(assets): add atomic draft edit operations"
```

### Task 5: Persist revision-guarded drafts and immutable asset versions

**Files:**
- Create: `apps/api/src/pindou_pet/modules/assets/repository.py`
- Create: `apps/api/src/pindou_pet/modules/assets/db_models.py`
- Modify: `apps/api/src/pindou_pet/modules/projects/models.py`
- Create: `apps/api/tests/modules/assets/test_repository.py`
- Create: `migrations/versions/0005_assets.py`

**Interfaces:**
- Consumes: project rows from Phase 1–2 and canonical JSON from Tasks 1–4.
- Produces transaction-bound `AssetRepository.get_draft`, `compare_and_swap_draft_in_transaction`, `insert_approved_version_in_transaction`, and `get_approved_version`; Phase 4 only reads approved versions.
- User services own `BEGIN IMMEDIATE`, call `require_project_owner_in_transaction(project_id, browser_session_id)`, then invoke the transaction-bound repository method. Worker finalizers use separately named system entry points that recheck tombstone/revision but do not impersonate an owner.

- [ ] **Step 1: Write RED repository tests against temporary SQLite**

```python
def test_compare_and_swap_increments_revision(repository, project, session) -> None:
    with begin_immediate(session):
        saved = repository.compare_and_swap_draft_in_transaction(
            session, project.id, expected_revision=7, asset=load_valid_draft()
        )
    assert saved.revision == 8
    assert repository.get_project(project.id).revision == 8


def test_compare_and_swap_rejects_stale_revision(repository, project, session) -> None:
    with begin_immediate(session):
        repository.compare_and_swap_draft_in_transaction(
            session, project.id, 7, load_valid_draft()
        )
    with pytest.raises(StaleRevisionError) as exc:
        with begin_immediate(session):
            repository.compare_and_swap_draft_in_transaction(
                session, project.id, 7, load_valid_draft()
            )
    assert exc.value.current_revision == 8


def test_approved_version_cannot_be_updated(repository, project) -> None:
    version = repository.insert_approved_version(project.id, approved_asset())
    with pytest.raises(ImmutableAssetError):
        repository.replace_approved_version(version.immutable_version_id, approved_asset())


def test_load_rejects_project_and_draft_revision_divergence(repository, project) -> None:
    force_revision_divergence_for_test(project.id, project_revision=8, draft_revision=7)
    with pytest.raises(DraftRevisionInvariantError):
        repository.get_draft(project.id)
```

- [ ] **Step 2: Run repository tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_repository.py -q
```

Expected: FAIL because the asset tables/repository do not exist.

- [ ] **Step 3: Add minimal tables and CAS statements**

Add `asset_drafts(project_id PK/FK ON DELETE CASCADE, revision, asset_json, layer_review_opened_at, layer_review_completed_at, correction_wall_ms, part_provider_wait_ms, correction_active_ms, updated_at)` and `approved_asset_versions(immutable_version_id PK, project_id FK ON DELETE CASCADE, canonical_asset_hash, asset_json, approved_at)` with a unique `(project_id, canonical_asset_hash)` constraint. Also add `draft_media_staging(media_id PK, project_id FK ON DELETE CASCADE, source_layer_id, purpose, expected_revision, content_hash, private_storage_key, width, height, created_at, expires_at, consumed_at, consumed_by_generation_run_id nullable FK ON DELETE SET NULL)` with a unique `(project_id, source_layer_id, purpose, expected_revision, content_hash)` constraint. Raw bytes/storage keys never enter public DTOs. The same migration adds nullable indexed `projects.active_asset_version_id` with an `ON DELETE SET NULL` foreign key to `approved_asset_versions`; final project purge explicitly clears it before cascading owned rows. Task 13 exposes it in the public project response when approval wiring is added. Review timestamps/metrics are server-written only.

Freeze one revision authority: `Project.revision` is authoritative, while `AssetDraft.revision` and the JSON `revision` are mirrored CAS tokens that must always equal it. Draft creation copies the current project revision. Every ordinary draft PATCH, layer-review transition, quantization and part-regeneration success calls the same transaction-bound repository CAS, which updates the project row, draft row and serialized JSON to `expectedRevision + 1`. Loading a mismatch raises `DraftRevisionInvariantError`; no code may increment only one copy. The user service owns the outer transaction and authorization; the repository must not open or commit an inner transaction. Implement the core shape as:

```python
with begin_immediate(session):
    require_project_owner_in_transaction(session, project_id, browser_session_id)
    project = _require_project_revision(session, project_id, expected_revision)
    draft = _require_matching_draft_revision(session, project_id, expected_revision)
    next_revision = expected_revision + 1
    payload = asset.model_copy(update={"revision": next_revision}).model_dump_json()
    project.revision = next_revision
    draft.revision = next_revision
    draft.asset_json = payload
```

Never expose a repository method that updates approved JSON.

- [ ] **Step 4: Run migration and repository tests and confirm GREEN**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_repository.py -q
```

Expected: PASS; two writes using revision 7 yield one success and one `StaleRevisionError`.

- [ ] **Step 5: Commit persistence**

```bash
git add apps/api/src/pindou_pet/modules/assets/repository.py apps/api/src/pindou_pet/modules/assets/db_models.py apps/api/src/pindou_pet/modules/projects/models.py migrations/versions/0005_assets.py apps/api/tests/modules/assets/test_repository.py
git commit -m "feat(assets): persist revisioned drafts and immutable versions"
```

### Task 6: Expose draft media, mutation, and review-gate APIs

**Files:**
- Create: `apps/api/src/pindou_pet/modules/assets/service.py`
- Create: `apps/api/src/pindou_pet/modules/assets/routes.py`
- Create: `apps/api/tests/modules/assets/test_service.py`
- Create: `apps/api/tests/modules/assets/test_routes.py`
- Modify: `apps/api/src/pindou_pet/api/router.py`
- Modify: `packages/contracts/src/generated.ts`

**Interfaces:**
- Consumes: private content-addressed storage from Phase 0/2, Task 4 operations, Task 5 repository.
- Produces:
  - `GET /api/v1/projects/{project_id}/draft`
  - `POST /api/v1/projects/{project_id}/draft/media`
  - `GET /api/v1/projects/{project_id}/media/{content_hash}`
  - `PATCH /api/v1/projects/{project_id}/draft`
  - `POST /api/v1/projects/{project_id}/draft/layer-review`
- Produces owner-aware service signatures `get_draft_for_user(project_id, browser_session_id)`, `upload_draft_media(project_id, browser_session_id, ...)`, `patch_draft(project_id, browser_session_id, request)` and `confirm_layer_review(project_id, browser_session_id, request)`.
- Produces `DraftMediaPurpose = MASK_REPLACEMENT | PART_REGENERATION_EDIT_MASK` and a non-revision-changing, project/revision/layer-scoped staging contract.

- [ ] **Step 1: Write RED API tests for success, media validation, and conflicts**

```python
def test_patch_draft_returns_new_revision(client, seeded_draft) -> None:
    response = client.patch(
        f"/api/v1/projects/{seeded_draft.project_id}/draft",
        json={"revision": 7, "operations": [set_tail_pivot_json()]},
    )
    assert response.status_code == 200
    assert response.json()["revision"] == 8


def test_patch_stale_revision_returns_machine_readable_409(client, seeded_draft) -> None:
    response = client.patch(
        f"/api/v1/projects/{seeded_draft.project_id}/draft",
        json={"revision": 6, "operations": [set_tail_pivot_json()]},
    )
    assert response.status_code == 409
    assert response.json()["error"] == {
        "code": "STALE_REVISION",
        "message": "Draft revision is stale",
        "details": {"currentRevision": 7},
    }


def test_mask_upload_rejects_wrong_dimensions(client, seeded_draft) -> None:
    response = upload_mask(client, seeded_draft, png_size=(511, 512))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_MASK_DIMENSIONS"


def test_mask_upload_stages_without_incrementing_asset_revision(client, seeded_draft) -> None:
    response = upload_mask(
        client,
        seeded_draft,
        expected_revision=7,
        source_layer_id="source-tail-neutral",
        purpose="MASK_REPLACEMENT",
    )
    assert response.status_code == 201
    assert response.json().keys() == {
        "mediaId", "contentHash", "sourceLayerId", "purpose",
        "expectedRevision", "expiresAt",
    }
    assert get_project(seeded_draft.project_id).revision == 7


def test_patch_consumes_only_matching_staged_mask(client, seeded_draft) -> None:
    staged = upload_mask(
        client, seeded_draft, expected_revision=7,
        source_layer_id="source-tail-neutral", purpose="MASK_REPLACEMENT",
    ).json()
    response = client.patch(
        f"/api/v1/projects/{seeded_draft.project_id}/draft",
        json={
            "revision": 7,
            "operations": [{
                "kind": "replace_source_mask",
                "layerId": "source-tail-neutral",
                "expectedMaskContentHash": seeded_draft.tail_mask_hash,
                "stagedMediaId": staged["mediaId"],
                "maskContentHash": staged["contentHash"],
            }],
        },
    )
    assert response.status_code == 200
    assert response.json()["revision"] == 8
    assert staged_media(staged["mediaId"]).consumed_at is not None


def test_owner_can_stream_only_media_referenced_by_its_asset(client, seeded_draft):
    content_hash = seeded_draft.source_layers[0].image_content_hash
    response = client.get(
        f"/api/v1/projects/{seeded_draft.project_id}/media/{content_hash}"
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "private, no-store"


def test_cross_project_or_unreferenced_media_is_404(
    client, other_client, seeded_draft, unreferenced_hash
):
    assert other_client.get(
        f"/api/v1/projects/{seeded_draft.project_id}/media/"
        f"{seeded_draft.source_layers[0].image_content_hash}"
    ).status_code == 404
    assert client.get(
        f"/api/v1/projects/{seeded_draft.project_id}/media/{unreferenced_hash}"
    ).status_code == 404


def test_layer_review_timing_is_server_derived(client, seeded_draft, fake_clock) -> None:
    fake_clock.set("2026-07-16T10:00:00Z")
    client.get(f"/api/v1/projects/{seeded_draft.project_id}/draft")
    fake_clock.set("2026-07-16T10:02:00Z")
    record_part_provider_wait(seeded_draft.project_id, start_ms=30_000, end_ms=50_000)
    response = client.post(
        f"/api/v1/projects/{seeded_draft.project_id}/draft/layer-review",
        json=three_true_review_gates(revision=seeded_draft.revision),
    )
    assert response.json()["timing"] == {
        "correctionWallMs": 120_000,
        "partRegenerationProviderWaitMs": 20_000,
        "correctionActiveMs": 100_000,
    }


def test_claim_and_first_draft_get_cannot_open_review_as_old_owner(
    old_client, new_client, seeded_draft, race
) -> None:
    get_status, claim_status = race(
        lambda: old_client.get(
            f"/api/v1/projects/{seeded_draft.project_id}/draft"
        ),
        lambda: claim_project(new_client, seeded_draft.project_id),
    )
    assert claim_status == 200
    assert get_status in {200, 404}
    if get_status == 200:
        assert review_opened_before_claim(seeded_draft.project_id)
    assert no_old_owner_review_open_after_claim(seeded_draft.project_id)
```

Layer review must reject false/missing confirmations and an invalid current asset.

- [ ] **Step 2: Run API tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_service.py apps/api/tests/modules/assets/test_routes.py -q
```

Expected: FAIL with missing routes/service.

- [ ] **Step 3: Implement authenticated project-scoped endpoints**

Use the existing anonymous signed session dependency only to authenticate and obtain `browser_session_id`; do not authorize the project before the mutation transaction. `POST /draft/media` is multipart with required scalar fields `expectedRevision`, `sourceLayerId`, `purpose` and one `png` file. It accepts only grayscale/alpha PNG, decodes through Pillow, rejects decompression bombs and stages canonical bytes privately. Its final `BEGIN IMMEDIATE` calls `require_project_owner_in_transaction`, requires the current project/draft revision to equal `expectedRevision`, requires an exact current source layer and matching dimensions, inserts/reuses a `draft_media_staging` row, and leaves the asset revision unchanged; ownership/revision failure deletes the unreferenced object. Unconsumed staging expires at `createdAt + 1 hour`, is never served by the media GET, and is included in retention inventory. The `201` response is exactly `{mediaId,contentHash,sourceLayerId,purpose,expectedRevision,expiresAt}` with no path.

`PATCH /draft` and `/draft/layer-review` perform the same owner guard inside their CAS transaction. A `replace_source_mask` operation must present both `stagedMediaId` and `maskContentHash`; the service loads an unexpired, unconsumed `MASK_REPLACEMENT` row matching project, current revision, source layer and hash, marks it consumed in the same successful CAS, and then may remove the staging row because the draft itself now owns the content hash. A stale/foreign/wrong-purpose/already-consumed staging row returns 409/422 without changing revision. `PART_REGENERATION_EDIT_MASK` is consumed only by Task 8 job creation and remains linked/readable to that run until it reaches a domain-terminal checkpoint. Add a handoff-vs-write race test for media upload, PATCH and review: a write may commit before claim or return 404, but no old-owner mutation may commit after claim. The GET media route accepts a lowercase SHA-256 only, verifies it is referenced by the authenticated project's current draft (Task 13 also permits the active immutable approved asset), streams canonical PNG with `Cache-Control: private, no-store`, and returns 404 for foreign/unreferenced hashes; it never returns a path or permanent URL. This task owns only the route and generated OpenAPI contract; Task 8 creates the Web client after `editorApi.ts` exists. PATCH body is:

```python
class PatchDraftRequest(BaseModel):
    revision: int
    operations: list[DraftOperation]


class LayerReviewRequest(BaseModel):
    revision: int
    identity_confirmed: Literal[True] = Field(alias="identityConfirmed")
    layer_check_confirmed: Literal[True] = Field(alias="layerCheckConfirmed")
    action_check_confirmed: Literal[True] = Field(alias="actionCheckConfirmed")
```

The service applies operations, saves through CAS, and maps `StaleRevisionError` to the exact Phase 0 `409` error envelope above. Mask and validation errors use the same envelope with machine fields under `error.details`. PATCH does not run approval-only non-empty bead validation. `GET /draft` is owner-aware because its first valid `LAYER_REVIEW` read is also a timing mutation: the route authenticates only the BrowserSession, then `get_draft_for_user` opens `BEGIN IMMEDIATE`, calls `require_project_owner_in_transaction`, atomically sets immutable `layer_review_opened_at` if absent, and returns that same row; refreshes never reset it. A claim-vs-first-GET test proves the read/timing write linearizes before claim or returns 404, never opens correction timing from the old owner afterward. Layer review calls `validate_layer_review_draft`, verifies at most two server-owned `PART_REGENERATION` jobs, sets server `layer_review_completed_at`, computes wall time from those timestamps, subtracts the union of server-recorded Provider-wait intervals for those part jobs, and persists wall/wait/active milliseconds with the three confirmations. Client timing fields are forbidden and ignored as an authority. It then sets next step `BEAD_QUANTIZATION` without quantizing in the request.

- [ ] **Step 4: Run API tests and confirm GREEN**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_service.py apps/api/tests/modules/assets/test_routes.py -q
make contracts
pnpm contracts:check
```

Expected: PASS; stale writes never change stored JSON, invalid mask bytes never reach storage, and generated draft/review contracts have no drift.

- [ ] **Step 5: Commit draft APIs**

```bash
git add apps/api/src/pindou_pet/modules/assets/service.py apps/api/src/pindou_pet/modules/assets/routes.py apps/api/src/pindou_pet/api/router.py apps/api/tests/modules/assets/test_service.py apps/api/tests/modules/assets/test_routes.py packages/contracts
git commit -m "feat(api): expose revision-safe asset editing"
```

### Task 6A: Generate the initial high-resolution layer draft locally

**Files:**
- Create: `apps/api/src/pindou_pet/modules/pipeline/layer_generation.py`
- Modify: `apps/api/src/pindou_pet/domain/enums.py`
- Modify: `apps/api/src/pindou_pet/modules/jobs/schemas.py`
- Modify: `apps/api/src/pindou_pet/modules/jobs/service.py`
- Modify: `apps/api/src/pindou_pet/modules/jobs/tasks.py`
- Modify: `apps/api/src/pindou_pet/modules/jobs/recovery.py`
- Modify: `apps/api/src/pindou_pet/modules/projects/models.py`
- Modify: `apps/api/src/pindou_pet/modules/assets/repository.py`
- Create: `tests/unit/pipeline/test_layer_generation.py`
- Create: `tests/integration/jobs/test_layer_generation_task.py`
- Modify: `tests/integration/api/test_generation_job_routes.py`
- Modify: `apps/web/src/features/create/api.ts`
- Modify: `apps/web/src/features/create/ShapeConfirmation.tsx`
- Modify: `apps/web/src/features/create/__tests__/ShapeConfirmation.test.tsx`
- Modify: `packages/contracts/src/generated.ts`

**Interfaces:**
- Consumes: Phase 2 confirmed transparent high-resolution role/checkpoint; Phase 1 `config/segmentation.freeze.yaml` and frozen `providers/perception/local_bundle.py`; Task 0 verified palette/quantizer freezes; Task 1 asset models and Task 5 repository.
- Produces: `LAYER_GENERATION` request/result through the existing generation-job/RQ routes, a content-addressed checkpoint, and the first revisioned `DraftAsset` with `beadLayers=[]` that passes `validate_layer_review_draft` before project transition to `LAYER_REVIEW`.

- [ ] **Step 1: Write RED local builder, job, checkpoint, and UI tests**

```python
def test_local_layer_generation_builds_complete_review_draft(
    frozen_perception_bundle, confirmed_role_png
) -> None:
    result = build_layer_draft(
        confirmed_role_png,
        perception=frozen_perception_bundle,
        segmentation_freeze=load_segmentation_freeze(),
        palette_manifest=load_deployment_palette().public_manifest,
        quantizer_manifest=load_quantizer_freeze(),
    )
    draft = result.draft
    assert draft.bead_layers == []
    assert {
        layer.logical_group for layer in draft.source_layers if layer.physical_export
    } == {
        "BODY", "HEAD", "SCREEN_LEFT_FRONT_PAW",
        "SCREEN_RIGHT_FRONT_PAW", "TAIL", "EYES",
    }
    assert all(mask_is_nonempty(layer.mask_content_hash) for layer in draft.source_layers)
    assert {layer.id for layer in draft.source_layers if layer.logical_group == "EYES"} >= {
        "EYES_OPEN", "EYES_CLOSED",
    }
    assert all(layer.neutral_transform == NeutralTransform() for layer in draft.source_layers)
    assert all(math.isfinite(layer.pivot_global.x) and math.isfinite(layer.pivot_global.y)
               for layer in draft.source_layers)
    assert {animation.name for animation in draft.animations} == {
        "breath", "blink", "tail_wag", "raise_screen_left_front_paw", "bounce",
    }
    assert validate_layer_review_draft(draft) == []


def test_layer_generation_is_local_checkpointed_and_not_a_part_attempt(
    layer_job_harness,
) -> None:
    first = layer_job_harness.run_to_completion()
    second = layer_job_harness.recover_and_run_same_input()
    assert first.checkpoint_hash == second.checkpoint_hash
    assert layer_job_harness.perception_calls == 1
    assert layer_job_harness.generation_provider_submit_calls == 0
    assert layer_job_harness.part_regeneration_attempts == 0


def test_layer_generation_uses_the_same_global_lease_as_provider_stages(
    layer_job_harness, provider_job_harness
) -> None:
    provider_job_harness.acquire_global_generation_lease()
    layer_job_harness.run_once()
    assert layer_job_harness.status == "QUEUED"
    assert layer_job_harness.perception_calls == 0
    provider_job_harness.release_global_generation_lease()
    layer_job_harness.run_until_global_lease_acquired()
    assert provider_job_harness.try_run() == "DEFERRED_TO_RECONCILER"
    layer_job_harness.resume_to_completion()
    provider_job_harness.reconcile_missing_rq_job()
    assert provider_job_harness.try_run() == "STARTED"
    assert layer_job_harness.status == "SUCCEEDED"
```

```tsx
it("accepts the shape, starts local layer generation, polls, then opens review", async () => {
  renderShapeConfirmation(confirmedIdentityResult);
  await user.click(screen.getByRole("button", { name: "接受初稿" }));
  expect(createGenerationJob).toHaveBeenCalledWith(expect.any(String), {
    kind: "LAYER_GENERATION", expectedRevision: confirmedIdentityResult.revision,
  });
  resolveJobPoll({ status: "SUCCEEDED", draftRevision: 8 });
  expect(await screen.findByText("分层草稿已生成")).toBeVisible();
  expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/\/edit\?tab=layers$/));
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest tests/unit/pipeline/test_layer_generation.py tests/integration/jobs/test_layer_generation_task.py tests/integration/api/test_generation_job_routes.py -q -k layer_generation
pnpm --filter @pindou/web test --run src/features/create/__tests__/ShapeConfirmation.test.tsx
```

Expected: FAIL because `LAYER_GENERATION`, local builder, draft checkpoint and ShapeConfirmation transition do not exist.

- [ ] **Step 3: Implement deterministic local source layers, rig, patches, and tracks**

Define the existing job union member:

```python
class LayerGenerationRequest(BaseModel):
    kind: Literal["LAYER_GENERATION"]
    expected_revision: int = Field(alias="expectedRevision")


class LayerGenerationResult(BaseModel):
    draft_revision: int = Field(alias="draftRevision")
    checkpoint_hash: str = Field(alias="checkpointHash")
    source_layer_ids: list[str] = Field(alias="sourceLayerIds")
```

`build_layer_draft` uses only the frozen local perception bundle to derive the six required masks from the confirmed role. It writes full-canvas transparent PNG/mask pairs, deterministic zIndex values, grid-space pivots, identity neutral transforms and stable node IDs `node-body`, `node-head`, `node-screen-left-front-paw`, `node-screen-right-front-paw`, `node-tail`, and `node-eyes`. `node-body.parentNodeId=null`; head, both screen paws and tail parent to `node-body`; eyes parent to `node-head`. `EYES_OPEN` and locally generated `EYES_CLOSED` share `node-eyes`, `variantGroupId="eyes-state"`, stable `variantId` values `eyes-open`/`eyes-closed`, and one `VariantGroup(targetNodeId="node-eyes", neutralVariantId="eyes-open")`; closed eyes are derived deterministically from the open-eye mask and local sampled colors. Non-variant source layers set both variant fields to null. Baseline neck/chest/tail-root reveal patches use bounded mask dilation plus nearest opaque source-color propagation, are `physicalExport=false`, and never call a Provider. Create the five approved default animations with transform/discrete-visibility tracks targeting these node/variant IDs and neutral final keyframes.

- [ ] **Step 4: Add RQ/checkpoint recovery and wire ShapeConfirmation**

The stage key covers project ID, confirmed-role hash, project revision, segmentation-freeze checksum, Task 0 palette/quantizer freeze checksums and `layer-generation-v1`. Extend the existing `ProjectStep` exactly once with `LAYER_GENERATION`, `LAYER_REVIEW`, `BEAD_QUANTIZATION`, `BEAD_REVIEW`, and `READY`; add a serialization/OpenAPI contract test covering every old and new value. `JobService` accepts the request only after persisted shape confirmation, sets `PROCESSING/LAYER_GENERATION`, and enqueues one local RQ task. Before any perception/file work, the task acquires the same Phase 2 database-backed global generation lease used by external Provider stages; if unavailable it requeues without work, holds the lease through checkpoint commit, and releases it on success/failure. Thus local and external stages across all projects remain strictly serial. The task verifies and embeds both Task 0 manifests before constructing `DraftAsset`, rechecks tombstone/revision, writes every content-addressed file, validates the complete review draft, then atomically saves draft/checkpoint at the current authoritative project revision and transitions to `LAYER_REVIEW`; a crash before the transaction leaves no visible partial draft, and recovery reuses a valid checkpoint instead of rerunning perception. It records `providerWaitMs=0` and never increments `PART_REGENERATION` counters. ShapeConfirmation submits the backend job and polls the existing GET route every two seconds; only a successful result navigates to the layer tab.

Run:

```bash
make contracts
.venv/bin/python -m pytest tests/unit/pipeline/test_layer_generation.py tests/integration/jobs/test_layer_generation_task.py tests/integration/api/test_generation_job_routes.py -q -k layer_generation
pnpm --filter @pindou/web test --run src/features/create/__tests__/ShapeConfirmation.test.tsx
pnpm contracts:check
```

Expected: PASS; duplicate/recovered input has one local perception execution, zero Provider submissions, six nonempty physical groups, deterministic closed eyes/patches/tracks, and one atomic draft checkpoint.

- [ ] **Step 5: Commit automatic layer generation**

```bash
git add apps/api/src/pindou_pet/modules/pipeline/layer_generation.py apps/api/src/pindou_pet/domain/enums.py apps/api/src/pindou_pet/modules/jobs apps/api/src/pindou_pet/modules/projects/models.py apps/api/src/pindou_pet/modules/assets/repository.py tests/unit/pipeline/test_layer_generation.py tests/integration/jobs/test_layer_generation_task.py tests/integration/api/test_generation_job_routes.py apps/web/src/features/create packages/contracts
git commit -m "feat: generate local high-resolution layer drafts"
```

### Task 7: Implement deterministic D65/CIEDE2000 global quantization

**Files:**
- Modify: `apps/api/src/pindou_pet/modules/assets/palette.py`
- Create: `apps/api/src/pindou_pet/modules/assets/quantizer.py`
- Modify: `apps/api/tests/modules/assets/test_palette.py`
- Create: `apps/api/tests/modules/assets/test_quantizer.py`
- Modify: `apps/api/src/pindou_pet/modules/assets/service.py`
- Modify: `apps/api/src/pindou_pet/modules/assets/routes.py`
- Modify: `packages/contracts/src/generated.ts`

**Interfaces:**
- Consumes: reviewed high-resolution source layers/masks, layer-review confirmations, and only Task 0's byte-stable `load_deployment_palette(Path("config/palette.freeze.json"))` plus `config/quantizer.freeze.json`—never a request-selected palette.
- Produces: checksum-verified `FrozenPalette`, `quantize_draft(asset, source_images, frozen_palette) -> QuantizationResult`, plus `POST /api/v1/projects/{project_id}/draft/quantize` returning a new revision in `BEAD_REVIEW`.

- [ ] **Step 1: Write RED numerical and end-to-end quantizer tests**

Use fixed 2×2 and 58×58 fixtures with exact expected IDs:

```python
def test_frozen_palette_records_source_license_and_real_checksum() -> None:
    palette = load_deployment_palette(Path("config/palette.freeze.json"))
    decision_bytes = Path("docs/decisions/palette-selection.md").read_bytes()
    assert palette.brand and palette.series and palette.source.repository
    assert palette.decision_document_checksum == hashlib.sha256(decision_bytes).hexdigest()
    assert re.fullmatch(r"[0-9a-f]{40}", palette.source.commit)
    assert palette.license.spdx == "MIT"
    assert Path(palette.license.text_path).read_text().startswith("MIT License")
    assert palette.source_checksum == checksum_normalized_colors(palette.colors)
    assert len({color.print_code for color in palette.colors}) == len(palette.colors)


def test_tampered_palette_freeze_is_rejected(tmp_path) -> None:
    path = write_tampered_freeze(tmp_path, color_id="W01", rgb=(1, 2, 3))
    with pytest.raises(PaletteChecksumMismatch):
        load_deployment_palette(path)


def test_transparent_pixel_is_absent_but_white_is_a_bead() -> None:
    result = quantize_rgba(transparent_and_white_fixture(), frozen_palette())
    assert (0, 0) not in result.cells
    assert result.cells[(1, 0)].color_id == "W01"


def test_ciede2000_tie_breaks_by_color_id() -> None:
    palette = equal_lab_distance_palette(ids=("B02", "A01"))
    result = nearest_palette_color(target_lab(), palette)
    assert result.color_id == "A01"


def test_all_layers_share_one_subpalette_of_at_most_32_colors() -> None:
    result = quantize_draft(load_source_fixture(), palette_with_40_colors())
    assert len(result.selected_color_ids) == 32
    assert all(
        cell.color_id in result.selected_color_ids
        for layer in result.bead_layers
        for cell in layer.sparse_cells
    )


def test_quantization_preserves_source_rig_node_fields() -> None:
    source_asset = load_valid_layer_review_draft()
    result = quantize_draft(source_asset, source_images(), frozen_palette())
    sources = {layer.id: layer for layer in source_asset.source_layers}
    for bead in result.bead_layers:
        source = sources[bead.source_layer_id]
        assert (
            bead.node_id, bead.parent_node_id, bead.logical_group, bead.z_index,
            bead.physical_export, bead.variant_group_id, bead.variant_id,
            bead.pivot_global, bead.neutral_transform,
        ) == (
            source.node_id, source.parent_node_id, source.logical_group, source.z_index,
            source.physical_export, source.variant_group_id, source.variant_id,
            source.pivot_global, source.neutral_transform,
        )
```

Also assert identical RGB pixels in two layers get the same `colorId`, output is stable across repeat runs, no dithering field/path is active, and the draft `paletteManifest.sourceChecksum` exactly equals the deployment freeze checksum. The result persists sorted unique `selectedColorIds`; tests prove an ID outside the deployment palette, more than 32 IDs, duplicates or any bead cell outside that selection fails validation.

- [ ] **Step 2: Run quantizer tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_palette.py apps/api/tests/modules/assets/test_quantizer.py -q
```

Expected: FAIL because palette loader and quantizer functions are unavailable.

- [ ] **Step 3: Implement pure color conversion and quantization**

Re-run Task 0's provenance/checksum tests without modifying either freeze. Then implement `srgb8_to_lab_d65`, `ciede2000`, deterministic subpalette selection, nearest-neighbor downsampling into the shared grid, and `nearest_palette_color`. The public manifest loaded from `config/quantizer.freeze.json` must record:

```python
QuantizerManifest(
    version="pindou-ciede2000-v1",
    color_space="CIELAB",
    white_point="D65",
    distance_formula="CIEDE2000",
    tie_break_rule="colorId-ascending",
    max_colors=32,
    dithering=False,
)
```

Do not quantize source layers independently; first derive a global histogram from all physical visual layers, select the global subpalette, then map each layer with that same immutable selection. Every emitted `BeadLayer` copies its source layer's `nodeId`, `parentNodeId`, `logicalGroup`, `zIndex`, `physicalExport`, `variantGroupId`, `variantId`, `pivotGlobal`, and `neutralTransform` byte-for-byte. `sourceLayerId` records the representation mapping, while stable variant IDs—not source or bead layer IDs—remain in `VariantGroup` and visibility tracks; only layer-instance ID/content/cells may differ.

- [ ] **Step 4: Add and test the quantize endpoint**

The endpoint accepts `{revision}` only plus the authenticated `browser_session_id` supplied outside the JSON contract. In one `BEGIN IMMEDIATE` it calls `require_project_owner_in_transaction`, requires all three review confirmations, calls `validate_layer_review_draft`, reloads and verifies `config/palette.freeze.json` plus `config/quantizer.freeze.json`, uses content hashes to load source images, replaces every generated bead layer and persists the sorted unique 1–32 `selectedColorIds` atomically, records both full frozen manifests/checksums, increments revision, and advances to `BEAD_REVIEW`. Add a claim-vs-quantize race assertion with no post-claim old-owner commit. Regenerated OpenAPI/TypeScript exposes this field; the editor never derives it from cells.

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_palette.py apps/api/tests/modules/assets/test_quantizer.py apps/api/tests/modules/assets/test_routes.py -q
make contracts
pnpm contracts:check
```

Expected: PASS; repeated calls with the same source hash and revision-independent inputs produce identical bead layers and quantizer manifest.

- [ ] **Step 5: Commit quantization**

```bash
git add apps/api/src/pindou_pet/modules/assets/palette.py apps/api/src/pindou_pet/modules/assets/quantizer.py apps/api/src/pindou_pet/modules/assets/service.py apps/api/src/pindou_pet/modules/assets/routes.py apps/api/tests/modules/assets/test_palette.py apps/api/tests/modules/assets/test_quantizer.py apps/api/tests/modules/assets/test_routes.py packages/contracts
git commit -m "feat(assets): quantize layers onto a global bead palette"
```

### Task 8: Add server-owned part regeneration, regenerate contracts, and add the editor API client

**Files:**
- Modify: `apps/api/src/pindou_pet/modules/jobs/schemas.py`
- Modify: `apps/api/src/pindou_pet/modules/jobs/service.py`
- Modify: `apps/api/src/pindou_pet/modules/jobs/tasks.py`
- Modify: `apps/api/src/pindou_pet/modules/assets/repository.py`
- Create: `tests/unit/jobs/test_part_regeneration.py`
- Create: `tests/integration/jobs/test_part_regeneration_task.py`
- Modify: `tests/integration/api/test_generation_job_routes.py`
- Modify: `packages/contracts/src/generated.ts`
- Create: `apps/web/src/features/editor/api/editorApi.ts`
- Create: `apps/web/src/features/editor/__tests__/editorApi.test.ts`

**Interfaces:**
- Consumes: Phase 2 `POST/GET /api/v1/projects/{projectId}/generation-jobs...` union endpoint, Phase 1 Provider mask-edit contract, Task 5 draft CAS repository, and existing Web request/session wrapper.
- Produces: implemented `PART_REGENERATION` backend union member, atomic updated source layer/revision, generated `DraftAsset`/job types, and a typed editor client; React code must not hand-copy backend DTOs or call a Provider.

- [ ] **Step 1: Write RED client tests**

First add backend rule/task tests, then mock fetch and assert route/body preservation:

```python
def test_part_regeneration_rejects_third_attempt_stale_revision_and_foreign_mask(
    job_service, layer_review_project, fresh_layer_review_project
) -> None:
    first = job_service.create(layer_review_project.id, valid_part_regeneration())
    complete_part_job(first)
    second = job_service.create(
        layer_review_project.id,
        valid_part_regeneration(revision=current_revision(layer_review_project)),
    )
    complete_part_job(second)
    with pytest.raises(RegenerationLimitReached):
        job_service.create(
            layer_review_project.id,
            valid_part_regeneration(revision=current_revision(layer_review_project)),
        )
    with pytest.raises(RevisionConflict):
        job_service.create(
            fresh_layer_review_project.id, valid_part_regeneration(revision=6)
        )
    with pytest.raises(ProjectMediaOwnershipError):
        job_service.create(
            fresh_layer_review_project.id,
            valid_part_regeneration(
                revision=current_revision(fresh_layer_review_project),
                mask_hash=foreign_hash(),
            ),
        )


def test_part_result_atomically_replaces_source_hashes_and_revision(
    part_task_harness,
) -> None:
    result = part_task_harness.complete_provider_result(
        image_hash="1" * 64, mask_hash="2" * 64,
        completion_mask_hash="3" * 64, provider_wait_ms=4200,
    )
    assert result.provider_wait_ms == 4200
    assert result.new_revision == 8
    assert result.source_layer.image_content_hash == "1" * 64
    assert result.source_layer.mask_content_hash == "2" * 64
    assert result.source_layer.completion_mask_hash == "3" * 64
    assert part_task_harness.provider.last_request.edit_mask_hash == "a" * 64
    assert part_task_harness.provider.last_request.edit_instruction


def test_part_regeneration_enforces_attempt_and_cumulative_wait_gates(
    job_service, layer_review_project
) -> None:
    set_cumulative_generation_wait_ms(layer_review_project, 300_000)
    with pytest.raises(GenerationWaitBudgetReached):
        job_service.create(layer_review_project.id, valid_part_regeneration())
    set_cumulative_generation_wait_ms(layer_review_project, 298_000)
    result = complete_part_job(
        job_service.create(layer_review_project.id, valid_part_regeneration()),
        provider_wait_ms=4_200, server_generation_wait_ms=6_200,
    )
    assert result.cumulative_generation_wait_ms == 304_200
    assert result.over_budget is True


def test_part_regeneration_holds_global_lease_through_provider_wait(
    part_task_harness, competing_stage_harness
) -> None:
    part_task_harness.submit_and_enter_provider_wait()
    assert competing_stage_harness.try_run() == "DEFERRED_TO_RECONCILER"
    part_task_harness.complete_provider_result(provider_wait_ms=4_200)
    competing_stage_harness.reconcile_missing_rq_job()
    assert competing_stage_harness.try_run() == "STARTED"


def test_failed_part_provider_result_changes_no_source_hash_or_revision(
    part_task_harness,
) -> None:
    before = part_task_harness.snapshot_draft()
    part_task_harness.fail_provider_result("PROVIDER_5XX")
    assert part_task_harness.snapshot_draft() == before
```

```ts
it("sends revision and discriminated operations unchanged", async () => {
  server.use(http.patch("*/api/v1/projects/:id/draft", captureRequest));
  await patchDraft("project-1", {
    revision: 7,
    operations: [{ kind: "set_pivot", nodeId: "node-tail", pivotGlobal: { x: 42, y: 35 } }],
  });
  expect(capturedJson).toEqual(expect.objectContaining({ revision: 7 }));
});

it("maps a 409 into StaleRevisionError", async () => {
  server.use(staleRevisionResponse(8));
  await expect(patchDraft("project-1", request)).rejects.toMatchObject({
    currentRevision: 8,
  });
});

it("loads project media through the authenticated API instead of treating a hash as a URL", async () => {
  const contentHash = "a".repeat(64);
  server.use(
    http.get("*/api/v1/projects/:id/media/:hash", ({ params }) => {
      expect(params).toEqual({ id: "project-1", hash: contentHash });
      return new HttpResponse(new Uint8Array([137, 80, 78, 71]), {
        headers: { "Content-Type": "image/png" },
      });
    }),
  );
  const blob = await getProjectMediaBlob("project-1", contentHash);
  expect(blob.type).toBe("image/png");
});

it("submits local part regeneration through the backend job API", async () => {
  await requestPartRegeneration("project-1", {
    kind: "PART_REGENERATION",
    expectedRevision: 7,
    partLabel: "TAIL",
    sourceLayerId: "source-tail-neutral",
    editMediaId: "media-tail-1",
    editMaskHash: "a".repeat(64),
    editInstruction: "补全动作会露出的尾根区域",
  });
  expect(capturedUrl).toEndWith("/api/v1/projects/project-1/generation-jobs");
  expect(capturedJson.kind).toBe("PART_REGENERATION");
});
```

- [ ] **Step 2: Run client tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest tests/unit/jobs/test_part_regeneration.py tests/integration/jobs/test_part_regeneration_task.py tests/integration/api/test_generation_job_routes.py -q
pnpm --filter @pindou/web test --run src/features/editor/__tests__/editorApi.test.ts
```

Expected: FAIL because the server union lacks `PART_REGENERATION` execution and the Web client is absent; the draft-operation and project-media route types generated in Task 6 remain the contract baseline.

- [ ] **Step 3: Implement server-owned part regeneration, then regenerate contracts and the thin client**

Extend the existing request discriminator with:

```python
class PartRegenerationRequest(BaseModel):
    kind: Literal["PART_REGENERATION"]
    expected_revision: int = Field(alias="expectedRevision")
    part_label: PartLabel = Field(alias="partLabel")
    source_layer_id: str = Field(alias="sourceLayerId", min_length=1)
    edit_media_id: str = Field(alias="editMediaId", min_length=1)
    edit_mask_hash: str = Field(alias="editMaskHash", pattern=r"^[0-9a-f]{64}$")
    edit_instruction: str = Field(alias="editInstruction", min_length=1, max_length=500)
```

Add a contract test asserting `set(PartLabel)` equals the six required logical-group strings and that neither `FOREGROUND` nor eye variant IDs parse as a label. `JobService.create(project_id, browser_session_id, request)` opens `BEGIN IMMEDIATE`, calls `require_project_owner_in_transaction`, then validates current layer-review status/revision, an exact current `sourceLayerId`, equality of that layer's `logicalGroup` string to `partLabel.value`, and an unexpired/unconsumed `draft_media_staging` row whose `mediaId`, project, `expectedRevision`, `sourceLayerId`, purpose `PART_REGENERATION_EDIT_MASK`, and content hash all match. It marks that row consumed by the newly created public GenerationRun in the same transaction, then validates server-counted attempts `<2` and existing Phase 2 `cumulativeGenerationWaitMs < 300_000`; any failure rolls back both run and consumption. Attempts and cumulative wait are independent gates derived server-side. Add a claim-vs-part-request race assertion with no post-claim old-owner job. This makes `EYES_OPEN` and `EYES_CLOSED` unambiguous: both send `partLabel=EYES`, while `sourceLayerId` selects exactly one variant; a deliberate two-variant change consumes two server-counted local attempts. The API records `acceptedAt` when it accepts the local-regeneration request. `tasks.py` acquires the same global generation lease as every local/external stage before submission and retains the database lease throughout asynchronous Provider polling, so no competing project/stage starts. It reconstructs the edit mask only through the run-linked private staging row and builds the Phase 1 mask-edit Provider request on the server. The staging blob cannot expire while that run is nonterminal; after a domain-terminal checkpoint the retention inventory schedules it for deletion unless another authoritative reference exists. Server timestamps bound each actual Provider-wait interval (`providerWaitStartedAt`, `providerWaitEndedAt`) and derive `providerWaitMs` only for correction-time subtraction/diagnostics. `resultReadyAt` is when the updated source hashes/revision are readable; `serverGenerationWaitMs = resultReadyAt - acceptedAt` includes queue, Provider and local mask/composition/checkpoint work. On terminal success, one system transaction rechecks tombstone/current revision and that exact source layer ID, atomically stores the new `imageContentHash`, `maskContentHash`, `completionMaskHash`, increments the draft/project revision, adds `serverGenerationWaitMs` (not `providerWaitMs`) to `cumulativeGenerationWaitMs`, records `overBudget = cumulativeGenerationWaitMs > 300_000`, both timing intervals/milliseconds and new revision, then publishes the checkpoint and releases the lease. It intentionally does not require the accepting owner to remain current: a legitimate handoff during Provider wait must not discard the result. A Provider failure changes no layer hash/revision but records its terminal server wait and adds it to the cumulative total. The normalized result exposes both waits/cumulative/overBudget; Phase 5 marks the cat failed if the cumulative total exceeds 300 seconds. Local-only `LAYER_GENERATION` is not one of the three counted generation attempts and adds zero.

Run the repository OpenAPI generator:

```bash
make contracts
```

Expected: `packages/contracts/src/generated.ts` changes to add the `PART_REGENERATION` generation-job member while preserving the existing `DraftOperation` union. Implement functions `getDraft`, `getProjectMediaBlob`, `uploadMask`, `patchDraft`, `confirmLayerReview`, `quantizeDraft`, `requestPartRegeneration`, `getGenerationJob`, and `getGenerationJobResult`; `uploadMask` always sends `expectedRevision`, `sourceLayerId`, `purpose` and PNG and returns the typed staging receipt, never a bare hash. `getProjectMediaBlob` uses the generated authenticated project-media route and returns a Blob, and the editor creates/revokes an object URL rather than interpreting a content hash as a URL. The last three job functions call only backend routes, so the browser never imports/holds Provider URLs or credentials. Task 13 adds `approveDraft` only after the approval route exists. Reuse the Phase 0 shared error decoder and map `error.code === "STALE_REVISION"` plus `error.details.currentRevision` to:

```ts
export class StaleRevisionError extends Error {
  constructor(readonly currentRevision: number) {
    super(`Draft changed on the server; current revision is ${currentRevision}`);
  }
}
```

- [ ] **Step 4: Run client tests, generation drift check, and typecheck**

Run:

```bash
.venv/bin/python -m pytest tests/unit/jobs/test_part_regeneration.py tests/integration/jobs/test_part_regeneration_task.py tests/integration/api/test_generation_job_routes.py -q
pnpm --filter @pindou/web test --run src/features/editor/__tests__/editorApi.test.ts
pnpm contracts:check
pnpm --filter @pindou/web typecheck
```

Expected: all commands exit 0; `contracts:check` reports no uncommitted regeneration drift.

- [ ] **Step 5: Commit generated contracts and client**

```bash
git add apps/api/src/pindou_pet/modules/jobs/schemas.py apps/api/src/pindou_pet/modules/jobs/service.py apps/api/src/pindou_pet/modules/jobs/tasks.py apps/api/src/pindou_pet/modules/assets/repository.py tests/unit/jobs/test_part_regeneration.py tests/integration/jobs/test_part_regeneration_task.py tests/integration/api/test_generation_job_routes.py packages/contracts apps/web/src/features/editor/api/editorApi.ts apps/web/src/features/editor/__tests__/editorApi.test.ts
git commit -m "feat(web): add typed character editor API"
```

### Task 9: Build the high-resolution editor state and coordinate kernel

**Files:**
- Create: `apps/web/src/features/editor/model/editorReducer.ts`
- Create: `apps/web/src/features/editor/model/gridCoordinates.ts`
- Create: `apps/web/src/features/editor/model/maskRaster.ts`
- Create: `apps/web/src/features/editor/__tests__/editorReducer.test.ts`
- Create: `apps/web/src/features/editor/__tests__/gridCoordinates.test.ts`
- Create: `apps/web/src/features/editor/__tests__/maskRaster.test.ts`

**Interfaces:**
- Consumes: generated `DraftAsset` and `DraftOperation` types.
- Produces: framework-independent local editor state, source-image↔stage↔58-grid coordinate conversion, and deterministic brush mask rasterization used by Konva components.

- [ ] **Step 1: Write RED reducer and coordinate tests**

```ts
it("maps a retina-scaled stage point into global grid coordinates", () => {
  expect(stageToGrid({ x: 290, y: 145 }, { x: 0, y: 0, width: 580, height: 580 }))
    .toEqual({ x: 29, y: 14.5 });
});

it("preserves unsaved operations after a stale-revision response", () => {
  const state = withPendingPivot(initialState, "tail", { x: 42, y: 35 });
  const next = editorReducer(state, { type: "saveConflict", currentRevision: 8 });
  expect(next.pendingOperations).toHaveLength(1);
  expect(next.conflict?.currentRevision).toBe(8);
});

it("rasterizes one pointer gesture as one mask transaction", () => {
  const mask = rasterizeStroke(emptyMask(8, 8), [{ x: 1, y: 1 }, { x: 6, y: 1 }], 1, "paint");
  expect(alphaAt(mask, 3, 1)).toBe(255);
});
```

- [ ] **Step 2: Run model tests and confirm RED**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/editor/__tests__/editorReducer.test.ts src/features/editor/__tests__/gridCoordinates.test.ts src/features/editor/__tests__/maskRaster.test.ts
```

Expected: FAIL with unresolved editor model modules.

- [ ] **Step 3: Implement pure reducer and math functions**

State shape:

```ts
type EditorState = {
  serverDraft: DraftAsset;
  workingDraft: DraftAsset;
  selectedLayerId: string;
  pendingOperations: DraftOperation[];
  saveState: "clean" | "dirty" | "saving" | "conflict";
  conflict: { currentRevision: number } | null;
  serverTiming: {
    layerReviewOpenedAt: string;
    serverNow: string;
    partRegenerationProviderWaitMs: number;
  };
};
```

Keep viewport pan/zoom outside domain operations. Coalesce repeated pivot/zIndex updates for the same layer before save; one brush gesture uploads `MASK_REPLACEMENT` with the current revision/layer, then builds one `replace_source_mask` operation carrying the returned `stagedMediaId` and `contentHash` while retaining that same revision. Upload does not mutate the draft revision; only the following PATCH does. Clamp pivots to finite global coordinates, but permit fractional pivots. The UI may derive a display-only ticking estimate from `serverTiming` and terminal job `providerWaitMs`; it never submits or persists correction duration, and server review timing remains the acceptance fact source.

- [ ] **Step 4: Run model tests and confirm GREEN**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/editor/__tests__/editorReducer.test.ts src/features/editor/__tests__/gridCoordinates.test.ts src/features/editor/__tests__/maskRaster.test.ts
```

Expected: PASS with deterministic output independent of device pixel ratio.

- [ ] **Step 5: Commit the editor kernel**

```bash
git add apps/web/src/features/editor/model apps/web/src/features/editor/__tests__/editorReducer.test.ts apps/web/src/features/editor/__tests__/gridCoordinates.test.ts apps/web/src/features/editor/__tests__/maskRaster.test.ts
git commit -m "feat(web): add high-resolution editor state kernel"
```

### Task 10: Build the high-resolution layer correction workbench

**Files:**
- Create: `apps/web/src/features/editor/components/EditorPage.tsx`
- Create: `apps/web/src/features/editor/components/HighResEditor.tsx`
- Create: `apps/web/src/features/editor/components/LayerPanel.tsx`
- Create: `apps/web/src/features/editor/components/JointOverlay.tsx`
- Create: `apps/web/src/features/editor/components/ActionPreview.tsx`
- Create: `apps/web/src/features/editor/__tests__/HighResEditor.test.tsx`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:**
- Consumes: Task 8 API and Task 9 model kernel.
- Produces: `/projects/:projectId/edit?tab=layers`, the three review confirmations, and a successful transition to quantization.

- [ ] **Step 1: Write RED component tests for correction and review gating**

```tsx
it("exposes only layer-domain controls and saves a moved tail pivot", async () => {
  renderEditor(validDraft);
  await user.click(screen.getByRole("button", { name: "尾巴" }));
  dragJoint("尾根", { x: 42, y: 35 });
  await user.click(screen.getByRole("button", { name: "保存校正" }));
  expect(patchDraft).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    revision: 7,
    operations: [expect.objectContaining({ kind: "set_pivot", nodeId: "node-tail" })],
  }));
});

it("does not enable quantization until all three gates are checked", async () => {
  renderEditor(validDraft);
  expect(screen.getByRole("button", { name: "进入拼豆化" })).toBeDisabled();
  await checkAllThreeReviewGates();
  expect(screen.getByRole("button", { name: "进入拼豆化" })).toBeEnabled();
});

it("uses backend part regeneration, pauses correction time, and caps attempts at two", async () => {
  renderEditor(validDraft, { partRegenerationAttempts: 1 });
  await user.click(screen.getByRole("button", { name: "重做尾巴部件" }));
  expect(requestPartRegeneration).toHaveBeenCalledWith(expect.any(String),
    expect.objectContaining({ kind: "PART_REGENERATION", partLabel: "TAIL" }));
  resolveGenerationJob({ status: "SUCCEEDED", providerWaitMs: 4200,
    partRegenerationAttempts: 2, newRevision: 8 });
  expect(screen.getByText("供应商等待 4.2 秒（不计入校正）")).toBeVisible();
  expect(screen.getByRole("button", { name: "重做尾巴部件" })).toBeDisabled();
  expect(screen.getByText("供应商等待 4.2 秒（不计入校正）")).toBeVisible();
  expect(currentDraftRevision()).toBe(8);
});
```

- [ ] **Step 2: Run component tests and confirm RED**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/editor/__tests__/HighResEditor.test.tsx
```

Expected: FAIL because workbench components are absent.

- [ ] **Step 3: Implement the minimum usable correction workbench**

Use one Konva stage for composited transparent source layers; draw mask edits into an offscreen `ImageData` and refresh the selected layer preview. Provide:

- paint/erase with size control;
- layer visibility, parent, and z-order controls;
- named neck, left shoulder, right shoulder, and tail-root handles;
- five static/deterministic action-preview buttons using the draft animation tracks;
- selected-part regeneration through the server-owned Phase 2 `generation-jobs` endpoint, with edit mask/instruction, 2-second status polling, a hard server-reported maximum of two local attempts, terminal reload of the returned source hashes/new revision, and visible Provider-wait accounting that pauses correction timing;
- explicit identity, layer, and action confirmations;
- a conflict banner with “加载服务器版本” and “保留本地操作并重新应用” actions.

Do not serialize the stage. `Save` uploads changed masks first, replaces their hashes in operations, then PATCHes one atomic operation batch. The browser never calls `GenerationProvider` or a Provider URL; it submits/polls the backend job API. Review submission sends only revision plus the three confirmations; server timestamps and recorded part-job Provider intervals are the sole correction-time evidence.

- [ ] **Step 4: Run component tests and typecheck**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/editor/__tests__/HighResEditor.test.tsx
pnpm --filter @pindou/web typecheck
```

Expected: PASS; typecheck finds no hand-written duplicate API DTO.

- [ ] **Step 5: Commit the high-resolution workbench**

```bash
git add apps/web/src/features/editor/components apps/web/src/features/editor/__tests__/HighResEditor.test.tsx apps/web/src/app/router.tsx
git commit -m "feat(web): add layer correction workbench"
```

### Task 11: Implement bead tools, transaction history, and instant risk preview

**Files:**
- Create: `apps/web/src/features/editor/model/beadTools.ts`
- Create: `apps/web/src/features/editor/model/history.ts`
- Create: `apps/web/src/features/editor/model/beadRiskPreview.ts`
- Create: `apps/web/src/features/editor/__tests__/beadTools.test.ts`
- Create: `apps/web/src/features/editor/__tests__/history.test.ts`
- Create: `apps/web/src/features/editor/__tests__/beadRiskPreview.test.ts`
- Create: `tests/fixtures/assets/risk-patterns.json`

**Interfaces:**
- Consumes: generated `SparseCell`, selected global subpalette, and `58×58` coordinates.
- Produces: `applyBeadTool`, `pickColor`, `beginTransaction`, `commitTransaction`, `undo`, `redo`, and `analyzeBeadRisks(cells) -> BeadRisk[]` used by the bead editor. Risk IDs are exactly `ISOLATED:x:y`, `DIAGONAL_ONLY:x:y`, and `WEAK_ARTICULATION:x:y`.

- [ ] **Step 1: Write RED tests for tools and history boundaries**

```ts
it("fills only the four-neighbor connected empty region", () => {
  const cells = diagonalBoundaryFixture();
  const filled = applyBeadTool(cells, "fill", { x: 0, y: 0 }, "R01");
  expect(cellAt(filled, 1, 1)?.colorId).not.toBe("R01");
});

it("distinguishes erasing a white bead from painting white", () => {
  const painted = applyBeadTool([], "paint", { x: 2, y: 3 }, "W01");
  expect(cellAt(painted, 2, 3)?.colorId).toBe("W01");
  expect(applyBeadTool(painted, "erase", { x: 2, y: 3 }, "W01")).toEqual([]);
});

it("commits a drag as one undo transaction and clears redo on new edit", () => {
  const history = commitStrokeAcrossThreeCells(emptyHistory());
  expect(undo(history).present).toEqual([]);
  expect(newEditAfterUndo(history).future).toEqual([]);
});

it.each(loadSharedRiskGoldenCases())("matches shared risk golden $name", ({ cells, risks }) => {
  expect(analyzeBeadRisks(cells)).toEqual(risks);
});
```

`loadSharedRiskGoldenCases()` reads root `tests/fixtures/assets/risk-patterns.json`, the same file used by Phase 4 Python tests. Cover bounded/unbounded fill, border cells 0/57, illegal subpalette color rejection, eyedropper on empty/occupied cells, undo after layer selection changes, pan/zoom exclusion from history, isolated cells, diagonal-only attachment, a one-cell articulation, and a two-cell-wide neck with no articulation warning.

- [ ] **Step 2: Run bead-kernel tests and confirm RED**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/editor/__tests__/beadTools.test.ts src/features/editor/__tests__/history.test.ts src/features/editor/__tests__/beadRiskPreview.test.ts
```

Expected: FAIL with unresolved bead modules.

- [ ] **Step 3: Implement sparse-map operations and bounded history**

Internally index cells by `${x}:${y}`; sort returned arrays by `(y, x, colorId)` before comparison/save. Flood fill uses a queue and exact previous `colorId | null` matching with four-neighbor offsets. Cap history at 100 committed edit transactions; a pointerdown–move–pointerup gesture commits once. Risk preview uses full composed physical occupancy, four-neighbor degree checks, diagonal-only detection, and Tarjan articulation points; it sorts by `(kind,y,x)` and emits the shared stable IDs without waiting for the server.

- [ ] **Step 4: Run bead-kernel tests and confirm GREEN**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/editor/__tests__/beadTools.test.ts src/features/editor/__tests__/history.test.ts src/features/editor/__tests__/beadRiskPreview.test.ts
```

Expected: PASS; no operation produces coordinates outside `[0,57]` or a color outside the supplied subpalette.

- [ ] **Step 5: Commit bead editing primitives**

```bash
git add apps/web/src/features/editor/model/beadTools.ts apps/web/src/features/editor/model/history.ts apps/web/src/features/editor/model/beadRiskPreview.ts apps/web/src/features/editor/__tests__/beadTools.test.ts apps/web/src/features/editor/__tests__/history.test.ts apps/web/src/features/editor/__tests__/beadRiskPreview.test.ts tests/fixtures/assets/risk-patterns.json
git commit -m "feat(web): add deterministic bead editing tools"
```

### Task 12: Build the 58×58 bead editor and server-authoritative save flow

**Files:**
- Create: `apps/web/src/features/editor/components/BeadEditor.tsx`
- Create: `apps/web/src/features/editor/components/BeadCanvas.tsx`
- Create: `apps/web/src/features/editor/components/BeadToolbar.tsx`
- Create: `apps/web/src/features/editor/components/RiskPanel.tsx`
- Create: `apps/web/src/features/editor/__tests__/BeadEditor.test.tsx`
- Modify: `apps/web/src/features/editor/components/EditorPage.tsx`

**Interfaces:**
- Consumes: Task 8 API, Task 11 bead/history/risk kernel, globally selected subpalette from draft.
- Produces: `/projects/:projectId/edit?tab=beads`, per-layer `replace_bead_cells` saves, and an approve action.

- [ ] **Step 1: Write RED component tests**

```tsx
it("only offers colors from the frozen global subpalette", () => {
  renderBeadEditor(validBeadDraft);
  expect(screen.getAllByRole("radio", { name: /色号/ })).toHaveLength(32);
  expect(screen.queryByText("切换品牌")).not.toBeInTheDocument();
});

it("saves sorted sparse cells for only the edited layer", async () => {
  renderBeadEditor(validBeadDraft);
  paintCell({ x: 57, y: 57 }, "W01");
  await user.click(screen.getByRole("button", { name: "保存拼豆修改" }));
  expect(patchDraft).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    operations: [expect.objectContaining({ kind: "replace_bead_cells" })],
  }));
});

it("keeps local history when the server reports a stale revision", async () => {
  patchDraft.mockRejectedValue(new StaleRevisionError(9));
  renderBeadEditor(validBeadDraft);
  paintCell({ x: 3, y: 4 }, "R01");
  await saveBeadChanges();
  expect(screen.getByText(/服务器版本 9/)).toBeVisible();
  expect(screen.getByRole("button", { name: "撤销" })).toBeEnabled();
});
```

- [ ] **Step 2: Run bead editor tests and confirm RED**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/editor/__tests__/BeadEditor.test.tsx
```

Expected: FAIL because bead editor components are missing.

- [ ] **Step 3: Implement canvas, tools, shortcuts, and save**

Render one cached Konva image per layer plus selected-cell overlay and grid; do not create 3,364 React elements. Implement paint, erase, fill, eyedropper, undo/redo, zoom/pan, current layer selection, color counts, and `RiskPanel` badges/coordinates recomputed immediately after each edit through `analyzeBeadRisks`. Keyboard shortcuts: `B` paint, `E` erase, `F` fill, `I` eyedropper, `Cmd/Ctrl+Z` undo, `Cmd/Ctrl+Shift+Z` redo, space-drag pan. Save one `replace_bead_cells` operation per dirty layer in one PATCH batch.

- [ ] **Step 4: Run component tests, typecheck, and production build**

Run:

```bash
pnpm --filter @pindou/web test --run src/features/editor/__tests__/BeadEditor.test.tsx
pnpm --filter @pindou/web typecheck
pnpm --filter @pindou/web build
```

Expected: all commands exit 0; production build contains no runtime dependency on backend-only quantizer code.

- [ ] **Step 5: Commit the bead editor**

```bash
git add apps/web/src/features/editor/components apps/web/src/features/editor/__tests__/BeadEditor.test.tsx
git commit -m "feat(web): add 58 by 58 bead editor"
```

### Task 13: Approve a fully validated draft into an immutable asset version

**Files:**
- Modify: `apps/api/src/pindou_pet/modules/assets/service.py`
- Modify: `apps/api/src/pindou_pet/modules/assets/routes.py`
- Modify: `apps/api/tests/modules/assets/test_service.py`
- Modify: `apps/api/tests/modules/assets/test_routes.py`
- Modify: `apps/api/src/pindou_pet/modules/projects/models.py`
- Modify: `apps/api/src/pindou_pet/modules/projects/schemas.py`
- Modify: `tests/integration/api/test_project_routes.py`
- Modify: `packages/contracts/src/generated.ts`
- Modify: `apps/web/src/features/editor/api/editorApi.ts`
- Modify: `apps/web/src/features/editor/components/BeadEditor.tsx`

**Interfaces:**
- Consumes: Tasks 1–12, current draft revision, all validation gates.
- Produces: `POST /api/v1/projects/{project_id}/draft/approve`, `GET /api/v1/projects/{project_id}/assets/{immutable_version_id}`, and immutable `ApprovedAssetVersionResponse`; Phase 4 consumes only this GET response/version.

- [ ] **Step 1: Write RED approval tests**

```python
def test_approve_creates_immutable_snapshot_and_sets_ready(client, seeded_bead_draft) -> None:
    response = client.post(
        f"/api/v1/projects/{seeded_bead_draft.project_id}/draft/approve",
        json={"revision": seeded_bead_draft.revision},
    )
    assert response.status_code == 201
    body = response.json()
    assert len(body["canonicalAssetHash"]) == 64
    assert get_project(seeded_bead_draft.project_id).status == "READY"
    assert get_project(seeded_bead_draft.project_id).active_asset_version_id == body["immutableVersionId"]


def test_approve_rejects_invalid_or_stale_draft(client, seeded_bead_draft) -> None:
    corrupt_bead_layer(seeded_bead_draft, x=58)
    response = approve(client, seeded_bead_draft.project_id, revision=seeded_bead_draft.revision)
    assert response.status_code == 422
    assert "CELL_OUT_OF_RANGE" in {
        i["code"] for i in response.json()["error"]["details"]["issues"]
    }


def test_approve_rejects_palette_not_equal_to_deployment_freeze(
    client, seeded_bead_draft, tamper_palette_manifest
) -> None:
    tamper_palette_manifest(seeded_bead_draft, source_checksum="0" * 64)
    response = approve(
        client, seeded_bead_draft.project_id, revision=seeded_bead_draft.revision
    )
    assert response.status_code == 422
    assert "DEPLOYMENT_PALETTE_MISMATCH" in {
        issue["code"] for issue in response.json()["error"]["details"]["issues"]
    }


def test_get_approved_asset_is_project_scoped_and_immutable(client, approved_version) -> None:
    response = client.get(
        f"/api/v1/projects/{approved_version.project_id}/assets/{approved_version.id}"
    )
    assert response.status_code == 200
    assert response.json()["canonicalAssetHash"] == approved_version.canonical_asset_hash
    assert client.get(
        f"/api/v1/projects/another-project/assets/{approved_version.id}"
    ).status_code == 404


def test_media_route_serves_only_the_active_approved_asset_after_approval(
    client, approved_version, inactive_approved_version
) -> None:
    active_hash = approved_version.source_layers[0].image_content_hash
    inactive_only_hash = inactive_approved_version.source_layers[0].image_content_hash
    assert client.get(
        f"/api/v1/projects/{approved_version.project_id}/media/{active_hash}"
    ).status_code == 200
    assert client.get(
        f"/api/v1/projects/{approved_version.project_id}/media/{inactive_only_hash}"
    ).status_code == 404
```

Assert duplicate approvals for the exact same canonical hash return the existing immutable version without inserting a second row, and later draft changes cannot alter the stored approved JSON/hash.

- [ ] **Step 2: Run approval tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets/test_service.py apps/api/tests/modules/assets/test_routes.py -q -k approve
```

Expected: FAIL because approval orchestration/route is absent.

- [ ] **Step 3: Implement transactional approval**

In one `BEGIN IMMEDIATE` transaction, first call `require_project_owner_in_transaction(project_id, browser_session_id)`, then:

1. load draft at exact revision;
2. reload `config/palette.freeze.json`, verify its source/license/color checksum, and call `assert_approvable_asset` with that deployment freeze;
3. require successful layer review, exactly five valid neutral-ending actions, completed quantization, and exact non-empty source/bead logical-group correspondence;
4. project only immutable fields;
5. compute `canonical_asset_hash`;
6. insert-or-return immutable version by `(projectId, hash)`;
7. set `active_asset_version_id`, `status=READY`, `currentStep=READY`.

`active_asset_version_id` is the nullable FK added by `0005_assets`; update it in the same approval transaction. Add a claim-vs-approve race test: approval may precede claim or return 404, never commit from the old owner afterward. Extend the existing project-media authorizer so only hashes referenced by the current draft or the active approved asset are streamable; an inactive historical version, unrelated project, or unreferenced hash remains 404. Regenerate `ProjectResponse` so `GET /api/v1/projects/{projectId}` returns `activeAssetVersionId`, and add a refresh test proving room/export can recover the version from that response without URL-only state. Return `201` for first creation and `200` for an idempotent repeat. Add one signed-session-scoped GET route for the immutable version; do not add PATCH/PUT/DELETE-by-version routes that could mutate approved JSON.

- [ ] **Step 4: Wire the UI approval action and run the full Phase 3 suite**

Regenerate the approval/approved-GET client contracts, implement `approveDraft` and `getApprovedAsset`, and keep Phase 2's reusable `ProjectHandoffButton` visible in the approval-success panel so the desktop owner can transfer the now-READY project back to the original mobile browser. The component requests a fresh token only on an explicit click and never persists the raw link. Then run:

```bash
make contracts
.venv/bin/python -m pytest apps/api/tests/modules/assets -q
pnpm --filter @pindou/web test --run src/features/editor
pnpm contracts:check
pnpm --filter @pindou/web typecheck
```

Expected: all suites PASS; approve navigates to `/projects/{projectId}/room` using the returned immutable version ID.

- [ ] **Step 5: Commit immutable approval**

```bash
git add apps/api/src/pindou_pet/modules/assets apps/api/tests/modules/assets apps/api/src/pindou_pet/modules/projects/models.py apps/api/src/pindou_pet/modules/projects/schemas.py tests/integration/api/test_project_routes.py packages/contracts apps/web/src/features/editor
git commit -m "feat(assets): approve immutable bead pet versions"
```

### Task 14: Add the desktop editor end-to-end gate and perform Phase 3 verification

**Files:**
- Create: `apps/web/e2e/editor.spec.ts`
- Create: `apps/web/e2e/global-setup.ts`
- Create: `apps/web/e2e/global-teardown.ts`
- Modify: `apps/api/src/pindou_pet/main.py`
- Create: `apps/api/tests/fakes/perception_bundle.py`
- Create: `tests/e2e/__init__.py`
- Create: `tests/e2e/seed_project.py`
- Create: `tests/e2e/server.py`
- Modify: `apps/web/playwright.config.ts`

**Interfaces:**
- Consumes: completed Phase 3 API/Web implementation and deterministic seeded draft fixture.
- Produces: one executable acceptance gate covering layer correction → quantization → bead edit → immutable approval.

- [ ] **Step 1: Write the failing Playwright path**

```ts
test("corrects layers, quantizes, edits a bead, and approves", async ({ page }) => {
  await seedLayerReviewDraft(page, "editor-main-path");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/projects/editor-main-path/edit?tab=layers");
  await moveJoint(page, "尾根", { x: 42, y: 35 });
  await page.getByRole("button", { name: "保存校正" }).click();
  await checkThreeReviewGates(page);
  await page.getByRole("button", { name: "进入拼豆化" }).click();
  await expect(page).toHaveURL(/tab=beads/);
  await paintBead(page, { x: 28, y: 29 }, "W01");
  await page.getByRole("button", { name: "保存拼豆修改" }).click();
  await page.getByRole("button", { name: "批准角色" }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/room$/);
});
```

- [ ] **Step 2: Run E2E and confirm RED before final wiring**

Run:

```bash
pnpm --filter @pindou/web test:e2e -- editor.spec.ts
```

Expected: FAIL at the first missing selector/route transition, proving the path exercises the real UI.

- [ ] **Step 3: Make only the route/test-fixture wiring needed for GREEN**

Add a test-process-only seeding CLI in `tests/e2e/seed_project.py`. Playwright global setup creates a private temporary SQLite/storage root, generates one test session secret, runs migrations, invokes the seeder before the API starts, and launches `tests.e2e.server:app` on `127.0.0.1:8000`; global teardown terminates the child and removes the temporary root. The seeder creates the owning `BrowserSession`, signs its cookie with that same secret, and writes a Playwright `storageState` file under the ignored temporary root with mode `0600`; global setup loads that state, so the real ownership dependency succeeds instead of returning 404.

Extend the application factory now—not later—with explicit `ServiceOverrides | None`. Production always passes `None` and runs the frozen startup preflight. The E2E composition root passes committed deterministic generation/perception fakes through that interface, so a clean checkout needs no ignored ONNX files or Provider credential while routes, signed-session ownership, repositories and editor services remain real. There is no environment-name branch, HTTP fixture/control route or production import of test modules.

Freeze `apps/web/playwright.config.ts` with `baseURL: "http://127.0.0.1:4173"`, the global setup/teardown paths, a `storageState` path resolved to ignored `var/e2e/current/owner-storage-state.json`, and one Vite `webServer` command on port 4173. The path is fixed in config but the file is created with mode `0600` during global setup before any browser context opens and deleted in teardown. Vite's Phase 0 `/api` proxy targets the E2E Uvicorn process, so `page.goto("/")`, relative `/api/v1` requests and the HttpOnly session cookie are all same-origin from the browser's perspective. The config must wait for both the Vite root and API health before tests begin; it must not assume either process was already running.

- [ ] **Step 4: Run complete verification and inspect changed-file scope**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/modules/assets -q
pnpm --filter @pindou/web test --run src/features/editor
pnpm --filter @pindou/web test:e2e -- editor.spec.ts
pnpm contracts:check
pnpm --filter @pindou/web typecheck
pnpm --filter @pindou/web build
git diff --check
```

Expected: every command exits 0; Playwright passes at `1280×800`; `git diff --check` prints nothing.

- [ ] **Step 5: Commit the Phase 3 acceptance gate**

```bash
git add apps/web/e2e/editor.spec.ts apps/web/e2e/global-setup.ts \
  apps/web/e2e/global-teardown.ts apps/web/playwright.config.ts \
  apps/api/src/pindou_pet/main.py apps/api/tests/fakes/perception_bundle.py \
  tests/e2e/__init__.py tests/e2e/server.py tests/e2e/seed_project.py
git commit -m "test(e2e): verify bead pet editing and approval"
```

## Phase 3 self-review checklist

- [ ] Shape confirmation starts one globally leased, local-only `LAYER_GENERATION`; checkpoint recovery yields six nonempty source groups, local closed eyes/patches, rig/default tracks, and zero Provider/part-regeneration usage.
- [ ] Every canonical field consumed by Phase 4 is defined in `models.py`, not inferred from Konva.
- [ ] `nodeId/parentNodeId` and pivots remain continuous from SourceLayer through BeadLayer; every `targetNodeId` resolves before review and after approval.
- [ ] Layer-review validation accepts empty bead layers; approval requires one-to-one non-empty source/bead groups, matching `physicalExport`, exactly five validated neutral-ending actions, and the deployment palette checksum.
- [ ] Required physical groups, auxiliary-layer exclusion, parents, variant neutral state, z-order, cells, colors, and neutral transforms have explicit failing tests.
- [ ] A two-tab stale revision test proves no silent overwrite.
- [ ] Quantization is deterministic, global, no-dither, max 32 colors, D65/CIEDE2000 with ascending-ID tie-break.
- [ ] Palette selection has an auditable decision, pinned source/file/commit/license/peg pitch, a verified checksum, and no code-level brand literal.
- [ ] PART_REGENERATION is server-owned, limited to two, writes source hashes/revision atomically, and records Provider wait outside correction time.
- [ ] Correction time is server-derived from first valid draft GET to three-gate completion minus server Provider-wait intervals; no client duration is authoritative.
- [ ] White bead and transparency are distinct in backend and frontend tests.
- [ ] All six editing tools/history behaviors and the shared-golden immediate risk preview are covered, including four-neighbor fill and redo invalidation.
- [ ] Approved JSON is immutable and its hash changes for palette, source, bead, or animation changes.
- [ ] 占位词扫描无命中，所有实现步骤均给出精确文件、接口、测试命令和预期结果。
