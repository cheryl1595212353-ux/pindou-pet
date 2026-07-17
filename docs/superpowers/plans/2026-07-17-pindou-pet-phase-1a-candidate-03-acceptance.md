# Phase 1A Candidate 03 Acceptance Amendment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 记录用户对 `candidate-03` 细颗粒方形像素风的明确接受，在不放宽身份、构图、拼豆／体素禁令和真实 alpha 要求的前提下，只执行一次背景透明化修复并完成最终视觉门禁。

**Architecture:** 先以测试和书面规格把“由较大色块主导、可叠加受控单格方形像素纹理”的修订合同冻结下来，再保留旧评审并按新合同把 `candidate-03` 重审为仅背景待修复的风格预览。随后使用 built-in `image_gen` 执行唯一一次 `background-extraction` 编辑；通过真实 alpha 和独立像素保持审查后，继续复用现有最近邻预览和 manifest 工具。

**Tech Stack:** Markdown、Python 3.12、pytest、Ruff、Pillow；Codex 子 agent、built-in `image_gen`、本地 `view_image`；现有 `tools/visual_prototype.py`。

## Global Constraints

- 用户原话 `修改规格并接受 03` 是本修订的选择依据；选中原始文件固定为 `reviews/candidate-call-03.png`，SHA-256 固定为 `b9966dd94dcbf29ec1cbd11beba308b7397dc3a3cc11fea547e82c4ffc9333fa`。
- 视觉主体仍必须由朝向屏幕、对齐同一二维栅格的方形像素组成；格子之间没有实体间隙、孔洞或独立透视旋转。
- 2.5D 形体仍由有限色阶的连贯大色块主导；允许像 `candidate-03` 一样在毛色区域叠加受控的单格方形像素明暗纹理，只要它保持屏幕对齐、没有平滑抗锯齿，且不破坏较大色块的可读性。
- 仍禁止随机彩色散点抖动、连续摄影渐变、真实毛发、平滑矢量边缘、圆形拼豆、豆孔、塑料管、底板、立方体、积木和 Minecraft／voxel 雕塑。
- 身份、解剖方向和构图不变：白色主毛色、绿色眼睛、猫自身左眼橘斑、猫自身右耳黑斑、背部橘黑斑、橘黑环纹深色尾尖；脸朝用户，身体向画面右侧约 20°，尾巴在画面右侧，完整角色不裁切。
- 本次用户选择只解决 `candidate-03` 的风格判定，不解决其 RGB 棋盘格背景；在真实 alpha 通过前，它只能是 `repairable-background preview`，不能进入 `candidates/` 或 `selected/`。
- 旧 `candidate-03-consistency.json` 必须先复制为 `candidate-03-consistency.pre-user-amendment.json`；不得删除或覆盖旧生成图、旧评审报告或旧运行目录。
- 首轮三次造型调用已经用完；没有第四个候选。用户选择后只允许一次 built-in `background-extraction` 编辑，失败后不得重试或使用 CLI/API Key。
- 背景修复只能移除背景并建立真实 alpha；必须保留猫的画布尺寸、位置、轮廓、所有可见方形像素、颜色、花纹、构图和身份。任何重画、平滑、漂移、裁切或 alpha 失败都产生 `STOP_REVISE_STYLE`。
- `preview-58.png` 与 `preview-464.png` 只使用最近邻；它们仍标记为 `PIXEL_ART_VISUAL_PROXY`，不声称已经完成分层 sprite sheet 或动画。
- 最终 PASS 仍只能由用户在看到修复后的高清图和两个预览后明确返回 `VISUAL_PROTOTYPE_PASS`；选择原始 03 不等于最终 PASS。
- 不新增 Web/API 路由、Provider adapter、付费 API、动画、分层、骨骼或三维模型；`tools/visual_prototype.py` 保持不变。

## Exact Files

- Create and commit with this plan: `docs/superpowers/plans/2026-07-17-pindou-pet-phase-1a-candidate-03-acceptance.md`
- Modify: `docs/superpowers/specs/2026-07-17-pindou-pet-phase-1a-pixel-art-revision-design.md`
- Modify: `docs/superpowers/plans/2026-07-17-pindou-pet-phase-1a-pixel-art-revision.md`
- Modify: `experiments/codex_visual_prototype/prompts/character-candidates.md`
- Modify: `experiments/codex_visual_prototype/reviews/pixel-character-consistency.example.json`
- Modify: `tests/unit/tools/test_visual_prototype.py`
- Private only: `var/phase-1a/synthetic-cat-01-pixel-v2/**`
- Preserve unchanged: `tools/visual_prototype.py`, all Web/API files, old `var/phase-1a/synthetic-cat-01/**`

---

### Task 1: Freeze the user-approved Candidate 03 microtexture amendment

**Files:**
- Modify: `docs/superpowers/specs/2026-07-17-pindou-pet-phase-1a-pixel-art-revision-design.md`
- Modify: `docs/superpowers/plans/2026-07-17-pindou-pet-phase-1a-pixel-art-revision.md`
- Modify: `experiments/codex_visual_prototype/prompts/character-candidates.md`
- Modify: `experiments/codex_visual_prototype/reviews/pixel-character-consistency.example.json`
- Modify: `tests/unit/tools/test_visual_prototype.py`
- Read: `docs/superpowers/plans/2026-07-17-pindou-pet-phase-1a-candidate-03-acceptance.md` (committed planning input)

**Interfaces:**
- Consumes: the user's explicit `修改规格并接受 03` decision and the immutable raw Candidate 03 hash.
- Produces: one committed, tested visual contract under which controlled screen-aligned single-cell texture is allowed but false alpha, smooth fur, random speckle, beads and voxels still fail.
- Failure: an unconditional dithering ban remains, alpha is accidentally relaxed, the selected raw hash is omitted, or unrelated runtime files change.

- [ ] **Step 1: Add the two failing contract tests**

Append this test after `test_character_prompt_freezes_the_2p5d_square_pixel_contract`:

```python
def test_character_prompt_allows_the_user_approved_candidate_03_microtexture() -> None:
    prompt = (EXPERIMENT / "prompts" / "character-candidates.md").read_text()
    normalized_prompt = " ".join(prompt.lower().split())

    assert (
        "controlled fine single-cell square-pixel tonal accents may appear across "
        "the coat" in normalized_prompt
    )
    assert "larger color clusters remain readable" in normalized_prompt
    assert "random color-speckle dithering" in normalized_prompt
    assert "dithering noise" not in normalized_prompt
```

Add this assertion to `test_pixel_character_review_example_has_no_ambiguous_pass`:

```python
    assert (
        "controlled fine square-pixel texture is allowed" in review["notes"].lower()
    )
```

- [ ] **Step 2: Run the focused tests to verify RED**

Run:

```bash
.venv/bin/python -m pytest tests/unit/tools/test_visual_prototype.py -q
```

Expected: `2 failed, 18 passed`. The new prompt test fails because the old contract bans all dithering noise, and the review-example test fails because its notes do not state the revised interpretation.

- [ ] **Step 3: Replace the prompt shading and exclusion paragraphs exactly**

Keep the identity and pose paragraphs unchanged. Replace the third and fourth paragraphs of `experiments/codex_visual_prototype/prompts/character-candidates.md` with:

```text
Render the character on one screen-aligned 2D raster grid. Build the silhouette,
features, and markings from flat square pixels with no gaps, holes, individual
perspective rotation, or physical depth between cells. Use hard stair-stepped
edges and coherent color clusters. Create slight 2.5D volume primarily through
limited-palette clustered highlights and shadows across larger forms. Controlled
fine single-cell square-pixel tonal accents may appear across the coat as a
secondary surface treatment, provided every mark stays screen-aligned and the
larger color clusters remain readable. Do not bevel, extrude, light, or texture
each pixel as a separate physical object.

Absolutely no fuse beads, perler beads, round pellets, bead holes, plastic
tubes, pegboards, mosaic tiles, raised cubes, Lego, Minecraft, voxel sculpture,
3D model, smooth vector edges, photorealistic fur, antialiased fur fringe,
continuous photographic gradients, random color-speckle dithering, floating
pixels, branding, or background shadow. Output a PNG with real alpha
transparency; a white, solid-color, checkerboard, or simulated transparent
background is invalid.
```

- [ ] **Step 4: Update the review example note exactly**

Set the `notes` value in `pixel-character-consistency.example.json` to:

```json
"The candidate preserves identity on one flat square-pixel grid; controlled fine square-pixel texture is allowed when larger color clusters remain readable."
```

All keys, booleans, schema version and the empty violations list remain unchanged.

- [ ] **Step 5: Amend the written design specification**

Change the status line to:

```text
状态：已由用户修订；Candidate 03 细颗粒方形像素风于 2026-07-17 获得明确接受
```

After the revision-reason paragraphs, add:

```markdown
### 1.1 Candidate 03 用户修订

用户在看到三张像素候选及两层审查结论后明确回复“修改规格并接受 03”。本修订
只改变细颗粒方形像素纹理的容许范围：`candidate-call-03.png`（SHA-256
`b9966dd94dcbf29ec1cbd11beba308b7397dc3a3cc11fea547e82c4ffc9333fa`）的屏幕对齐
单格明暗纹理由用户接受。它的 RGB 棋盘格背景仍不合格，因此该回复是风格选择和
一次背景修复授权，不是最终 `VISUAL_PROTOTYPE_PASS`。
```

In section 6.1, replace the two bullets about large-form shading and small pixels with:

```markdown
- 用有限色阶的连贯大色块作为形体和 2.5D 明暗的主体；允许在毛色区域叠加受控的
  单格方形像素明暗纹理，只要所有纹理仍对齐屏幕栅格、没有平滑抗锯齿，并且较大
  色块和主要花纹仍清晰可读。
- 眼睛、鼻子、耳缘、尾尖和毛色区域可使用较小像素组；细颗粒纹理本身不构成失败，
  但不得变成随机彩色散点、连续摄影渐变、真实毛发或平滑插画。
```

In section 6.2, replace `漂浮像素、随机抖动、过密噪点` with:

```text
漂浮像素、随机彩色散点抖动、破坏大色块可读性的无结构噪点
```

In section 10, add this acceptance bullet immediately after the square-pixel bullet:

```markdown
- 受控的单格方形像素明暗纹理可以作为次级表面处理；只要大色块仍主导形体，不能
  因为存在这种细颗粒纹理而单独判定 Candidate 03 风格失败；
```

- [ ] **Step 6: Mark the original execution plan as amended**

After the title of `2026-07-17-pindou-pet-phase-1a-pixel-art-revision.md`, add:

```markdown
> **Amendment:** Tasks 1–3 were executed under the original clustered-shading
> contract. After the user explicitly replied `修改规格并接受 03`, the style
> interpretation and Tasks 4–5 are governed by
> `2026-07-17-pindou-pet-phase-1a-candidate-03-acceptance.md`. All identity,
> alpha, one-correction, preview and final-user-gate constraints remain binding.
```

- [ ] **Step 7: Run GREEN, the full baseline, and commit**

Run:

```bash
.venv/bin/python -m pytest tests/unit/tools/test_visual_prototype.py -q
.venv/bin/python -m ruff check tests/unit/tools/test_visual_prototype.py
make check
git diff --check
```

Expected: focused tests `20 passed`; full Python suite `41 passed, 1 skipped`; Ruff, contracts, Web tests, typecheck, build, and diff check exit 0.

Commit exactly the five changed tracked files:

```bash
git add docs/superpowers/specs/2026-07-17-pindou-pet-phase-1a-pixel-art-revision-design.md \
  docs/superpowers/plans/2026-07-17-pindou-pet-phase-1a-pixel-art-revision.md \
  experiments/codex_visual_prototype/prompts/character-candidates.md \
  experiments/codex_visual_prototype/reviews/pixel-character-consistency.example.json \
  tests/unit/tools/test_visual_prototype.py
git commit -m "feat: accept candidate 03 pixel microtexture"
```

---

### Task 2: Preserve the old verdict and reclassify Candidate 03

**Files:**
- Private preserve: `var/phase-1a/synthetic-cat-01-pixel-v2/reviews/candidate-03-consistency.pre-user-amendment.json`
- Private replace: `var/phase-1a/synthetic-cat-01-pixel-v2/reviews/candidate-03-consistency.json`
- Private create: `var/phase-1a/synthetic-cat-01-pixel-v2/reviews/user-selection.json`

**Interfaces:**
- Consumes: the committed amended contract, raw Candidate 03, its pre-amendment review, and the user's exact decision.
- Produces: auditable evidence that Candidate 03 is style-valid but alpha-invalid and is selected for the one allowed background repair.
- Failure: the old review is lost, the raw hash differs, any style flag other than alpha remains false, or Candidate 03 is prematurely copied into `candidates/` or `selected/`.

- [ ] **Step 1: Refuse overwrite and preserve the prior verdict**

Run:

```bash
test ! -e var/phase-1a/synthetic-cat-01-pixel-v2/reviews/candidate-03-consistency.pre-user-amendment.json
cp var/phase-1a/synthetic-cat-01-pixel-v2/reviews/candidate-03-consistency.json \
  var/phase-1a/synthetic-cat-01-pixel-v2/reviews/candidate-03-consistency.pre-user-amendment.json
```

Verify the preserved file still has `limitedBlockShading: false`, `stylePass: false`, `alphaValid: false`, and `pass: false`.

- [ ] **Step 2: Dispatch a fresh revised-style reviewer**

The reviewer must inspect Candidate 03, all three identity references, the amended prompt/schema/spec, and the mechanical alpha result. It must write the replacement `candidate-03-consistency.json` with exactly:

```json
{
  "alphaValid": false,
  "fullBodyVisible": true,
  "limitedBlockShading": true,
  "markingsStable": true,
  "noBeadOrVoxelMaterials": true,
  "noExtraLimbs": true,
  "notes": "Under the user-amended contract, Candidate 03's controlled screen-aligned fine square-pixel texture is allowed and larger color clusters remain readable; only the rendered checkerboard background remains invalid.",
  "pass": false,
  "poseCorrect": true,
  "sameIdentity": true,
  "schemaVersion": 1,
  "squarePixelGrid": true,
  "stylePass": true,
  "violations": [
    "Missing real alpha: the RGB PNG visibly renders a checkerboard background."
  ]
}
```

- [ ] **Step 3: Record the exact user selection**

Create `reviews/user-selection.json` exactly:

```json
{
  "candidateId": "candidate-03",
  "correctionCountBeforeSelection": 0,
  "decision": "SELECT_REPAIRABLE_BACKGROUND",
  "rawSha256": "b9966dd94dcbf29ec1cbd11beba308b7397dc3a3cc11fea547e82c4ffc9333fa",
  "schemaVersion": 1,
  "styleContract": "candidate-03-controlled-square-pixel-microtexture",
  "userStatement": "修改规格并接受 03"
}
```

- [ ] **Step 4: Verify the revised classification and isolation**

Parse both review files and the selection JSON. Assert the old and new style flags differ only as authorized, the new `stylePass` is true, `alphaValid` and `pass` remain false, the only new violation is alpha, and the raw hash matches. Confirm `candidates/` and `selected/` are still empty, Git status is clean, and `git ls-files var/phase-1a` is empty. Task 2 makes no Git commit.

---

### Task 3: Apply the one allowed background correction and review it

**Files:**
- Private create: `var/phase-1a/synthetic-cat-01-pixel-v2/prompts/correction.md`
- Private create: `var/phase-1a/synthetic-cat-01-pixel-v2/reviews/correction-call.png`
- Private create: `var/phase-1a/synthetic-cat-01-pixel-v2/reviews/final-character-consistency.json`
- Private conditional: `var/phase-1a/synthetic-cat-01-pixel-v2/candidates/candidate-03.png`
- Private conditional: `var/phase-1a/synthetic-cat-01-pixel-v2/selected/character-hd.png`

**Interfaces:**
- Consumes: the exact raw Candidate 03, three accepted reference crops, and the user's repairable-background selection.
- Produces: either one alpha-valid, pixel-preserved final character or a terminal STOP decision.
- Failure: a second edit, a CLI/API-key call, false alpha, changed canvas/identity/pixels/style, or an overwrite of existing evidence.

- [ ] **Step 1: Write the exact correction prompt**

Create `prompts/correction.md` exactly:

```text
Use case: background-extraction
Input image 1 is the candidate-03 edit target. Input images 2, 3, and 4 are
identity references only.

Change only the background: remove every background pixel and return a PNG with
real alpha transparency. Preserve every visible square pixel of the cat exactly,
including its grid alignment, colors, hard stair-step outline, clustered 2.5D
shading, controlled fine square-pixel texture, face, green eyes,
anatomical-left-eye orange patch, anatomical-right-ear black patch, orange-and-
black back markings, pose, paws, and ringed tail.

Do not redraw, smooth, antialias, recolor, reshape, relight, crop, add pixels,
remove cat pixels, add shadows, add a checkerboard, or change the pixel-art style.
```

- [ ] **Step 2: Dispatch exactly one built-in background-extraction edit**

The edit subagent must read the complete `imagegen` skill and use built-in mode only. It first loads the raw Candidate 03 with `view_image`, then calls `image_gen` exactly once using the exact correction prompt and `referenced_image_paths` in this order:

```text
reviews/candidate-call-03.png
references/front.png
references/cat-left-front-45.png
references/cat-right-front-45.png
```

Omit `num_last_images_to_include`. Save the unmodified returned file first as `reviews/correction-call.png`. A failed or malformed result consumes the one correction; no retry is legal.

- [ ] **Step 3: Run the mechanical alpha gate**

Run:

```bash
.venv/bin/python tools/visual_prototype.py check \
  var/phase-1a/synthetic-cat-01-pixel-v2/reviews/correction-call.png --require-alpha
```

Exit 0 is necessary but not sufficient. Record dimensions, mode and SHA-256. Any nonzero exit records STOP and skips promotion/preview.

- [ ] **Step 4: Dispatch an independent pixel-preservation reviewer**

The reviewer compares the raw Candidate 03 and corrected image at original detail with all references. It verifies same canvas and placement; unchanged silhouette, square-grid rhythm, visible cat pixels, colors, face, markings, pose, paws and tail; no smoothing/redraw; and real alpha with no checkerboard. It writes `final-character-consistency.json` using the committed schema. Every style flag, `alphaValid`, `stylePass`, `pass`, and empty `violations` must be true/empty before promotion.

- [ ] **Step 5: Promote only an independently approved correction**

If and only if Step 4 passes, copy the unchanged correction bytes to both:

```bash
cp var/phase-1a/synthetic-cat-01-pixel-v2/reviews/correction-call.png \
  var/phase-1a/synthetic-cat-01-pixel-v2/candidates/candidate-03.png
cp var/phase-1a/synthetic-cat-01-pixel-v2/reviews/correction-call.png \
  var/phase-1a/synthetic-cat-01-pixel-v2/selected/character-hd.png
```

Run the alpha check on both destinations and prove all three SHA-256 values are identical. Task 3 makes no Git commit.

---

### Task 4: Render previews and obtain the final user gate

**Files:**
- Private create: `var/phase-1a/synthetic-cat-01-pixel-v2/selected/preview-58.png`
- Private create: `var/phase-1a/synthetic-cat-01-pixel-v2/selected/preview-464.png`

**Interfaces:**
- Consumes: an independently approved `selected/character-hd.png`.
- Produces: deterministic nearest-neighbor previews and the user's final PASS or STOP decision.
- Failure: missing alpha, wrong dimensions, non-nearest-neighbor output, or no explicit final user decision.

- [ ] **Step 1: Render and verify deterministic previews**

Run:

```bash
.venv/bin/python tools/visual_prototype.py preview \
  var/phase-1a/synthetic-cat-01-pixel-v2/selected/character-hd.png \
  var/phase-1a/synthetic-cat-01-pixel-v2/selected
.venv/bin/python tools/visual_prototype.py check \
  var/phase-1a/synthetic-cat-01-pixel-v2/selected/preview-58.png --require-alpha
.venv/bin/python tools/visual_prototype.py check \
  var/phase-1a/synthetic-cat-01-pixel-v2/selected/preview-464.png --require-alpha
```

Expected: 58×58 and 464×464 true-alpha PNGs; the existing validator proves the latter is the exact 8× nearest-neighbor image.

- [ ] **Step 2: Present the blocking final visual gate**

Show the raw Candidate 03, `character-hd.png`, `preview-58.png`, and `preview-464.png`. Ask the user to return exactly one of:

```text
VISUAL_PROTOTYPE_PASS
STOP_REVISE_STYLE
```

Do not construct a PASS manifest before explicit `VISUAL_PROTOTYPE_PASS`.

---

### Task 5: Record the final decision and finish the branch

**Files:**
- Private create: `var/phase-1a/synthetic-cat-01-pixel-v2/manifest.json`
- No further tracked implementation files unless a reviewer requires a fix

**Interfaces:**
- Consumes: the explicit final decision, Candidate 03 selection, correction count 1, accepted reference evidence, final character and previews.
- Produces: one verified private manifest and a clean branch approved by broad review.
- Failure: manifest verification, full checks, Git isolation, broad review, or branch-finishing gate fails.

- [ ] **Step 1: Build the manifest for the actual decision**

For explicit PASS, run:

```bash
.venv/bin/python tools/visual_prototype.py manifest \
  var/phase-1a/synthetic-cat-01-pixel-v2 --master-attempts 3 \
  --decision VISUAL_PROTOTYPE_PASS --selected candidate-03 --approved \
  --correction-count 1
```

For correction failure or explicit STOP, omit `--selected` and `--approved`:

```bash
.venv/bin/python tools/visual_prototype.py manifest \
  var/phase-1a/synthetic-cat-01-pixel-v2 --master-attempts 3 \
  --decision STOP_REVISE_STYLE --correction-count 1
```

- [ ] **Step 2: Verify manifest safety and the full repository**

Run the existing manifest verifier, assert schema version 1 and absence of `/Users/`, `data:image`, `api_key`, or `token`, then run:

```bash
make check
git diff --check
git status --short --branch
git ls-files var/phase-1a
```

Expected after Task 1: Python `41 passed, 1 skipped`; all other gates green; no `var/` path tracked or shown.

- [ ] **Step 3: Perform the broad whole-branch review and finish**

Generate a review package from the branch merge base through HEAD. Give the final `gpt-5.6-sol` reviewer the approved original spec, this amendment plan, the amended original plan, the progress ledger, the full tracked diff, the two historical built-in-payload reconstruction limitations, and all task-review outcomes. Fix every Critical or Important finding and re-review. Then use `superpowers:finishing-a-development-branch`; do not claim completion until the selected finishing action succeeds.
