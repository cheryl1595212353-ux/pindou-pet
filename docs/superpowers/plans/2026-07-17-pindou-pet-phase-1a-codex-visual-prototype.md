# 拼豆虚拟宠物 Phase 1A：Codex 合成三视图视觉原型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 不使用用户提供的 API Key，由 Codex 子 agent 生成一只合成三花猫的统一三视图，并在严格本地证据和用户门禁下产出一个可辨认的静态 2.5D 拼豆角色原型。

**Architecture:** 图像生成只发生在 Codex 人工编排阶段，不进入 Web/API 运行时。仓库只增加一组脱敏提示词模板和一个确定性的 Python 工具，用于裁切三视图、验证 PNG/alpha、制作 58×58 视觉预览并校验最终 manifest；所有生成媒体和实际提示词保存在被 Git 忽略的 var/phase-1a/synthetic-cat-01/。

**Tech Stack:** Phase 0 固定的 Python 3.12、Pillow、pytest、Ruff；Codex 子 agent、imagegen 图像生成工具、本地 view_image 人工检查。

## Global Constraints

- 只处理一只合成短毛三花猫，不接入真实宠物照片。
- 不申请、不读取也不新增任何生成 API Key；不得修改 .env.example 或产品 Settings。
- Codex 和子 agent 只作为开发期编排工具，不得新增 Web/API 路由或生产 Provider adapter。
- 身份优先级高于拼豆风格：白色主毛色、绿色眼睛、猫左眼橘斑、猫右耳黑斑、背部橘黑斑和橘黑环纹尾必须稳定。
- 猫左／猫右始终是猫自身解剖方向；视角名固定为 FRONT、CAT_LEFT_FRONT_45、CAT_RIGHT_FRONT_45。
- 三张参考图必须由一张三等分母版裁切，不允许三个 agent 独立生成三个视角。
- 母版最多三次尝试；前两张可被拒绝，第三张仍失败则停止并请求用户调整身份卡或风格。
- 角色候选最多三个；用户选中后最多一轮文字校正。
- 候选和最终角色必须是具有真实 alpha 通道的 PNG；纯色或棋盘格背景不算透明。
- 58×58 图只是 NOT_A_PHYSICAL_BEAD_EXPORT 视觉代理，不使用真实色板、不统计豆数、不声称完成分层拼豆资产。
- 真实媒体、实际提示词、review、manifest、任务输出和绝对路径只进入 var/，不得提交 Git。
- 自动测试只验证文件合同；“是否像同一只猫”和最终 PASS 必须由用户判断。
- 不执行 120 秒产品门禁，不宣称生产延迟、成本、幂等恢复或网页自动生成已验证。

## Exact Files

- Modify now: docs/superpowers/specs/2026-07-17-pindou-pet-phase-1a-codex-visual-prototype-design.md
- Create: experiments/codex_visual_prototype/README.md
- Create: experiments/codex_visual_prototype/identity-card.json
- Create: experiments/codex_visual_prototype/prompts/reference-master.md
- Create: experiments/codex_visual_prototype/prompts/character-candidates.md
- Create: experiments/codex_visual_prototype/reviews/reference-consistency.example.json
- Create: tools/__init__.py
- Create: tools/visual_prototype.py
- Create: tests/unit/tools/test_visual_prototype.py
- Modify: Makefile
- Private only: var/phase-1a/synthetic-cat-01/**

---

### Task 1: Freeze the synthetic identity and agent instructions

**Files:**
- Create: experiments/codex_visual_prototype/README.md
- Create: experiments/codex_visual_prototype/identity-card.json
- Create: experiments/codex_visual_prototype/prompts/reference-master.md
- Create: experiments/codex_visual_prototype/prompts/character-candidates.md
- Create: experiments/codex_visual_prototype/reviews/reference-consistency.example.json
- Create: tests/unit/tools/test_visual_prototype.py

**Interfaces:**
- Produces: one committed synthetic identity card and immutable prompt/review templates.
- Consumes later: Task 3 copies these files into the private run directory before any image call.
- Failure: a missing identity marker, ambiguous anatomical direction, or product claim fails the test before image generation.

- [ ] **Step 1: Write the RED template-contract tests**

Create tests/unit/tools/test_visual_prototype.py with:

~~~python
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
EXPERIMENT = ROOT / "experiments" / "codex_visual_prototype"


def test_identity_card_freezes_the_distinctive_calico_markings() -> None:
    card = json.loads((EXPERIMENT / "identity-card.json").read_text())

    assert card["schemaVersion"] == 1
    assert card["species"] == "cat"
    assert card["coatLength"] == "short"
    assert card["baseCoatColor"] == "white"
    assert card["eyeColor"] == "green"
    assert card["anatomicalMarkings"] == [
        "orange patch around the cat's anatomical left eye",
        "black patch on the cat's anatomical right ear and adjacent crown",
        "large coherent orange and black patches on the back",
        "orange and black ringed tail with a dark tip",
    ]
    assert card["accessories"] == []


def test_reference_prompt_uses_one_three_panel_master() -> None:
    prompt = (EXPERIMENT / "prompts" / "reference-master.md").read_text()

    assert "one wide three-panel contact sheet" in prompt
    assert "FRONT" in prompt
    assert "CAT_LEFT_FRONT_45" in prompt
    assert "CAT_RIGHT_FRONT_45" in prompt
    assert "Do not generate the three views independently" in prompt
    assert "no bead art" in prompt


def test_character_prompt_requires_identity_and_real_alpha() -> None:
    prompt = (EXPERIMENT / "prompts" / "character-candidates.md").read_text()

    assert "identity preservation is the highest priority" in prompt
    assert "real alpha transparency" in prompt
    assert "torso is angled about 20 degrees toward image" in prompt.lower()
    assert "tail on image right" in prompt
    assert "NOT_A_PHYSICAL_BEAD_EXPORT" in prompt


def test_reference_review_example_has_no_ambiguous_pass() -> None:
    review = json.loads(
        (EXPERIMENT / "reviews" / "reference-consistency.example.json").read_text()
    )

    required = {
        "sameIdentity",
        "viewsCorrect",
        "anatomicalMarkingsStable",
        "fullBodyVisible",
        "noExtraLimbs",
        "photographicNotBeadArt",
    }
    assert required.issubset(review)
    assert review["pass"] is True
    assert all(review[key] is True for key in required)
    assert review["violations"] == []
~~~

- [ ] **Step 2: Run the tests to verify RED**

Run:

~~~bash
.venv/bin/python -m pytest tests/unit/tools/test_visual_prototype.py -q
~~~

Expected: FAIL because experiments/codex_visual_prototype/ does not exist.

- [ ] **Step 3: Create the frozen identity card**

Create experiments/codex_visual_prototype/identity-card.json:

~~~json
{
  "accessories": [],
  "anatomicalMarkings": [
    "orange patch around the cat's anatomical left eye",
    "black patch on the cat's anatomical right ear and adjacent crown",
    "large coherent orange and black patches on the back",
    "orange and black ringed tail with a dark tip"
  ],
  "baseCoatColor": "white",
  "bodyBuild": "medium natural proportions",
  "coatLength": "short",
  "eyeColor": "green",
  "schemaVersion": 1,
  "species": "cat"
}
~~~

- [ ] **Step 4: Create the exact reference-master prompt**

Create experiments/codex_visual_prototype/prompts/reference-master.md:

~~~text
Create one wide three-panel contact sheet showing the exact same photorealistic
short-haired calico cat in all panels. Identity preservation is mandatory.

Identity:
- white base coat, medium natural body proportions, short hair, green eyes
- orange patch around the cat's anatomical left eye
- black patch on the cat's anatomical right ear and adjacent crown
- large coherent orange and black patches on the back
- orange and black ringed tail with a dark tip
- no collar, clothing, tag, accessory, text, logo, or watermark

The cat's anatomical left is the cat's own left and appears on the viewer's
right in the FRONT panel. Never mirror or exchange the two named head markings.

Create one wide three-panel contact sheet with three equal-width panels and
clear empty gutters. From left to right:
1. FRONT: full-body front view.
2. CAT_LEFT_FRONT_45: camera located about 45 degrees in front of the cat's
   anatomical left side.
3. CAT_RIGHT_FRONT_45: camera located about 45 degrees in front of the cat's
   anatomical right side.

Use the same neutral standing pose, camera height, soft neutral studio light,
and pale gray seamless background in every panel. Show the complete ears,
four legs, paws, torso, and tail. Use realistic photography only: no bead art,
pixel art, illustration, captions, frames, props, or decorative effects.
Do not generate the three views independently.
~~~

- [ ] **Step 5: Create the exact candidate prompt**

Create experiments/codex_visual_prototype/prompts/character-candidates.md:

~~~text
Use all three supplied reference views as one identity set. Create the same cat
as a centered, full-body, static 2.5D fuse-bead character. Identity preservation
is the highest priority; style must not replace the cat's face shape, green eyes,
white base coat, anatomical-left-eye orange patch, anatomical-right-ear black
patch, coherent back patches, or orange-and-black ringed tail.

The head faces the viewer. The torso is angled about 20 degrees toward image
right, with the tail on image right. Keep both ears, all visible paws, the body,
and the entire tail inside the canvas. Do not add accessories or extra limbs.

Build the silhouette and markings from clear, similarly sized plastic fuse-bead
units with subtle 2.5D depth and unified lighting. Prefer coherent blocks over
fur noise, dithering, loose floating beads, text, grids, boards, branding, props,
or background shadows. Output a PNG with real alpha transparency; a white,
checkerboard, or simulated transparent background is invalid.

Generate these three bounded variants without changing identity or pose:
- candidate-01: finest allowed bead density, identity-first silhouette.
- candidate-02: medium bead density and slightly stronger plastic depth.
- candidate-03: medium bead density with a slightly rounder cute silhouette.

The later 58x58 image is a NOT_A_PHYSICAL_BEAD_EXPORT visual proxy only.
~~~

- [ ] **Step 6: Create the reference-review schema example and README**

Create experiments/codex_visual_prototype/reviews/reference-consistency.example.json:

~~~json
{
  "anatomicalMarkingsStable": true,
  "fullBodyVisible": true,
  "noExtraLimbs": true,
  "notes": "All three panels preserve the frozen synthetic identity.",
  "pass": true,
  "photographicNotBeadArt": true,
  "sameIdentity": true,
  "schemaVersion": 1,
  "viewsCorrect": true,
  "violations": []
}
~~~

Create experiments/codex_visual_prototype/README.md:

~~~markdown
# Codex visual prototype

This directory contains only reusable, synthetic Phase 1A templates.

Actual prompts, generated images, review records, manifests, and account or
task metadata belong under var/phase-1a/synthetic-cat-01/ and must never be
committed. A PASS here proves only a human-in-the-loop visual prototype; it
does not qualify real pets, a production provider, latency, cost, or the Web
generation path.
~~~

- [ ] **Step 7: Verify GREEN and commit**

Run:

~~~bash
.venv/bin/python -m pytest tests/unit/tools/test_visual_prototype.py -q
.venv/bin/python -m ruff check tests/unit/tools/test_visual_prototype.py
git diff --check
~~~

Expected: 4 tests pass; Ruff and diff check exit 0.

Commit:

~~~bash
git add experiments/codex_visual_prototype tests/unit/tools/test_visual_prototype.py
git commit -m "test: freeze Phase 1A visual inputs"
~~~

---

### Task 2: Build deterministic local artifact checks

**Files:**
- Create: tools/__init__.py
- Create: tools/visual_prototype.py
- Modify: tests/unit/tools/test_visual_prototype.py
- Modify: Makefile

**Interfaces:**
- Produces: inspect_png(path, require_alpha), split_master(master, output_dir), render_previews(character, output_dir), build_manifest(run_root, ...), and verify_manifest(manifest_path, run_root).
- Consumes later: Tasks 3–6 invoke the CLI; no image-generation transport is imported.
- Failure: all validation errors print VISUAL PROTOTYPE ERROR and exit 2 without claiming PASS.

- [ ] **Step 1: Add RED image and manifest tests**

Replace the import block at the top of tests/unit/tools/test_visual_prototype.py with:

~~~python
import json
import shutil
from pathlib import Path

import pytest
from PIL import Image

from tools.visual_prototype import (
    build_manifest,
    inspect_png,
    render_previews,
    split_master,
    verify_manifest,
)
~~~

Then append these helpers and tests after the existing template tests:

~~~python


def _save_rgb(path: Path, size: tuple[int, int]) -> None:
    Image.new("RGB", size, (220, 220, 220)).save(path, format="PNG")


def _save_transparent_character(path: Path) -> None:
    image = Image.new("RGBA", (120, 90), (0, 0, 0, 0))
    for x in range(20, 100):
        for y in range(10, 85):
            image.putpixel((x, y), (240, 150, 40, 255))
    image.save(path, format="PNG")


def test_split_master_produces_the_frozen_view_order(tmp_path: Path) -> None:
    master = tmp_path / "master.png"
    _save_rgb(master, (1536, 512))

    evidence = split_master(master, tmp_path / "references")

    assert [item["view"] for item in evidence] == [
        "FRONT",
        "CAT_LEFT_FRONT_45",
        "CAT_RIGHT_FRONT_45",
    ]
    assert [item["path"].name for item in evidence] == [
        "front.png",
        "cat-left-front-45.png",
        "cat-right-front-45.png",
    ]
    assert all(item["width"] == 512 and item["height"] == 512 for item in evidence)


def test_split_master_rejects_panels_smaller_than_512(tmp_path: Path) -> None:
    master = tmp_path / "master.png"
    _save_rgb(master, (1200, 512))

    with pytest.raises(ValueError, match="512"):
        split_master(master, tmp_path / "references")


def test_candidate_requires_real_alpha_and_proxy_is_nearest_neighbor(
    tmp_path: Path,
) -> None:
    opaque = tmp_path / "opaque.png"
    _save_rgb(opaque, (120, 90))
    with pytest.raises(ValueError, match="alpha"):
        inspect_png(opaque, require_alpha=True)

    character = tmp_path / "character.png"
    _save_transparent_character(character)
    preview_58, preview_464 = render_previews(character, tmp_path / "selected")

    assert Image.open(preview_58).size == (58, 58)
    assert Image.open(preview_464).size == (464, 464)
    assert Image.open(preview_464).resize((58, 58), Image.Resampling.NEAREST).tobytes() == (
        Image.open(preview_58).tobytes()
    )


def test_manifest_rejects_absolute_paths_and_verifies_hashes(tmp_path: Path) -> None:
    run_root = tmp_path / "synthetic-cat-01"
    subdirectories = (
        "identity",
        "prompts",
        "references",
        "reviews",
        "candidates",
        "selected",
    )
    for name in subdirectories:
        (run_root / name).mkdir(parents=True, exist_ok=True)

    (run_root / "identity" / "identity-card.json").write_text("{}")
    (run_root / "prompts" / "reference-master.md").write_text("reference")
    (run_root / "prompts" / "candidate-01.md").write_text("candidate")
    _save_rgb(run_root / "references" / "three-view-master.png", (1536, 512))
    split_master(
        run_root / "references" / "three-view-master.png",
        run_root / "references",
    )
    (run_root / "reviews" / "reference-consistency.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "sameIdentity": True,
                "viewsCorrect": True,
                "anatomicalMarkingsStable": True,
                "fullBodyVisible": True,
                "noExtraLimbs": True,
                "photographicNotBeadArt": True,
                "pass": True,
                "violations": [],
                "notes": "pass",
            }
        )
    )
    _save_transparent_character(run_root / "candidates" / "candidate-01.png")
    shutil.copyfile(
        run_root / "candidates" / "candidate-01.png",
        run_root / "selected" / "character-hd.png",
    )
    render_previews(
        run_root / "selected" / "character-hd.png",
        run_root / "selected",
    )

    manifest = build_manifest(
        run_root,
        master_attempt_count=1,
        decision="VISUAL_PROTOTYPE_PASS",
        selected_candidate_id="candidate-01",
        user_approved=True,
        correction_count=0,
    )
    assert verify_manifest(manifest, run_root)["decision"] == "VISUAL_PROTOTYPE_PASS"

    payload = json.loads(manifest.read_text())
    payload["identity"]["path"] = "/Users/example/private.json"
    manifest.write_text(json.dumps(payload))
    with pytest.raises(ValueError, match="absolute"):
        verify_manifest(manifest, run_root)


def test_stop_manifest_allows_failure_before_references_or_candidates(
    tmp_path: Path,
) -> None:
    run_root = tmp_path / "synthetic-cat-01"
    subdirectories = (
        "identity",
        "prompts",
        "references",
        "reviews",
        "candidates",
        "selected",
    )
    for name in subdirectories:
        (run_root / name).mkdir(parents=True, exist_ok=True)

    (run_root / "identity" / "identity-card.json").write_text("{}")
    (run_root / "prompts" / "reference-master.md").write_text("reference")
    _save_rgb(run_root / "references" / "three-view-master.png", (1200, 512))
    (run_root / "reviews" / "reference-consistency.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "sameIdentity": False,
                "viewsCorrect": False,
                "anatomicalMarkingsStable": False,
                "fullBodyVisible": False,
                "noExtraLimbs": True,
                "photographicNotBeadArt": True,
                "pass": False,
                "violations": ["master panels failed the minimum crop contract"],
                "notes": "stopped before candidate generation",
            }
        )
    )

    manifest = build_manifest(
        run_root,
        master_attempt_count=3,
        decision="STOP_REVISE_STYLE",
        selected_candidate_id=None,
        user_approved=False,
        correction_count=0,
    )
    assert verify_manifest(manifest, run_root)["references"] == []
    assert verify_manifest(manifest, run_root)["candidates"] == []
~~~

- [ ] **Step 2: Run RED tests**

Run:

~~~bash
.venv/bin/python -m pytest tests/unit/tools/test_visual_prototype.py -q
~~~

Expected: FAIL because tools.visual_prototype does not exist.

- [ ] **Step 3: Create the tools package marker**

Create tools/__init__.py:

~~~python
"""Repository-local experiment tools."""
~~~

- [ ] **Step 4: Implement deterministic image operations**

Create tools/visual_prototype.py with these imports, constants, and functions:

~~~python
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path, PurePosixPath
from typing import Any

from PIL import Image, UnidentifiedImageError


VIEWS = (
    ("FRONT", "front.png"),
    ("CAT_LEFT_FRONT_45", "cat-left-front-45.png"),
    ("CAT_RIGHT_FRONT_45", "cat-right-front-45.png"),
)
DECISIONS = ("VISUAL_PROTOTYPE_PASS", "STOP_REVISE_STYLE")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
WINDOWS_ABSOLUTE_RE = re.compile(r"^[A-Za-z]:[\\/]")
FORBIDDEN_KEY_PARTS = (
    "secret",
    "token",
    "apikey",
    "api_key",
    "base64",
    "imagebytes",
    "image_bytes",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_png(path: Path, *, require_alpha: bool = False) -> dict[str, Any]:
    try:
        with Image.open(path) as image:
            if image.format != "PNG":
                raise ValueError(f"{path} is not PNG")
            image.load()
            rgba = image.convert("RGBA")
            alpha_low, alpha_high = rgba.getchannel("A").getextrema()
            has_real_alpha = alpha_low < 255 and alpha_high > 0
            evidence = {
                "width": image.width,
                "height": image.height,
                "hasRealAlpha": has_real_alpha,
                "sha256": sha256_file(path),
            }
    except (OSError, UnidentifiedImageError) as exc:
        raise ValueError(f"{path} is not a readable PNG") from exc

    if require_alpha and not evidence["hasRealAlpha"]:
        raise ValueError(f"{path} does not contain real alpha transparency")
    return evidence


def _save_png_atomic(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    image.save(temporary, format="PNG")
    os.replace(temporary, path)


def split_master(master: Path, output_dir: Path) -> list[dict[str, Any]]:
    with Image.open(master) as source:
        if source.format != "PNG":
            raise ValueError("three-view master must be PNG")
        source.load()
        if source.width % 3 != 0:
            raise ValueError("three-view master width must divide into three equal panels")
        panel_width = source.width // 3
        if panel_width < 512 or source.height < 512:
            raise ValueError("every reference panel must be at least 512x512")

        output: list[dict[str, Any]] = []
        for index, (view, filename) in enumerate(VIEWS):
            panel = source.crop(
                (index * panel_width, 0, (index + 1) * panel_width, source.height)
            )
            path = output_dir / filename
            _save_png_atomic(panel, path)
            output.append(
                {
                    "view": view,
                    "path": path,
                    **inspect_png(path),
                }
            )
    return output


def render_previews(character: Path, output_dir: Path) -> tuple[Path, Path]:
    inspect_png(character, require_alpha=True)
    with Image.open(character) as source:
        rgba = source.convert("RGBA")
        bounds = rgba.getchannel("A").getbbox()
        if bounds is None:
            raise ValueError("character alpha contains no visible pixels")
        role = rgba.crop(bounds)
        role.thumbnail((54, 54), Image.Resampling.NEAREST)
        preview = Image.new("RGBA", (58, 58), (0, 0, 0, 0))
        x = (58 - role.width) // 2
        y = (58 - role.height) // 2
        preview.alpha_composite(role, (x, y))

    preview_58 = output_dir / "preview-58.png"
    preview_464 = output_dir / "preview-464.png"
    _save_png_atomic(preview, preview_58)
    _save_png_atomic(
        preview.resize((464, 464), Image.Resampling.NEAREST),
        preview_464,
    )
    return preview_58, preview_464
~~~

- [ ] **Step 5: Implement manifest construction and verification**

Append to tools/visual_prototype.py:

~~~python
def _relative_artifact(
    path: Path,
    run_root: Path,
    *,
    png: bool = False,
    require_alpha: bool = False,
) -> dict[str, Any]:
    resolved_root = run_root.resolve()
    resolved = path.resolve()
    if not resolved.is_relative_to(resolved_root):
        raise ValueError(f"artifact escapes run root: {path}")
    relative = resolved.relative_to(resolved_root).as_posix()
    evidence: dict[str, Any] = {
        "path": relative,
        "sha256": sha256_file(resolved),
    }
    if png:
        evidence.update(inspect_png(resolved, require_alpha=require_alpha))
    return evidence


def _load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def _assert_manifest_safe(value: Any, *, key_path: str = "manifest") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            lowered = key.lower()
            if any(part in lowered for part in FORBIDDEN_KEY_PARTS):
                raise ValueError(f"forbidden manifest key: {key_path}.{key}")
            _assert_manifest_safe(child, key_path=f"{key_path}.{key}")
        return
    if isinstance(value, list):
        for index, child in enumerate(value):
            _assert_manifest_safe(child, key_path=f"{key_path}[{index}]")
        return
    if isinstance(value, str):
        if value.startswith("/") or WINDOWS_ABSOLUTE_RE.match(value):
            raise ValueError(f"absolute path is forbidden at {key_path}")
        if value.startswith("data:image") or len(value) > 4096:
            raise ValueError(f"embedded image data is forbidden at {key_path}")


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )
    os.replace(temporary, path)


def build_manifest(
    run_root: Path,
    *,
    master_attempt_count: int,
    decision: str,
    selected_candidate_id: str | None,
    user_approved: bool,
    correction_count: int,
) -> Path:
    if not 1 <= master_attempt_count <= 3:
        raise ValueError("master attempt count must be between 1 and 3")
    if decision not in DECISIONS:
        raise ValueError(f"invalid decision: {decision}")
    if correction_count not in (0, 1):
        raise ValueError("correction count must be 0 or 1")

    identity = run_root / "identity" / "identity-card.json"
    reference_prompt = run_root / "prompts" / "reference-master.md"
    master = run_root / "references" / "three-view-master.png"
    review_path = run_root / "reviews" / "reference-consistency.json"
    review = _load_json(review_path)
    required_review_flags = (
        "sameIdentity",
        "viewsCorrect",
        "anatomicalMarkingsStable",
        "fullBodyVisible",
        "noExtraLimbs",
        "photographicNotBeadArt",
    )
    review_pass = (
        review.get("pass") is True
        and all(review.get(flag) is True for flag in required_review_flags)
        and review.get("violations") == []
    )

    reference_paths = [run_root / "references" / filename for _, filename in VIEWS]
    present_references = [path.exists() for path in reference_paths]
    if any(present_references) and not all(present_references):
        raise ValueError("reference crops must be either complete or absent")
    if decision == "VISUAL_PROTOTYPE_PASS" and not all(present_references):
        raise ValueError("prototype PASS requires all three reference crops")

    references = []
    if all(present_references):
        for (view, _), path in zip(VIEWS, reference_paths, strict=True):
            references.append(
                {
                    "view": view,
                    **_relative_artifact(path, run_root, png=True),
                }
            )

    candidate_paths = sorted((run_root / "candidates").glob("candidate-*.png"))
    if len(candidate_paths) > 3:
        raise ValueError("run cannot contain more than three candidates")
    if decision == "VISUAL_PROTOTYPE_PASS" and not candidate_paths:
        raise ValueError("prototype PASS requires at least one candidate")
    candidates = []
    for image_path in candidate_paths:
        candidate_id = image_path.stem
        prompt_path = run_root / "prompts" / f"{candidate_id}.md"
        candidates.append(
            {
                "candidateId": candidate_id,
                "image": _relative_artifact(
                    image_path,
                    run_root,
                    png=True,
                    require_alpha=True,
                ),
                "prompt": _relative_artifact(prompt_path, run_root),
            }
        )

    candidate_ids = {item["candidateId"] for item in candidates}
    payload: dict[str, Any] = {
        "schemaVersion": 1,
        "identity": _relative_artifact(identity, run_root),
        "referencePrompt": _relative_artifact(reference_prompt, run_root),
        "masterAttemptCount": master_attempt_count,
        "master": _relative_artifact(master, run_root, png=True),
        "references": references,
        "referenceReview": {
            **review,
            "evidence": _relative_artifact(review_path, run_root),
        },
        "candidates": candidates,
        "selection": {
            "approved": user_approved,
            "candidateId": selected_candidate_id,
            "correctionCount": correction_count,
        },
        "decision": decision,
    }

    if decision == "VISUAL_PROTOTYPE_PASS":
        if not review_pass:
            raise ValueError("reference review must pass before prototype PASS")
        if not user_approved or selected_candidate_id not in candidate_ids:
            raise ValueError("prototype PASS requires an approved existing candidate")
        selected_dir = run_root / "selected"
        payload["final"] = {
            "character": _relative_artifact(
                selected_dir / "character-hd.png",
                run_root,
                png=True,
                require_alpha=True,
            ),
            "preview58": _relative_artifact(
                selected_dir / "preview-58.png",
                run_root,
                png=True,
                require_alpha=True,
            ),
            "preview464": _relative_artifact(
                selected_dir / "preview-464.png",
                run_root,
                png=True,
                require_alpha=True,
            ),
        }
        correction = run_root / "prompts" / "correction.md"
        if correction_count == 1:
            payload["correctionPrompt"] = _relative_artifact(correction, run_root)
        elif correction.exists():
            raise ValueError("correction prompt exists while correction count is zero")
    elif user_approved:
        raise ValueError("STOP decision cannot claim user approval")

    _assert_manifest_safe(payload)
    manifest = run_root / "manifest.json"
    _atomic_write_json(manifest, payload)
    return manifest


def _walk_artifacts(value: Any) -> list[dict[str, Any]]:
    artifacts: list[dict[str, Any]] = []
    if isinstance(value, dict):
        if "path" in value and "sha256" in value:
            artifacts.append(value)
        for child in value.values():
            artifacts.extend(_walk_artifacts(child))
    elif isinstance(value, list):
        for child in value:
            artifacts.extend(_walk_artifacts(child))
    return artifacts


def verify_manifest(manifest_path: Path, run_root: Path) -> dict[str, Any]:
    payload = _load_json(manifest_path)
    _assert_manifest_safe(payload)
    if payload.get("schemaVersion") != 1:
        raise ValueError("manifest schemaVersion must be 1")
    if payload.get("decision") not in DECISIONS:
        raise ValueError("manifest decision is invalid")
    expected_views = [view for view, _ in VIEWS]
    actual_views = [item.get("view") for item in payload.get("references", [])]
    if payload["decision"] == "VISUAL_PROTOTYPE_PASS" and actual_views != expected_views:
        raise ValueError("PASS reference order is invalid")
    if payload["decision"] == "STOP_REVISE_STYLE" and actual_views not in (
        [],
        expected_views,
    ):
        raise ValueError("STOP reference evidence is partial or out of order")
    if len(payload.get("candidates", [])) > 3:
        raise ValueError("manifest contains more than three candidates")

    root = run_root.resolve()
    for artifact in _walk_artifacts(payload):
        relative = PurePosixPath(artifact["path"])
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("artifact path must be relative and contained")
        if not SHA256_RE.fullmatch(artifact["sha256"]):
            raise ValueError("artifact sha256 is malformed")
        path = (root / Path(*relative.parts)).resolve()
        if not path.is_relative_to(root):
            raise ValueError("artifact path escapes run root")
        if not path.is_file():
            raise ValueError(f"artifact is missing: {relative}")
        if sha256_file(path) != artifact["sha256"]:
            raise ValueError(f"artifact hash mismatch: {relative}")

    if payload["decision"] == "VISUAL_PROTOTYPE_PASS":
        if payload.get("selection", {}).get("approved") is not True:
            raise ValueError("PASS manifest lacks user approval")
        if "final" not in payload:
            raise ValueError("PASS manifest lacks final artifacts")
    return payload
~~~

- [ ] **Step 6: Implement the exact CLI**

Append to tools/visual_prototype.py:

~~~python
def _json_print(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2, default=str))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subcommands = parser.add_subparsers(dest="command", required=True)

    split = subcommands.add_parser("split")
    split.add_argument("master", type=Path)
    split.add_argument("output_dir", type=Path)

    check = subcommands.add_parser("check")
    check.add_argument("image", type=Path)
    check.add_argument("--require-alpha", action="store_true")

    preview = subcommands.add_parser("preview")
    preview.add_argument("character", type=Path)
    preview.add_argument("output_dir", type=Path)

    manifest = subcommands.add_parser("manifest")
    manifest.add_argument("run_root", type=Path)
    manifest.add_argument("--master-attempts", type=int, required=True)
    manifest.add_argument("--decision", choices=DECISIONS, required=True)
    manifest.add_argument("--selected")
    manifest.add_argument("--approved", action="store_true")
    manifest.add_argument("--correction-count", type=int, choices=(0, 1), default=0)

    verify = subcommands.add_parser("verify")
    verify.add_argument("manifest", type=Path)
    verify.add_argument("run_root", type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "split":
            _json_print(split_master(args.master, args.output_dir))
        elif args.command == "check":
            _json_print(inspect_png(args.image, require_alpha=args.require_alpha))
        elif args.command == "preview":
            _json_print(render_previews(args.character, args.output_dir))
        elif args.command == "manifest":
            manifest = build_manifest(
                args.run_root,
                master_attempt_count=args.master_attempts,
                decision=args.decision,
                selected_candidate_id=args.selected,
                user_approved=args.approved,
                correction_count=args.correction_count,
            )
            _json_print(verify_manifest(manifest, args.run_root))
        elif args.command == "verify":
            _json_print(verify_manifest(args.manifest, args.run_root))
    except (FileNotFoundError, json.JSONDecodeError, OSError, ValueError) as exc:
        print(f"VISUAL PROTOTYPE ERROR: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
~~~

- [ ] **Step 7: Include tools in the existing lint gate**

Change Makefile lint recipe to:

~~~make
lint:
	$(PY) -m ruff check apps/api/src apps/api/tests tests tools
~~~

Do not change the other Makefile targets.

- [ ] **Step 8: Run GREEN tests and exercise CLI failure**

Run:

~~~bash
.venv/bin/python -m pytest tests/unit/tools/test_visual_prototype.py -q
.venv/bin/python -m ruff check tools tests/unit/tools/test_visual_prototype.py
.venv/bin/python tools/visual_prototype.py check tests/unit/tools/not-present.png
~~~

Expected: all tests pass; Ruff exits 0; the final command prints VISUAL PROTOTYPE ERROR and exits 2.

- [ ] **Step 9: Run the full baseline and commit**

Run:

~~~bash
make check
git diff --check
git status --short
~~~

Expected: Phase 0 checks remain green and only Task 2 files are modified.

Commit:

~~~bash
git add Makefile tools/__init__.py tools/visual_prototype.py tests/unit/tools/test_visual_prototype.py
git commit -m "feat: validate Phase 1A visual artifacts"
~~~

---

### Task 3: Generate and qualify the synthetic three-view references

**Files:**
- Private: var/phase-1a/synthetic-cat-01/identity/identity-card.json
- Private: var/phase-1a/synthetic-cat-01/prompts/reference-master.md
- Private: var/phase-1a/synthetic-cat-01/references/three-view-master.png
- Private: var/phase-1a/synthetic-cat-01/references/{front,cat-left-front-45,cat-right-front-45}.png
- Private: var/phase-1a/synthetic-cat-01/reviews/reference-consistency.json

**Interfaces:**
- Consumes: committed identity card, exact reference prompt, split CLI, imagegen skill and tool.
- Produces: one accepted reference set and an independent PASS review.
- Failure: after three rejected masters, stop with STOP_REVISE_STYLE; do not generate character candidates.

- [ ] **Step 1: Create the private run tree and copy frozen inputs**

Run:

~~~bash
mkdir -p var/phase-1a/synthetic-cat-01/identity var/phase-1a/synthetic-cat-01/prompts var/phase-1a/synthetic-cat-01/references var/phase-1a/synthetic-cat-01/reviews var/phase-1a/synthetic-cat-01/candidates var/phase-1a/synthetic-cat-01/selected
cp experiments/codex_visual_prototype/identity-card.json var/phase-1a/synthetic-cat-01/identity/identity-card.json
cp experiments/codex_visual_prototype/prompts/reference-master.md var/phase-1a/synthetic-cat-01/prompts/reference-master.md
~~~

Run:

~~~bash
git status --short
~~~

Expected: no var/ path appears.

- [ ] **Step 2: Dispatch the bounded identity subagent**

Give a fresh subagent only the approved design, identity-card.json and reference-master.md. Its response must list the frozen traits and explicitly state:

~~~text
CAT_LEFT and CAT_RIGHT are anatomical directions.
No identity field or reference-view order changed.
READY_FOR_THREE_VIEW_GENERATION
~~~

If it proposes a different coat, eye color, marking, accessory or view order, reject the response and do not call image generation.

- [ ] **Step 3: Dispatch the three-view generation subagent**

The generation agent must read the imagegen skill, generate a brand-new image from the exact reference-master.md text, and must not use three separate calls. Read the local prompt file completely and pass its byte-for-byte contents as the imagegen prompt. Omit referenced_image_paths because this is a new synthetic identity; do not abbreviate or paraphrase the prompt.

Persist the returned local image as:

~~~text
var/phase-1a/synthetic-cat-01/references/three-view-master.png
~~~

If the tool does not return a usable local image file, stop and report the limitation; do not claim the artifact exists and do not reconstruct it from a screenshot.

- [ ] **Step 4: Split and mechanically validate the master**

Run:

~~~bash
.venv/bin/python tools/visual_prototype.py split var/phase-1a/synthetic-cat-01/references/three-view-master.png var/phase-1a/synthetic-cat-01/references
~~~

Expected on an acceptable master: exit 0; output lists FRONT, CAT_LEFT_FRONT_45, CAT_RIGHT_FRONT_45 in that order, each at least 512×512.

Use view_image on the master and all three crops. The root agent must directly check full-body visibility, orientation and obvious anatomy; it cannot rely only on the generation agent.

If split exits 2, write an actual failed reference-consistency.json naming the mechanical violation, count the whole master as rejected, and retry the whole-sheet call. This preserves a valid STOP manifest even when no crop set was accepted.

- [ ] **Step 5: Dispatch an independent reference reviewer**

Give a fresh review agent the identity card, three crops and the example review schema. Do not give it character prompts or later candidate information. It writes actual booleans and concrete notes to:

~~~text
var/phase-1a/synthetic-cat-01/reviews/reference-consistency.json
~~~

PASS is legal only when all six required booleans are true and violations is empty. Any false value rejects the whole master. On rejection, replace the master and all three crops with the next whole-sheet attempt; never repair one panel independently. Stop after attempt three fails.

- [ ] **Step 6: Root-review the accepted references**

Use view_image at original detail on each accepted crop. Confirm that the cat-left eye orange patch and cat-right ear black patch remain on the same anatomical sides, not merely the same screen sides.

Run:

~~~bash
git status --short
~~~

Expected: still no var/ artifact appears.

No Git commit is made for Task 3.

---

### Task 4: Generate three bead candidates and obtain the user gate

**Files:**
- Private: var/phase-1a/synthetic-cat-01/prompts/candidate-{01,02,03}.md
- Private: var/phase-1a/synthetic-cat-01/candidates/candidate-{01,02,03}.png
- Private optional: var/phase-1a/synthetic-cat-01/prompts/correction.md
- Private: var/phase-1a/synthetic-cat-01/selected/character-hd.png

**Interfaces:**
- Consumes: the accepted three reference crops and exact character prompt.
- Produces: one to three alpha-valid candidates, one user selection, and at most one corrected final image.
- Failure: three rejected candidates or a rejected one-round correction produces STOP_REVISE_STYLE.

- [ ] **Step 1: Create exact local prompts for the three bounded variants**

Copy the common identity, pose, transparency and exclusion paragraphs from character-candidates.md into each local prompt. Append exactly one suffix:

~~~text
candidate-01: Use the finest allowed bead density and an identity-first silhouette.
candidate-02: Use medium bead density and slightly stronger plastic depth.
candidate-03: Use medium bead density and a slightly rounder cute silhouette.
~~~

Do not add new accessories, expressions, backgrounds or poses.

- [ ] **Step 2: Dispatch the candidate-generation subagent**

The assigned generation agent must read the imagegen skill and make one tool call per candidate. Every call uses the three local paths var/phase-1a/synthetic-cat-01/references/front.png, var/phase-1a/synthetic-cat-01/references/cat-left-front-45.png and var/phase-1a/synthetic-cat-01/references/cat-right-front-45.png as referenced_image_paths. Read the candidate-specific local prompt completely and pass its byte-for-byte contents as prompt; do not summarize or add a fourth variation.

Persist each returned local file first under reviews/candidate-call-01.png, reviews/candidate-call-02.png or reviews/candidate-call-03.png. A mechanically invalid output still counts toward the maximum of three candidate calls. Only after the corresponding check command exits 0 may the root agent copy it into candidates/candidate-01.png, candidate-02.png or candidate-03.png. This keeps invalid PNGs out of the final candidate manifest without hiding that the call occurred.

- [ ] **Step 3: Validate every returned candidate before presentation**

For each returned call artifact, run:

~~~bash
.venv/bin/python tools/visual_prototype.py check var/phase-1a/synthetic-cat-01/reviews/candidate-call-01.png --require-alpha
~~~

Repeat for call 02 and call 03. Expected: PNG, nonempty real alpha, positive dimensions, SHA-256 output, exit 0.

Use view_image at original detail to reject extra limbs, clipped anatomy, swapped markings, simulated transparency, floating beads or a wrong pose. For each accepted call, copy the image to the matching candidates/candidate-0N.png path and retain its matching prompts/candidate-0N.md. Do not copy invalid calls into candidates/, and do not silently replace an invalid third call with a fourth.

- [ ] **Step 4: Present the user review gate**

Show the accepted three references and every mechanically valid candidate to the user. State which candidate IDs are absent or invalid. Ask the user to select one, reject all, or request one concrete correction to a selected candidate.

This is a blocking user gate. Do not choose on the user's behalf and do not start preview generation before the user responds.

- [ ] **Step 5: Apply at most one user correction**

If the user approves a candidate without correction, copy it to:

~~~text
var/phase-1a/synthetic-cat-01/selected/character-hd.png
~~~

If the user requests one correction, write their exact instruction to prompts/correction.md and use imagegen edit with the selected candidate plus the three references. The edit prompt must say to change only the named issue and preserve all other identity, pose, bead and alpha constraints. Save the edited output as selected/character-hd.png.

Run:

~~~bash
.venv/bin/python tools/visual_prototype.py check var/phase-1a/synthetic-cat-01/selected/character-hd.png --require-alpha
~~~

Expected: exit 0. If the one corrected result is rejected, stop with STOP_REVISE_STYLE; do not perform a second correction.

No Git commit is made for Task 4.

---

### Task 5: Create the visual proxy, immutable manifest and final decision

**Files:**
- Private: var/phase-1a/synthetic-cat-01/selected/preview-58.png
- Private: var/phase-1a/synthetic-cat-01/selected/preview-464.png
- Private: var/phase-1a/synthetic-cat-01/manifest.json

**Interfaces:**
- Consumes: accepted references, review, candidates, user decision and final character.
- Produces: VISUAL_PROTOTYPE_PASS or STOP_REVISE_STYLE with hash-verified local evidence.
- Failure: any missing/hash-mismatched artifact, leaked absolute path, more than three candidates or more than one correction exits 2.

- [ ] **Step 1: Generate the two deterministic previews for PASS**

Only after user approval, run:

~~~bash
.venv/bin/python tools/visual_prototype.py preview var/phase-1a/synthetic-cat-01/selected/character-hd.png var/phase-1a/synthetic-cat-01/selected
~~~

Expected: preview-58.png is 58×58 with real alpha; preview-464.png is its exact 8× nearest-neighbor enlargement.

Use view_image on preview-464.png and ask the user to confirm the outline and main markings remain recognizable. This confirmation is part of the same final visual gate, not a second correction allowance.

- [ ] **Step 2: Build a PASS manifest**

Substitute the actual accepted candidate ID, master attempt count, and correction count:

~~~bash
.venv/bin/python tools/visual_prototype.py manifest var/phase-1a/synthetic-cat-01 --master-attempts 1 --decision VISUAL_PROTOTYPE_PASS --selected candidate-01 --approved --correction-count 0
~~~

Expected: exit 0 and a complete JSON printout. The written manifest contains only relative paths and hashes.

For STOP_REVISE_STYLE, do not fabricate selected files or previews. Run:

~~~bash
.venv/bin/python tools/visual_prototype.py manifest var/phase-1a/synthetic-cat-01 --master-attempts 3 --decision STOP_REVISE_STYLE --correction-count 0
~~~

Expected: exit 0 only when selection.approved is false; the manifest records STOP without a final block.

- [ ] **Step 3: Re-verify the completed manifest**

Run:

~~~bash
.venv/bin/python tools/visual_prototype.py verify var/phase-1a/synthetic-cat-01/manifest.json var/phase-1a/synthetic-cat-01
~~~

Expected: exit 0; all referenced files exist and match SHA-256; no absolute path, key, token, Base64 image or escaped path exists.

- [ ] **Step 4: Verify repository isolation and full baseline**

Run:

~~~bash
git status --short
git ls-files var
make check
git diff --check
~~~

Expected:

- git status shows no var/ files.
- git ls-files var prints nothing.
- Python, Web, typecheck, OpenAPI contract and build checks pass.
- diff check exits 0.

- [ ] **Step 5: Report the exact Phase 1A result**

For PASS, report:

~~~text
VISUAL_PROTOTYPE_PASS
Synthetic references only.
User approved the selected identity and 58x58 visual proxy.
No real-pet, provider, production latency, cost, or Web automation claim is made.
~~~

For STOP, report:

~~~text
STOP_REVISE_STYLE
No layered asset, animation, Web flow, or provider phase may start from this run.
The next action is a written identity/style revision approved by the user.
~~~

Keep the branch and worktree alive for review. Do not push, merge, delete the branch or remove the worktree until the user chooses the finishing workflow.
