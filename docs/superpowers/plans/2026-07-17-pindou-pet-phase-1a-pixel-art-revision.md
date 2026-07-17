# Phase 1A 2.5D Pixel-Art Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 复用已通过的合成三花猫三视图，在不使用用户 API Key 的前提下生成、审查并由用户批准一个真正由二维方形像素组成的静态 2.5D 像素宠物原型。

**Architecture:** 先以测试冻结新的像素风提示词和风格审查 schema，再把已通过的身份与参考证据复制到独立的 `synthetic-cat-01-pixel-v2` 私有运行目录。Codex 子 agent 最多生成三个候选；机械 alpha 检查、独立像素风审查和用户选择分层进行，最终继续复用现有 Pillow 预览和 manifest 工具。

**Tech Stack:** Python 3.12、Pillow、pytest、Ruff；Codex 子 agent、built-in `image_gen`、本地 `view_image`；现有 `tools/visual_prototype.py`。

## Global Constraints

- 视觉主体必须由朝向屏幕、对齐同一二维栅格的方形像素组成；格子之间没有实体间隙、孔洞或独立透视旋转。
- 2.5D 体积只来自有限色阶的整片块面明暗；不得为每个像素增加凸起、倒角或独立材质。
- 禁止圆形拼豆、豆孔、塑料管、底板、实体拼豆、立方体、积木、Minecraft／voxel 雕塑、真实毛发和平滑矢量效果。
- 身份优先：白色主毛色、绿色眼睛、猫自身左眼橘斑、猫自身右耳黑斑、背部橘黑斑和橘黑环纹深色尾尖必须稳定。
- 固定构图：脸朝用户，身体向画面右侧约 20°，尾巴位于画面右侧，完整角色居中且不裁切。
- 不使用用户 API Key，不新增 Web/API 路由或 Provider adapter，不重做身份卡和三视图。
- 新运行只写入被 Git 忽略的 `var/phase-1a/synthetic-cat-01-pixel-v2/`；不得覆盖或删除旧 `synthetic-cat-01/` 拼豆失败证据。
- 首轮最多三个造型调用；没有第四个候选。用户选择后最多一轮文字校正。
- 真正 alpha PNG 才能成为有效候选；仅背景失败但像素风通过的图片只能标记为“待背景修复的风格预览”。
- 背景修复只能改变背景并建立真实 alpha，必须保留所有可见像素、颜色、轮廓、构图和身份；失败后不得二次修复。
- `preview-58.png` 和 `preview-464.png` 只使用最近邻；标记为 `PIXEL_ART_VISUAL_PROXY`，不声称已完成分层 sprite sheet 或动画。
- 自动检查只证明文件合同；“像同一只猫”“是真正像素画”和最终 PASS 必须由用户判断。

## Exact Files

- Modify: `docs/superpowers/specs/2026-07-17-pindou-pet-phase-1a-pixel-art-revision-design.md`
- Modify: `experiments/codex_visual_prototype/README.md`
- Modify: `experiments/codex_visual_prototype/prompts/character-candidates.md`
- Create: `experiments/codex_visual_prototype/reviews/pixel-character-consistency.example.json`
- Modify: `tests/unit/tools/test_visual_prototype.py`
- Private only: `var/phase-1a/synthetic-cat-01-pixel-v2/**`
- Preserve unchanged: `tools/visual_prototype.py`

---

### Task 1: Freeze the 2.5D pixel-art prompt and review contract

**Files:**
- Modify: `experiments/codex_visual_prototype/prompts/character-candidates.md`
- Create: `experiments/codex_visual_prototype/reviews/pixel-character-consistency.example.json`
- Modify: `experiments/codex_visual_prototype/README.md`
- Modify: `tests/unit/tools/test_visual_prototype.py`

**Interfaces:**
- Produces: one committed common pixel-character prompt and one auditable style-review schema.
- Consumes later: Task 2 copies the common prompt and appends exactly one approved candidate suffix.
- Failure: old positive fuse-bead wording, missing 2D-grid constraints, missing negative material constraints, or ambiguous style PASS fails before any image call.

- [ ] **Step 1: Replace the character-template tests and add the style-review test**

Replace `test_character_prompt_requires_identity_and_real_alpha` with:

```python
def test_character_prompt_freezes_the_2p5d_square_pixel_contract() -> None:
    prompt = (EXPERIMENT / "prompts" / "character-candidates.md").read_text()
    normalized_prompt = " ".join(prompt.lower().split())

    assert "identity preservation is the highest priority" in normalized_prompt
    assert "static 2.5d pixel-art game sprite" in normalized_prompt
    assert "one screen-aligned 2d raster grid" in normalized_prompt
    assert "flat square pixels with no gaps, holes" in normalized_prompt
    assert "limited-palette clustered highlights and shadows" in normalized_prompt
    assert "real alpha transparency" in normalized_prompt
    assert "torso is angled about 20 degrees toward image" in normalized_prompt
    assert "tail on image right" in normalized_prompt
    assert "pixel_art_visual_proxy" in normalized_prompt
    assert "static 2.5d fuse-bead character" not in normalized_prompt
    assert "plastic fuse-bead units" not in normalized_prompt
```

Replace `test_readme_limits_pass_to_the_visual_prototype` with:

```python
def test_readme_separates_the_rejected_bead_run_from_pixel_v2() -> None:
    readme = (EXPERIMENT / "README.md").read_text()
    normalized_readme = " ".join(readme.lower().split())

    assert "var/phase-1a/synthetic-cat-01/" in normalized_readme
    assert "rejected fuse-bead experiment" in normalized_readme
    assert "var/phase-1a/synthetic-cat-01-pixel-v2/" in normalized_readme
    assert "active 2.5d pixel-art revision" in normalized_readme
    assert (
        "a pass here proves only a human-in-the-loop visual prototype; it does not "
        "qualify real pets, a production provider, latency, cost, or the web "
        "generation path." in normalized_readme
    )
```

Append:

```python
def test_pixel_character_review_example_has_no_ambiguous_pass() -> None:
    review = json.loads(
        (
            EXPERIMENT
            / "reviews"
            / "pixel-character-consistency.example.json"
        ).read_text()
    )

    style_flags = {
        "sameIdentity",
        "markingsStable",
        "poseCorrect",
        "squarePixelGrid",
        "limitedBlockShading",
        "noBeadOrVoxelMaterials",
        "fullBodyVisible",
        "noExtraLimbs",
    }
    assert style_flags.issubset(review)
    assert review["stylePass"] is True
    assert all(review[key] is True for key in style_flags)
    assert review["alphaValid"] is True
    assert review["pass"] is True
    assert review["violations"] == []
```

- [ ] **Step 2: Run the focused tests to verify RED**

Run:

```bash
.venv/bin/python -m pytest tests/unit/tools/test_visual_prototype.py -q
```

Expected: 3 failures and 16 passes. The old prompt lacks the pixel-grid strings, the README lacks the run split, and the pixel review example does not exist.

- [ ] **Step 3: Replace the common character prompt with the exact pixel-art prompt**

Set `experiments/codex_visual_prototype/prompts/character-candidates.md` to:

```text
Use all three supplied reference views as one identity set. Create the same cat
as a centered, full-body, static 2.5D pixel-art game sprite. Identity
preservation is the highest priority; style must not replace the cat's face
shape, green eyes, white base coat, anatomical-left-eye orange patch,
anatomical-right-ear black patch, coherent back patches, or orange-and-black
ringed tail with a dark tip.

The head faces the viewer. The torso is angled about 20 degrees toward image
right, with the tail on image right. Keep both ears, all visible paws, the body,
and the entire tail inside the canvas. Keep natural cat proportions with only
slight cute simplification. Do not add accessories, expressions, props, text,
logos, scenery, or extra limbs.

Render the character on one screen-aligned 2D raster grid. Build the silhouette,
features, and markings from flat square pixels with no gaps, holes, individual
perspective rotation, or physical depth between cells. Use hard stair-stepped
edges and coherent color clusters. Create slight 2.5D volume only through
limited-palette clustered highlights and shadows across larger forms; do not
bevel, extrude, light, or texture each pixel as a separate object.

Absolutely no fuse beads, perler beads, round pellets, bead holes, plastic
tubes, pegboards, mosaic tiles, raised cubes, Lego, Minecraft, voxel sculpture,
3D model, smooth vector edges, photorealistic fur, antialiased fur fringe,
dithering noise, floating pixels, branding, or background shadow. Output a PNG
with real alpha transparency; a white, solid-color, checkerboard, or simulated
transparent background is invalid.

The later 58x58 image is a PIXEL_ART_VISUAL_PROXY only. It is not yet a layered
sprite sheet or animation asset.
```

- [ ] **Step 4: Create the exact pixel-character review example**

Create `experiments/codex_visual_prototype/reviews/pixel-character-consistency.example.json`:

```json
{
  "alphaValid": true,
  "fullBodyVisible": true,
  "limitedBlockShading": true,
  "markingsStable": true,
  "noBeadOrVoxelMaterials": true,
  "noExtraLimbs": true,
  "notes": "The candidate preserves identity on a single flat square-pixel grid.",
  "pass": true,
  "poseCorrect": true,
  "sameIdentity": true,
  "schemaVersion": 1,
  "squarePixelGrid": true,
  "stylePass": true,
  "violations": []
}
```

- [ ] **Step 5: Update the reusable-template README**

Set `experiments/codex_visual_prototype/README.md` to:

```markdown
# Codex visual prototype

This directory contains only reusable, synthetic Phase 1A templates.

The private `var/phase-1a/synthetic-cat-01/` run is the rejected fuse-bead
experiment and remains immutable evidence. The private
`var/phase-1a/synthetic-cat-01-pixel-v2/` run is the active 2.5D pixel-art
revision. Actual prompts, generated images, review records, manifests, and
account or task metadata under either run must never be committed.

A PASS here proves only a human-in-the-loop visual prototype; it does not
qualify real pets, a production provider, latency, cost, or the Web generation
path.
```

- [ ] **Step 6: Run GREEN, the full baseline, and commit**

Run:

```bash
.venv/bin/python -m pytest tests/unit/tools/test_visual_prototype.py -q
.venv/bin/python -m ruff check tests/unit/tools/test_visual_prototype.py
make check
git diff --check
```

Expected: focused tests `19 passed`; full Python suite `40 passed, 1 skipped`; Ruff, contracts, Web tests, typecheck, build, and diff check exit 0.

Commit:

```bash
git add experiments/codex_visual_prototype tests/unit/tools/test_visual_prototype.py
git commit -m "feat: define 2.5D pixel-art character contract"
```

---

### Task 2: Bootstrap the isolated pixel-v2 private run

**Files:**
- Private: `var/phase-1a/synthetic-cat-01-pixel-v2/identity/identity-card.json`
- Private: `var/phase-1a/synthetic-cat-01-pixel-v2/prompts/{reference-master,character-candidates,candidate-01,candidate-02,candidate-03}.md`
- Private: `var/phase-1a/synthetic-cat-01-pixel-v2/references/{three-view-master,front,cat-left-front-45,cat-right-front-45}.png`
- Private: `var/phase-1a/synthetic-cat-01-pixel-v2/reviews/reference-consistency.json`

**Interfaces:**
- Consumes: the committed pixel common prompt and the accepted old-run identity/reference artifacts.
- Produces: a clean run root whose copied evidence is byte-identical and whose three local prompts differ only by one approved suffix.
- Failure: an existing pixel-v2 root, a hash mismatch, an extra suffix, or any Git-visible `var/` path stops before generation.

- [ ] **Step 1: Refuse accidental overwrite, then create the private tree**

Run:

```bash
test ! -e var/phase-1a/synthetic-cat-01-pixel-v2
mkdir -p var/phase-1a/synthetic-cat-01-pixel-v2/identity
mkdir -p var/phase-1a/synthetic-cat-01-pixel-v2/prompts
mkdir -p var/phase-1a/synthetic-cat-01-pixel-v2/references
mkdir -p var/phase-1a/synthetic-cat-01-pixel-v2/reviews
mkdir -p var/phase-1a/synthetic-cat-01-pixel-v2/candidates
mkdir -p var/phase-1a/synthetic-cat-01-pixel-v2/selected
```

Expected: the first command exits 0. If it exits 1, stop and inspect the existing root; do not delete or overwrite it.

- [ ] **Step 2: Copy the accepted identity and reference evidence**

Run:

```bash
cp var/phase-1a/synthetic-cat-01/identity/identity-card.json var/phase-1a/synthetic-cat-01-pixel-v2/identity/identity-card.json
cp var/phase-1a/synthetic-cat-01/prompts/reference-master.md var/phase-1a/synthetic-cat-01-pixel-v2/prompts/reference-master.md
cp var/phase-1a/synthetic-cat-01/references/three-view-master.png var/phase-1a/synthetic-cat-01-pixel-v2/references/three-view-master.png
cp var/phase-1a/synthetic-cat-01/references/front.png var/phase-1a/synthetic-cat-01-pixel-v2/references/front.png
cp var/phase-1a/synthetic-cat-01/references/cat-left-front-45.png var/phase-1a/synthetic-cat-01-pixel-v2/references/cat-left-front-45.png
cp var/phase-1a/synthetic-cat-01/references/cat-right-front-45.png var/phase-1a/synthetic-cat-01-pixel-v2/references/cat-right-front-45.png
cp var/phase-1a/synthetic-cat-01/reviews/reference-consistency.json var/phase-1a/synthetic-cat-01-pixel-v2/reviews/reference-consistency.json
cp experiments/codex_visual_prototype/prompts/character-candidates.md var/phase-1a/synthetic-cat-01-pixel-v2/prompts/character-candidates.md
```

- [ ] **Step 3: Prove byte identity and the frozen accepted hashes**

Run:

```bash
cmp var/phase-1a/synthetic-cat-01/identity/identity-card.json var/phase-1a/synthetic-cat-01-pixel-v2/identity/identity-card.json
cmp var/phase-1a/synthetic-cat-01/references/three-view-master.png var/phase-1a/synthetic-cat-01-pixel-v2/references/three-view-master.png
cmp var/phase-1a/synthetic-cat-01/references/front.png var/phase-1a/synthetic-cat-01-pixel-v2/references/front.png
cmp var/phase-1a/synthetic-cat-01/references/cat-left-front-45.png var/phase-1a/synthetic-cat-01-pixel-v2/references/cat-left-front-45.png
cmp var/phase-1a/synthetic-cat-01/references/cat-right-front-45.png var/phase-1a/synthetic-cat-01-pixel-v2/references/cat-right-front-45.png
shasum -a 256 var/phase-1a/synthetic-cat-01-pixel-v2/references/three-view-master.png var/phase-1a/synthetic-cat-01-pixel-v2/references/front.png var/phase-1a/synthetic-cat-01-pixel-v2/references/cat-left-front-45.png var/phase-1a/synthetic-cat-01-pixel-v2/references/cat-right-front-45.png
```

Expected hashes, in order:

```text
a6b34c4e4154531005c3cc229bd0e2f9a531d9cd729bef38a358bd9a1d9936fd
327f8a21c7f1aec44bf0ee1dd02ade3dceede56923ddb279495ffd21baee7673
a2652be8719155ca81f800bf82e1f0694821b9b3adb04cb44ea53f2c66f96f49
d9aceece3a4581718ad23e7f4e968f61d72f94501e203a16548fc1b989213103
```

- [ ] **Step 4: Create the three exact local prompts**

Copy the committed common prompt three times:

```bash
cp var/phase-1a/synthetic-cat-01-pixel-v2/prompts/character-candidates.md var/phase-1a/synthetic-cat-01-pixel-v2/prompts/candidate-01.md
cp var/phase-1a/synthetic-cat-01-pixel-v2/prompts/character-candidates.md var/phase-1a/synthetic-cat-01-pixel-v2/prompts/candidate-02.md
cp var/phase-1a/synthetic-cat-01-pixel-v2/prompts/character-candidates.md var/phase-1a/synthetic-cat-01-pixel-v2/prompts/candidate-03.md
```

Using `apply_patch`, append exactly one blank line and exactly one of these suffixes to its matching file:

```text
candidate-01: Use a finer square-pixel scale with identity and marking fidelity first.
candidate-02: Use a medium square-pixel scale with slightly stronger clustered 2.5D light and shadow.
candidate-03: Use a medium square-pixel scale and a slightly rounder cute silhouette without changing natural proportions.
```

No other text may differ between the three files.

- [ ] **Step 5: Verify prompt isolation and Git isolation**

Run:

```bash
.venv/bin/python - <<'PY'
from pathlib import Path

root = Path("var/phase-1a/synthetic-cat-01-pixel-v2/prompts")
common = (root / "character-candidates.md").read_text()
suffixes = {
    "candidate-01.md": "candidate-01: Use a finer square-pixel scale with identity and marking fidelity first.\n",
    "candidate-02.md": "candidate-02: Use a medium square-pixel scale with slightly stronger clustered 2.5D light and shadow.\n",
    "candidate-03.md": "candidate-03: Use a medium square-pixel scale and a slightly rounder cute silhouette without changing natural proportions.\n",
}
for filename, suffix in suffixes.items():
    actual = (root / filename).read_text()
    assert actual == common + "\n" + suffix, filename
print("PIXEL_PROMPTS_EXACT")
PY
git status --short
git ls-files var/phase-1a
```

Expected: `PIXEL_PROMPTS_EXACT`; neither Git command prints a `var/` path. Task 2 makes no Git commit.

---

### Task 3: Generate, classify, and present three pixel-art candidates

**Files:**
- Private: `var/phase-1a/synthetic-cat-01-pixel-v2/reviews/candidate-call-{01,02,03}.png`
- Private: `var/phase-1a/synthetic-cat-01-pixel-v2/reviews/candidate-{01,02,03}-consistency.json`
- Private conditional: `var/phase-1a/synthetic-cat-01-pixel-v2/candidates/candidate-{01,02,03}.png`

**Interfaces:**
- Consumes: all three accepted references, the exact candidate prompts, the imagegen skill, and the committed style-review schema.
- Produces: exactly three raw call artifacts classified as valid, repairable-background preview, or invalid-style output, followed by a blocking user selection gate.
- Failure: a fourth call, any physical bead/voxel interpretation, an unrecorded output, or promotion of a false-alpha image fails the task.

- [ ] **Step 1: Dispatch one bounded candidate-generation subagent**

The generation subagent must read the complete imagegen skill and use built-in mode only. For each `candidate-0N.md`, it must:

1. read the full local prompt and verify its SHA-256;
2. call `image_gen` exactly once with `referenced_image_paths` containing exactly the three pixel-v2 reference crop paths;
3. omit `num_last_images_to_include`;
4. save the unmodified local output first as `reviews/candidate-call-0N.png`;
5. record source path, prompt hash, reference paths, dimensions, mode and SHA-256 in an ignored SDD report.

Exactly three calls are permitted. A missing or malformed result still consumes its call; no retry or fourth variation is legal.

- [ ] **Step 2: Run mechanical checks without promoting files**

For each raw file, run both commands and record both exit codes:

```bash
.venv/bin/python tools/visual_prototype.py check var/phase-1a/synthetic-cat-01-pixel-v2/reviews/candidate-call-01.png
.venv/bin/python tools/visual_prototype.py check var/phase-1a/synthetic-cat-01-pixel-v2/reviews/candidate-call-01.png --require-alpha
```

Repeat for 02 and 03. The first command must exit 0 for a readable PNG. Alpha exit 0 marks `alphaValid: true`; alpha exit 2 may still enter visual style review but cannot be copied into `candidates/`.

- [ ] **Step 3: Root-review the raw images at original detail**

Use `view_image` on each raw file and explicitly check:

- one common 2D square-pixel grid with no holes or physical gaps;
- no round beads, tubes, pegboard, cubes, Lego, Minecraft or voxel sculpture;
- hard stair-step silhouette and clustered block shading rather than smooth fur/vector edges;
- frozen identity markings and anatomical sides;
- fixed pose, full body, tail and limbs;
- whether the only remaining failure is background alpha.

Do not copy a file during this step.

- [ ] **Step 4: Dispatch an independent pixel-style reviewer**

Give a fresh reviewer only the identity card, three references, three raw candidates, mechanical alpha results, and `pixel-character-consistency.example.json`. It writes one actual JSON file per candidate using the exact schema.

Derivations are fixed:

```text
stylePass = every style flag is true
pass = stylePass and alphaValid and violations is empty
```

An opaque candidate may have `stylePass: true` and `pass: false` only when its concrete violation is background alpha. A bead, voxel, smooth illustration, wrong identity or wrong pose must have `stylePass: false`.

- [ ] **Step 5: Promote only true-alpha PASS candidates**

For every review with `pass: true`, copy its raw file to the matching `candidates/candidate-0N.png`, then run:

```bash
.venv/bin/python tools/visual_prototype.py check var/phase-1a/synthetic-cat-01-pixel-v2/candidates/candidate-0N.png --require-alpha
```

Do not copy `stylePass: true, pass: false` previews or any style-invalid output.

- [ ] **Step 6: Present the blocking user selection gate**

Show the accepted three-view master and all three raw candidates with labels:

- **valid candidate**: style and alpha passed;
- **repairable background preview**: style passed, alpha failed only;
- **invalid style**: not selectable.

Ask the user to select one valid candidate, select one repairable preview for the single background correction, or reject all. Do not choose for the user and do not start Task 4 before the response.

Task 3 makes no Git commit.

---

### Task 4: Apply the user choice and obtain the final visual gate

**Files:**
- Private optional: `var/phase-1a/synthetic-cat-01-pixel-v2/prompts/correction.md`
- Private optional: `var/phase-1a/synthetic-cat-01-pixel-v2/reviews/correction-call.png`
- Private: `var/phase-1a/synthetic-cat-01-pixel-v2/selected/character-hd.png`
- Private: `var/phase-1a/synthetic-cat-01-pixel-v2/selected/preview-{58,464}.png`
- Private: `var/phase-1a/synthetic-cat-01-pixel-v2/reviews/final-character-consistency.json`

**Interfaces:**
- Consumes: the user's selected ID and its Task 3 classification.
- Produces: one alpha-valid final character plus deterministic previews, or a STOP decision.
- Failure: a second correction, changed sprite pixels during background repair, failed alpha, or failed final style review produces STOP.

- [ ] **Step 1: Handle a valid-alpha selection without correction**

If the user selected a valid candidate, copy:

```bash
cp var/phase-1a/synthetic-cat-01-pixel-v2/candidates/candidate-0N.png var/phase-1a/synthetic-cat-01-pixel-v2/selected/character-hd.png
```

Set the recorded correction count to 0 and do not create `correction.md`.

- [ ] **Step 2: Handle one repairable-background selection**

If the user selected a repairable preview, write this exact instruction to `prompts/correction.md`, replacing only `candidate-0N` with the selected ID:

```text
Use case: background-extraction
Input image 1 is the candidate-0N edit target. Input images 2, 3, and 4 are
identity references only.

Change only the background: remove every background pixel and return a PNG with
real alpha transparency. Preserve every visible square pixel of the cat exactly,
including its grid alignment, colors, hard stair-step outline, clustered 2.5D
shading, face, green eyes, anatomical-left-eye orange patch,
anatomical-right-ear black patch, back markings, pose, paws, and ringed tail.

Do not redraw, smooth, antialias, recolor, reshape, relight, crop, add pixels,
remove cat pixels, add shadows, add a checkerboard, or change the pixel-art style.
```

Dispatch one built-in imagegen edit with the selected raw candidate followed by the three reference paths in `referenced_image_paths`. Save the unmodified result first as `reviews/correction-call.png`. This is the only correction call.

- [ ] **Step 3: Validate and independently review the final character**

Run:

```bash
.venv/bin/python tools/visual_prototype.py check var/phase-1a/synthetic-cat-01-pixel-v2/reviews/correction-call.png --require-alpha
```

For a corrected selection, use `view_image` and a fresh reviewer to confirm every original visible cat pixel, grid, color cluster, outline and identity feature is preserved. Write `final-character-consistency.json` with the committed schema. Only if it passes, copy the correction result to both:

```text
var/phase-1a/synthetic-cat-01-pixel-v2/candidates/candidate-0N.png
var/phase-1a/synthetic-cat-01-pixel-v2/selected/character-hd.png
```

For a no-correction selection, run the same independent final review on `selected/character-hd.png`. Any failure records STOP; do not run another edit.

- [ ] **Step 4: Render and verify deterministic previews**

Run:

```bash
.venv/bin/python tools/visual_prototype.py preview var/phase-1a/synthetic-cat-01-pixel-v2/selected/character-hd.png var/phase-1a/synthetic-cat-01-pixel-v2/selected
.venv/bin/python tools/visual_prototype.py check var/phase-1a/synthetic-cat-01-pixel-v2/selected/preview-58.png --require-alpha
.venv/bin/python tools/visual_prototype.py check var/phase-1a/synthetic-cat-01-pixel-v2/selected/preview-464.png --require-alpha
```

Expected: 58×58 and 464×464 true-alpha PNGs; the existing preview validator proves the latter is the exact 8× nearest-neighbor image.

- [ ] **Step 5: Present the blocking final visual gate**

Show `character-hd.png`, `preview-58.png`, and `preview-464.png`. Ask the user for exactly one of:

```text
VISUAL_PROTOTYPE_PASS
STOP_REVISE_STYLE
```

Do not construct a PASS manifest before the user explicitly returns `VISUAL_PROTOTYPE_PASS`.

Task 4 makes no Git commit.

---

### Task 5: Record the decision and verify the branch

**Files:**
- Private: `var/phase-1a/synthetic-cat-01-pixel-v2/manifest.json`
- No tracked implementation files

**Interfaces:**
- Consumes: the explicit final user decision, selected ID, correction count, accepted reference evidence, candidates and final previews.
- Produces: one verified private manifest and a clean tracked branch ready for broad review.
- Failure: manifest verification, full baseline, Git isolation or review failure blocks branch completion.

- [ ] **Step 1: Build a PASS manifest only after explicit approval**

For PASS without correction, run:

```bash
.venv/bin/python tools/visual_prototype.py manifest var/phase-1a/synthetic-cat-01-pixel-v2 --master-attempts 3 --decision VISUAL_PROTOTYPE_PASS --selected candidate-0N --approved --correction-count 0
```

For PASS after the single background correction, run the same command with `--correction-count 1`.

- [ ] **Step 2: Build a STOP manifest for every non-PASS exit**

If the user rejects all candidates, the correction fails, or the final user decision is STOP, run:

```bash
.venv/bin/python tools/visual_prototype.py manifest var/phase-1a/synthetic-cat-01-pixel-v2 --master-attempts 3 --decision STOP_REVISE_STYLE --correction-count 0
```

Use `--correction-count 1` only when the one correction call actually occurred. Do not pass `--selected` or `--approved` for STOP.

- [ ] **Step 3: Verify the manifest and inspect its safety boundary**

Run:

```bash
.venv/bin/python tools/visual_prototype.py verify var/phase-1a/synthetic-cat-01-pixel-v2/manifest.json var/phase-1a/synthetic-cat-01-pixel-v2
.venv/bin/python - <<'PY'
import json
from pathlib import Path

path = Path("var/phase-1a/synthetic-cat-01-pixel-v2/manifest.json")
payload = json.loads(path.read_text())
text = path.read_text()
assert payload["schemaVersion"] == 1
assert "/Users/" not in text
assert "data:image" not in text
assert "api_key" not in text.lower()
assert "token" not in text.lower()
print(payload["decision"])
PY
```

Expected: verifier exits 0 and the script prints the user's recorded decision.

- [ ] **Step 4: Run the complete repository and isolation checks**

Run:

```bash
make check
git diff --check
git status --short --branch
git ls-files var/phase-1a
```

Expected: Python `40 passed, 1 skipped`; Ruff, contracts, Web tests, typecheck and build pass; no `var/` path is tracked or shown in status.

- [ ] **Step 5: Perform the broad whole-branch review**

Generate a review package from the branch merge base through HEAD. Give the final reviewer this plan, the approved pixel-art spec, the SDD progress ledger, all tracked diffs, and the two recorded Minor evidence limitations about reconstructing historical built-in imagegen payload bytes. Fix every Critical or Important finding and re-review before using `superpowers:finishing-a-development-branch`.

Task 5 makes no runtime-artifact commit. Only the tracked Task 1 contract commit and the approved documentation commits belong on the branch.

---
