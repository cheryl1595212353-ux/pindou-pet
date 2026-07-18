# Phase 1B Local Alpha Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and privately validate an offline, deterministic, pixel-preserving alpha pipeline that turns the immutable RGB Candidate 03 into a true-transparent pixel character without regenerating or redrawing the cat.

**Architecture:** A license-audited local ONNX foreground model produces an automatic binary `FOREGROUND` mask. At most one mask-only correction may replace that mask; a deterministic compositor copies source RGB only where alpha is `255`, canonicalizes transparent RGB to black, reuses the existing nearest-neighbor preview renderer, and binds every artifact and decision into a private relative-path manifest. The run cannot pass without mechanical checks, independent visual review, and the user's exact `LOCAL_ALPHA_PASS` decision.

**Tech Stack:** Python 3.12, Pillow, NumPy, ONNX Runtime CPU, Pydantic v2, pytest, Ruff, existing `tools.visual_prototype` PNG/preview helpers; private media and model weights under ignored `var/`.

## Global Constraints

- The approved design is `docs/superpowers/specs/2026-07-18-pindou-pet-phase-1b-local-alpha-design.md`; implementation may not weaken it.
- The only accepted source is `candidate-call-03.png`, SHA-256 `b9966dd94dcbf29ec1cbd11beba308b7397dc3a3cc11fea547e82c4ffc9333fa`, size `1254×1254`, mode RGB.
- Do not call `image_gen`, an image-generation CLI, a paid API, or a user API key. Do not create a fourth candidate or reset Phase 1A call counts.
- `FOREGROUND` remains independent evidence and must not be added to the six-value `PartLabel` enum or the Phase 0 `SegmentationProvider` contract.
- The automatic and optional corrected masks contain only `0` and `255`. A second distinct corrected mask is forbidden.
- The output remains `1254×1254`. For every final-mask `255` coordinate, output RGB equals source RGB byte-for-byte. For every final-mask `0` coordinate, output RGB is `(0, 0, 0)`.
- No crop, translation, recolor, denoise, sharpening, edge feathering, antialiasing, RGB repair, or generative completion is allowed.
- A qualifying model must run locally with networking disabled, have a project-compatible license, and be bound by exact version, model SHA-256, audit SHA-256, tensor contract, preprocessing, postprocessing, and threshold.
- Freeze the binary threshold in the public audit before running Candidate 03. Use the publisher's documented threshold when present; otherwise freeze `0.5`. Never tune it after viewing the private result.
- The checkerboard color-key baseline is diagnostic only and cannot produce `LOCAL_ALPHA_PASS`.
- Real media, real masks, private manifests, model binaries, absolute user paths, Base64, data URIs, keys, tokens, and reviewer identities stay outside Git and logs.
- Phase 1B PASS closes only the alpha blocker. It does not qualify a production `GenerationProvider`, the full three-cat Phase 1 gate, or Phase 2.
- Every implementation task follows RED → verify expected failure → minimal GREEN → focused tests → commit → fresh review.
- Use only `.venv/bin/python`, `uv`, `pnpm`, and existing repository commands. Run `make check` before any completion claim.

## File Map

### Tracked files

- Modify: `docs/superpowers/specs/2026-07-18-pindou-pet-phase-1b-local-alpha-design.md` — preserve the user's approval status.
- Create: `docs/superpowers/plans/2026-07-18-pindou-pet-phase-1b-local-alpha.md` — this implementation plan.
- Create: `docs/feasibility/local-alpha-model-audit.md` — official source/license/runtime audit and PASS/STOP decision.
- Create after the private gate: `docs/feasibility/local-alpha-prototype-result.md` — sanitized outcome only.
- Modify after audit PASS: `pyproject.toml` and `uv.lock` — add NumPy and ONNX Runtime CPU.
- Create: `tools/local_alpha/__init__.py` — public package exports only.
- Create: `tools/local_alpha/models.py` — strict model, artifact evidence, review, and decision types.
- Create: `tools/local_alpha/compositor.py` — binary-mask validation, RGB-preserving composition, hashes, and previews.
- Create: `tools/local_alpha/onnx_foreground.py` — manifest-bound CPU ONNX inference and binary thresholding.
- Create: `tools/local_alpha/evidence.py` — relative artifact binding, privacy scanning, manifest build/verify.
- Create: `tools/local_alpha/cli.py` — bounded commands for model verification, segmentation, correction import, composition, previews, manifest, and verification.
- Create: `experiments/local_alpha/README.md` — public/private boundary and exact command sequence.
- Create: `experiments/local_alpha/model-manifest.example.json` — synthetic schema example only.
- Create: `experiments/local_alpha/final-review.example.json` — exact review shape and derivation.
- Create: `tests/unit/tools/local_alpha/test_models.py` — strict schemas and model/audit binding.
- Create: `tests/unit/tools/local_alpha/test_compositor.py` — binary alpha and byte-preservation tests.
- Create: `tests/unit/tools/local_alpha/test_onnx_foreground.py` — fake-session preprocessing/output tests.
- Create: `tests/unit/tools/local_alpha/test_evidence.py` — correction count, privacy, manifest, and provenance tests.
- Create: `tests/unit/tools/local_alpha/test_cli.py` — subprocess exit-code and bounded-command tests.

### Private ignored files

- `var/models/local-alpha/model.onnx`
- `var/models/local-alpha/model-manifest.json`
- `var/phase-1b/synthetic-cat-01-local-alpha/**`

No Web/API route, `apps/api/src/pindou_pet/domain/providers.py`, public OpenAPI, database, queue, Phase 2, editor, animation, or export file belongs in this plan.

---

### Task 1: Hard-gate the local model and freeze strict evidence contracts

**Files:**
- Create: `docs/feasibility/local-alpha-model-audit.md`
- Create: `tools/local_alpha/__init__.py`
- Create: `tools/local_alpha/models.py`
- Create: `experiments/local_alpha/README.md`
- Create: `experiments/local_alpha/model-manifest.example.json`
- Create: `experiments/local_alpha/final-review.example.json`
- Test: `tests/unit/tools/local_alpha/test_models.py`

**Interfaces:**
- Produces: `LocalAlphaModelManifest`, `MaskEvidence`, `CompositionEvidence`, `FinalCharacterReview`, `RunDecision`, `UserDecision`, and `MechanicalStop`.
- Produces: `load_verified_model_manifest(manifest_path: Path, model_path: Path, audit_path: Path) -> LocalAlphaModelManifest`.
- Produces: `validate_final_review(review: FinalCharacterReview, *, require_pass: bool) -> None`.
- Failure: a license/source/runtime uncertainty records `decision: STOP_NO_QUALIFYING_LOCAL_MODEL`; later tasks do not run.

- [ ] **Step 1: Audit official model and license sources before downloading weights or adding dependencies**

Use only the model publisher's repository/model card, the actual license text, and ONNX Runtime's official compatibility information. `docs/feasibility/local-alpha-model-audit.md` must contain exactly one candidate table with these columns:

```text
model name | immutable version | official source URL | weights URL |
license ID | license URL | commercial/project use allowed |
ONNX supplied by publisher | CPU provider supported | Python 3.12/macOS arm64 supported |
input tensor | output tensor | preprocessing | output semantics |
documented threshold or frozen 0.5 fallback | decision
```

The document must end with exactly one of:

For PASS, the last three lines are `decision: PASS`, then `selectedModel:` followed by
the exact publisher model name, then `selectedVersion:` followed by the immutable tag
or commit. Values copied from marketing aliases or mutable `latest` labels are invalid.

or:

```text
decision: STOP_NO_QUALIFYING_LOCAL_MODEL
```

PASS requires all license/runtime/tensor cells to be evidenced and true, and the selected candidate must provide one publisher-supplied ONNX file that can be stored privately as `model.onnx` and satisfies the fixed NCHW single-channel contract used below. Do not infer that a code repository's license automatically covers separately hosted weights. On STOP, commit only this audit, do not download a model or change dependencies, and end Phase 1B. Continue to Step 2 only after the audit records PASS.

- [ ] **Step 2: Write RED schema and hash-binding tests**

Create `tests/unit/tools/local_alpha/test_models.py` with these core cases:

```python
import hashlib
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from tools.local_alpha.models import (
    FinalCharacterReview,
    LocalAlphaModelManifest,
    MechanicalStop,
    UserDecision,
    load_verified_model_manifest,
    validate_final_review,
)


def valid_manifest(model: bytes, audit: bytes) -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "auditDecision": "PASS",
        "auditSha256": hashlib.sha256(audit).hexdigest(),
        "modelName": "synthetic-local-alpha",
        "modelVersion": "test-v1",
        "modelFileName": "model.onnx",
        "modelSha256": hashlib.sha256(model).hexdigest(),
        "sourceUrl": "https://example.invalid/synthetic-local-alpha",
        "licenseId": "Apache-2.0",
        "licenseUrl": "https://example.invalid/LICENSE",
        "inputName": "input",
        "inputWidth": 4,
        "inputHeight": 4,
        "inputLayout": "NCHW",
        "inputDtype": "float32",
        "mean": [0.5, 0.5, 0.5],
        "std": [0.5, 0.5, 0.5],
        "outputName": "mask",
        "outputLayout": "NCHW_SINGLE_CHANNEL",
        "outputActivation": "PROBABILITY",
        "threshold": 0.5,
    }


def test_manifest_requires_exact_schema_and_pass_decision() -> None:
    payload = valid_manifest(b"model", b"decision: PASS\n")
    assert LocalAlphaModelManifest.model_validate(payload).schema_version == 1
    for invalid in (True, 1.0, "1", None):
        payload["schemaVersion"] = invalid
        with pytest.raises(ValidationError):
            LocalAlphaModelManifest.model_validate(payload)


def test_loader_rejects_model_or_audit_hash_drift(tmp_path: Path) -> None:
    model = tmp_path / "model.onnx"
    audit = tmp_path / "audit.md"
    manifest = tmp_path / "manifest.json"
    model.write_bytes(b"model")
    audit.write_bytes(b"decision: PASS\n")
    manifest.write_text(json.dumps(valid_manifest(model.read_bytes(), audit.read_bytes())))

    load_verified_model_manifest(manifest, model, audit)
    model.write_bytes(b"changed")
    with pytest.raises(ValueError, match="model SHA-256"):
        load_verified_model_manifest(manifest, model, audit)


def test_final_review_pass_is_derived_not_claimed() -> None:
    payload = {
        "schemaVersion": 1,
        "foregroundComplete": True,
        "markingsStable": True,
        "noBackgroundResidue": True,
        "noInternalHoles": True,
        "noEdgeHalo": True,
        "pixelGridStable": True,
        "noRedrawOrResampling": True,
        "pass": True,
        "violations": [],
        "notes": "Synthetic passing review.",
    }
    review = FinalCharacterReview.model_validate(payload)
    validate_final_review(review, require_pass=True)
    payload["noEdgeHalo"] = False
    with pytest.raises(ValidationError, match="pass"):
        FinalCharacterReview.model_validate(payload)


@pytest.mark.parametrize("invalid", [True, 1.0, "1", None])
def test_review_and_decisions_require_exact_schema_version(invalid: object) -> None:
    review = {
        "schemaVersion": invalid,
        "foregroundComplete": True,
        "markingsStable": True,
        "noBackgroundResidue": True,
        "noInternalHoles": True,
        "noEdgeHalo": True,
        "pixelGridStable": True,
        "noRedrawOrResampling": True,
        "pass": True,
        "violations": [],
        "notes": "Synthetic review.",
    }
    with pytest.raises(ValidationError, match="schemaVersion"):
        FinalCharacterReview.model_validate(review)

    decision = {
        "schemaVersion": invalid,
        "decision": "LOCAL_ALPHA_PASS",
        "userStatement": "LOCAL_ALPHA_PASS",
        "correctionCount": 0,
        "sourceSha256": "a" * 64,
    }
    with pytest.raises(ValidationError, match="schemaVersion"):
        UserDecision.model_validate(decision)

    stop = {
        "schemaVersion": invalid,
        "decision": "STOP_ALPHA_EXTRACTION",
        "stopReason": "Synthetic mechanical failure.",
        "correctionCount": 0,
        "sourceSha256": "a" * 64,
    }
    with pytest.raises(ValidationError, match="schemaVersion"):
        MechanicalStop.model_validate(stop)
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
.venv/bin/python -m pytest tests/unit/tools/local_alpha/test_models.py -q
```

Expected: collection fails because `tools.local_alpha.models` does not exist. The failure must not be a missing dependency or malformed test.

- [ ] **Step 4: Implement the strict models and verification seam**

Create `tools/local_alpha/models.py` around these exact public types and aliases:

```python
from __future__ import annotations

import hashlib
from enum import StrEnum
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class FrozenModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


def require_schema_version_one(value: object) -> int:
    if type(value) is not int or value != 1:
        raise ValueError("schemaVersion must be exact integer 1")
    return value


class LocalAlphaModelManifest(FrozenModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    audit_decision: Literal["PASS"] = Field(alias="auditDecision")
    audit_sha256: str = Field(alias="auditSha256", pattern=r"^[0-9a-f]{64}$")
    model_name: str = Field(alias="modelName", min_length=1)
    model_version: str = Field(alias="modelVersion", min_length=1)
    model_file_name: Literal["model.onnx"] = Field(alias="modelFileName")
    model_sha256: str = Field(alias="modelSha256", pattern=r"^[0-9a-f]{64}$")
    source_url: str = Field(alias="sourceUrl", pattern=r"^https://")
    license_id: str = Field(alias="licenseId", min_length=1)
    license_url: str = Field(alias="licenseUrl", pattern=r"^https://")
    input_name: str = Field(alias="inputName", min_length=1)
    input_width: int = Field(alias="inputWidth", gt=0)
    input_height: int = Field(alias="inputHeight", gt=0)
    input_layout: Literal["NCHW"] = Field(alias="inputLayout")
    input_dtype: Literal["float32"] = Field(alias="inputDtype")
    mean: tuple[float, float, float]
    std: tuple[float, float, float]
    output_name: str = Field(alias="outputName", min_length=1)
    output_layout: Literal["NCHW_SINGLE_CHANNEL"] = Field(alias="outputLayout")
    output_activation: Literal["PROBABILITY", "LOGIT"] = Field(alias="outputActivation")
    threshold: float = Field(gt=0.0, lt=1.0)

    _exact_schema = field_validator("schema_version", mode="before")(
        require_schema_version_one
    )

    @model_validator(mode="after")
    def validate_std(self) -> "LocalAlphaModelManifest":
        if any(value <= 0 for value in self.std):
            raise ValueError("std values must be positive")
        return self


class MaskEvidence(FrozenModel):
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    foreground_pixels: int = Field(alias="foregroundPixels", gt=0)
    alpha_values: tuple[Literal[0, 255], ...] = Field(alias="alphaValues")

    @model_validator(mode="after")
    def validate_alpha_values(self) -> "MaskEvidence":
        if self.alpha_values != (0, 255):
            raise ValueError("mask alphaValues must be exactly [0, 255]")
        return self


class CompositionEvidence(FrozenModel):
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    source_foreground_rgb_sha256: str = Field(
        alias="sourceForegroundRgbSha256", pattern=r"^[0-9a-f]{64}$"
    )
    output_foreground_rgb_sha256: str = Field(
        alias="outputForegroundRgbSha256", pattern=r"^[0-9a-f]{64}$"
    )
    alpha_sha256: str = Field(alias="alphaSha256", pattern=r"^[0-9a-f]{64}$")
    alpha_values: tuple[Literal[0, 255], ...] = Field(alias="alphaValues")

    @model_validator(mode="after")
    def validate_alpha_values(self) -> "CompositionEvidence":
        if self.alpha_values != (0, 255):
            raise ValueError("composition alphaValues must be exactly [0, 255]")
        if self.source_foreground_rgb_sha256 != self.output_foreground_rgb_sha256:
            raise ValueError("foreground RGB hashes must match")
        return self


class FinalCharacterReview(FrozenModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    foreground_complete: bool = Field(alias="foregroundComplete")
    markings_stable: bool = Field(alias="markingsStable")
    no_background_residue: bool = Field(alias="noBackgroundResidue")
    no_internal_holes: bool = Field(alias="noInternalHoles")
    no_edge_halo: bool = Field(alias="noEdgeHalo")
    pixel_grid_stable: bool = Field(alias="pixelGridStable")
    no_redraw_or_resampling: bool = Field(alias="noRedrawOrResampling")
    passed: bool = Field(alias="pass")
    violations: tuple[str, ...]
    notes: str = Field(min_length=1)

    _exact_schema = field_validator("schema_version", mode="before")(
        require_schema_version_one
    )

    @model_validator(mode="after")
    def derive_pass(self) -> "FinalCharacterReview":
        flags = (
            self.foreground_complete,
            self.markings_stable,
            self.no_background_residue,
            self.no_internal_holes,
            self.no_edge_halo,
            self.pixel_grid_stable,
            self.no_redraw_or_resampling,
        )
        if self.passed != (all(flags) and not self.violations):
            raise ValueError("review pass derivation is invalid")
        return self


class RunDecision(StrEnum):
    PASS = "LOCAL_ALPHA_PASS"
    STOP = "STOP_ALPHA_EXTRACTION"


class UserDecision(FrozenModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    decision: RunDecision
    user_statement: str = Field(alias="userStatement", min_length=1)
    correction_count: Literal[0, 1] = Field(alias="correctionCount")
    source_sha256: str = Field(alias="sourceSha256", pattern=r"^[0-9a-f]{64}$")

    _exact_schema = field_validator("schema_version", mode="before")(
        require_schema_version_one
    )

    @model_validator(mode="after")
    def validate_statement(self) -> "UserDecision":
        if self.user_statement != self.decision.value:
            raise ValueError("userStatement must equal the explicit user decision")
        return self


class MechanicalStop(FrozenModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    decision: Literal["STOP_ALPHA_EXTRACTION"]
    stop_reason: str = Field(alias="stopReason", min_length=1)
    correction_count: Literal[0, 1] = Field(alias="correctionCount")
    source_sha256: str = Field(alias="sourceSha256", pattern=r"^[0-9a-f]{64}$")

    _exact_schema = field_validator("schema_version", mode="before")(
        require_schema_version_one
    )


def load_verified_model_manifest(
    manifest_path: Path, model_path: Path, audit_path: Path
) -> LocalAlphaModelManifest:
    manifest = LocalAlphaModelManifest.model_validate_json(manifest_path.read_text())
    if model_path.name != manifest.model_file_name:
        raise ValueError("model file name does not match manifest")
    if sha256_file(model_path) != manifest.model_sha256:
        raise ValueError("model SHA-256 does not match manifest")
    if sha256_file(audit_path) != manifest.audit_sha256:
        raise ValueError("audit SHA-256 does not match manifest")
    return manifest


def validate_final_review(review: FinalCharacterReview, *, require_pass: bool) -> None:
    if require_pass and not review.passed:
        raise ValueError("final review must pass")
```

Export only the stable public names from `tools/local_alpha/__init__.py`. Do not add `FOREGROUND` to the product domain enum.

- [ ] **Step 5: Add public examples with unmistakably synthetic values**

`experiments/local_alpha/model-manifest.example.json` uses the exact JSON aliases above, `example.invalid` URLs, and a synthetic 64-zero hash. `experiments/local_alpha/final-review.example.json` contains every review flag, derived `pass: true`, an empty `violations` array, and notes that it is schema-only. `experiments/local_alpha/README.md` states that real images, masks, manifests, model weights, user decisions, and paths remain in `var/`.

- [ ] **Step 6: Run focused tests, full checks, and commit**

Run:

```bash
.venv/bin/python -m pytest tests/unit/tools/local_alpha/test_models.py -q
.venv/bin/python -m ruff check tools/local_alpha tests/unit/tools/local_alpha
make check
git diff --check
git status --short
```

Expected: all new tests pass; existing Python result remains at least `57 passed, 1 skipped`; Web tests/typecheck/build pass; only planned tracked files appear and no `var/` file appears.

Commit:

```bash
git add docs/feasibility/local-alpha-model-audit.md \
  experiments/local_alpha tools/local_alpha/__init__.py \
  tools/local_alpha/models.py tests/unit/tools/local_alpha/test_models.py
git commit -m "feat: hard-gate local alpha model evidence"
```

Fresh task review must approve the audit decision, strict aliases, exact schema integer checks, model/audit hashes, and no domain/API change before Task 2.

---

### Task 2: Build the deterministic pixel-preserving compositor

**Files:**
- Create: `tools/local_alpha/compositor.py`
- Create: `tests/unit/tools/local_alpha/test_compositor.py`

**Interfaces:**
- Consumes: any same-size RGB/RGBA PNG plus a mode-`L` binary mask.
- Produces: `validate_binary_mask(mask_path: Path, expected_size: tuple[int, int]) -> MaskEvidence`.
- Produces: `compose_character(source_path: Path, mask_path: Path, output_path: Path) -> CompositionEvidence`.
- Produces: `render_alpha_previews(character_path: Path, output_dir: Path) -> tuple[Path, Path]` by delegating to `tools.visual_prototype.render_previews`.
- Produces: `render_review_diagnostics(source_path: Path, mask_path: Path, output_dir: Path) -> dict[str, Path]` for alpha overlay plus white/black/magenta review backgrounds, composed in memory without writing a character asset.
- Failure: wrong size/mode, non-binary alpha, empty/full-only mask, foreground RGB drift, transparent RGB residue, or nondeterministic output.

- [ ] **Step 1: Write RED compositor tests with in-test synthetic fixtures**

Create `tests/unit/tools/local_alpha/test_compositor.py` with these behaviors:

```python
import hashlib
from pathlib import Path

import pytest
from PIL import Image

from tools.local_alpha.compositor import (
    compose_character,
    render_alpha_previews,
    render_review_diagnostics,
    validate_binary_mask,
)


def write_synthetic_fixture(root: Path) -> tuple[Path, Path]:
    source = root / "source.png"
    mask = root / "mask.png"
    image = Image.new("RGB", (16, 16))
    image.putdata(
        [
            (220, 220, 220) if (x // 2 + y // 2) % 2 == 0 else (180, 180, 180)
            for y in range(16)
            for x in range(16)
        ]
    )
    for y in range(4, 13):
        for x in range(5, 12):
            image.putpixel((x, y), (240, 150, 40))
    image.save(source, format="PNG")
    alpha = Image.new("L", (16, 16), 0)
    for y in range(4, 13):
        for x in range(5, 12):
            alpha.putpixel((x, y), 255)
    alpha.save(mask, format="PNG")
    return source, mask


def test_rejects_non_binary_or_wrong_size_mask(tmp_path: Path) -> None:
    mask = tmp_path / "mask.png"
    Image.new("L", (4, 4), 128).save(mask)
    with pytest.raises(ValueError, match="only 0 and 255"):
        validate_binary_mask(mask, (4, 4))
    Image.new("L", (3, 4), 255).save(mask)
    with pytest.raises(ValueError, match="dimensions"):
        validate_binary_mask(mask, (4, 4))


def test_compositor_preserves_foreground_rgb_and_zeroes_transparent_rgb(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source.png"
    mask = tmp_path / "mask.png"
    output = tmp_path / "character.png"
    image = Image.new("RGB", (2, 2))
    image.putdata([(1, 2, 3), (10, 20, 30), (40, 50, 60), (70, 80, 90)])
    image.save(source)
    alpha = Image.new("L", (2, 2))
    alpha.putdata([0, 255, 255, 0])
    alpha.save(mask)

    evidence = compose_character(source, mask, output)
    with Image.open(output) as result:
        assert result.mode == "RGBA"
        assert list(result.getdata()) == [
            (0, 0, 0, 0),
            (10, 20, 30, 255),
            (40, 50, 60, 255),
            (0, 0, 0, 0),
        ]
    assert evidence.source_foreground_rgb_sha256 == (
        evidence.output_foreground_rgb_sha256
    )
    assert evidence.alpha_values == (0, 255)


def test_composition_and_previews_are_byte_deterministic(tmp_path: Path) -> None:
    source, mask = write_synthetic_fixture(tmp_path)
    first = tmp_path / "first.png"
    second = tmp_path / "second.png"
    compose_character(source, mask, first)
    compose_character(source, mask, second)
    assert hashlib.sha256(first.read_bytes()).digest() == hashlib.sha256(
        second.read_bytes()
    ).digest()

    preview_58, preview_464 = render_alpha_previews(first, tmp_path / "preview")
    with Image.open(preview_58) as small, Image.open(preview_464) as large:
        assert small.size == (58, 58)
        assert large.size == (464, 464)
        assert large.resize((58, 58), Image.Resampling.NEAREST).tobytes() == (
            small.tobytes()
        )


def test_review_diagnostics_do_not_modify_source(tmp_path: Path) -> None:
    source, mask = write_synthetic_fixture(tmp_path)
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    diagnostics = render_review_diagnostics(source, mask, tmp_path / "diagnostics")
    assert set(diagnostics) == {"alphaOverlay", "onWhite", "onBlack", "onMagenta"}
    assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
    for path in diagnostics.values():
        with Image.open(path) as diagnostic:
            assert diagnostic.size == (16, 16)
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
.venv/bin/python -m pytest tests/unit/tools/local_alpha/test_compositor.py -q
```

Expected: collection fails because `tools.local_alpha.compositor` does not exist.

- [ ] **Step 3: Implement exact binary-mask composition**

Create `tools/local_alpha/compositor.py` with no NumPy or model dependency:

```python
from __future__ import annotations

import hashlib
import os
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from tools.local_alpha.models import CompositionEvidence, MaskEvidence, sha256_file
from tools.visual_prototype import render_previews


def _save_atomic(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    image.save(temporary, format="PNG", optimize=False)
    os.replace(temporary, path)


def validate_binary_mask(mask_path: Path, expected_size: tuple[int, int]) -> MaskEvidence:
    try:
        with Image.open(mask_path) as opened:
            if opened.format != "PNG" or opened.mode != "L":
                raise ValueError("mask must be a mode-L PNG")
            opened.load()
            if opened.size != expected_size:
                raise ValueError("mask dimensions do not match source")
            values = tuple(sorted(set(opened.getdata())))
            if set(values) != {0, 255}:
                raise ValueError("mask may contain only 0 and 255 and must contain both")
            foreground_pixels = opened.histogram()[255]
    except (OSError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise ValueError("mask is not a readable PNG") from exc
    return MaskEvidence(
        sha256=sha256_file(mask_path),
        width=expected_size[0],
        height=expected_size[1],
        foregroundPixels=foreground_pixels,
        alphaValues=values,
    )


def _foreground_rgb_bytes(rgb: Image.Image, mask: Image.Image) -> bytes:
    output = bytearray()
    for pixel, alpha in zip(rgb.getdata(), mask.getdata(), strict=True):
        if alpha == 255:
            output.extend(pixel)
    return bytes(output)


def compose_character(
    source_path: Path, mask_path: Path, output_path: Path
) -> CompositionEvidence:
    with Image.open(source_path) as opened:
        if opened.format != "PNG":
            raise ValueError("source must be PNG")
        opened.load()
        rgb = opened.convert("RGB")
    validate_binary_mask(mask_path, rgb.size)
    with Image.open(mask_path) as opened_mask:
        mask = opened_mask.copy()

    source_foreground = _foreground_rgb_bytes(rgb, mask)
    output = Image.new("RGBA", rgb.size, (0, 0, 0, 0))
    foreground = Image.merge("RGBA", (*rgb.split(), Image.new("L", rgb.size, 255)))
    output.paste(foreground, (0, 0), mask)
    _save_atomic(output, output_path)

    with Image.open(output_path) as verified:
        verified.load()
        output_rgb = verified.convert("RGB")
        output_alpha = verified.getchannel("A")
        output_foreground = _foreground_rgb_bytes(output_rgb, output_alpha)
        transparent_rgb = {
            pixel
            for pixel, alpha in zip(
                output_rgb.getdata(), output_alpha.getdata(), strict=True
            )
            if alpha == 0
        }
        if transparent_rgb != {(0, 0, 0)}:
            raise ValueError("transparent RGB must be canonical black")

    source_hash = hashlib.sha256(source_foreground).hexdigest()
    output_hash = hashlib.sha256(output_foreground).hexdigest()
    if source_hash != output_hash:
        raise ValueError("foreground RGB changed during composition")
    alpha_values = tuple(sorted(set(output_alpha.getdata())))
    return CompositionEvidence(
        sha256=sha256_file(output_path),
        width=output.width,
        height=output.height,
        sourceForegroundRgbSha256=source_hash,
        outputForegroundRgbSha256=output_hash,
        alphaSha256=hashlib.sha256(output_alpha.tobytes()).hexdigest(),
        alphaValues=alpha_values,
    )


def render_alpha_previews(
    character_path: Path, output_dir: Path
) -> tuple[Path, Path]:
    return render_previews(character_path, output_dir)


def render_review_diagnostics(
    source_path: Path,
    mask_path: Path,
    output_dir: Path,
) -> dict[str, Path]:
    with Image.open(source_path) as opened_source:
        source = opened_source.convert("RGB")
    validate_binary_mask(mask_path, source.size)
    with Image.open(mask_path) as opened_mask:
        mask = opened_mask.copy()
    character = Image.new("RGBA", source.size, (0, 0, 0, 0))
    foreground = Image.merge(
        "RGBA", (*source.split(), Image.new("L", source.size, 255))
    )
    character.paste(foreground, (0, 0), mask)

    output_dir.mkdir(parents=True, exist_ok=True)
    overlay = source.convert("RGBA")
    overlay.paste(
        Image.new("RGBA", source.size, (255, 0, 255, 255)),
        (0, 0),
        ImageOps.invert(mask),
    )
    outputs = {"alphaOverlay": output_dir / "alpha-overlay.png"}
    _save_atomic(overlay, outputs["alphaOverlay"])
    for key, filename, color in (
        ("onWhite", "on-white.png", (255, 255, 255, 255)),
        ("onBlack", "on-black.png", (0, 0, 0, 255)),
        ("onMagenta", "on-magenta.png", (255, 0, 255, 255)),
    ):
        canvas = Image.new("RGBA", character.size, color)
        canvas.alpha_composite(character)
        outputs[key] = output_dir / filename
        _save_atomic(canvas, outputs[key])
    return outputs
```

If Pillow deprecation warnings require `list(image.getdata())`, make that narrow change without changing ordering or values.

- [ ] **Step 4: Run focused and full tests, then commit**

Run:

```bash
.venv/bin/python -m pytest tests/unit/tools/local_alpha/test_compositor.py -q
.venv/bin/python -m pytest tests/unit/tools/local_alpha -q
.venv/bin/python -m ruff check tools/local_alpha tests/unit/tools/local_alpha
make check
git diff --check
```

Expected: all focused tests pass; full repository remains green.

Commit:

```bash
git add tools/local_alpha/compositor.py \
  tests/unit/tools/local_alpha/test_compositor.py
git commit -m "feat: compose pixel-preserving alpha characters"
```

Fresh task review must independently inspect a synthetic output and verify binary alpha, foreground RGB equality, black transparent RGB, deterministic bytes, and nearest-neighbor previews.

---

### Task 3: Run a manifest-bound local ONNX foreground model

**Files:**
- Modify after Task 1 audit PASS: `pyproject.toml`
- Modify after Task 1 audit PASS: `uv.lock`
- Create: `tools/local_alpha/onnx_foreground.py`
- Create: `tests/unit/tools/local_alpha/test_onnx_foreground.py`

**Interfaces:**
- Consumes: a verified `LocalAlphaModelManifest`, `model.onnx`, and source PNG.
- Produces: `LocalOnnxForegroundSegmenter(manifest, model_path, session=None)`.
- Produces: `segment(source_path: Path, output_mask_path: Path) -> MaskEvidence`.
- The injected test session must expose `run(output_names: list[str], inputs: dict[str, numpy.ndarray]) -> list[numpy.ndarray]`; production uses `onnxruntime.InferenceSession(..., providers=["CPUExecutionProvider"])`.
- Failure: unsupported input/output name, shape, dtype, activation, non-finite values, or non-binary saved mask.

- [ ] **Step 1: Add runtime dependencies only after the audit PASS**

Add to `[project].dependencies` in `pyproject.toml`:

```toml
  "numpy>=2,<3",
  "onnxruntime>=1.20,<2",
```

Then run:

```bash
uv lock
uv sync --frozen --extra dev
.venv/bin/python -c "import numpy, onnxruntime; print(numpy.__version__, onnxruntime.__version__)"
```

Expected: imports succeed under Python 3.12 on macOS arm64. If no compatible official wheel exists, revert only these dependency edits, record `STOP_NO_QUALIFYING_LOCAL_MODEL`, and stop.

- [ ] **Step 2: Write RED fake-session tests**

Create `tests/unit/tools/local_alpha/test_onnx_foreground.py`:

```python
from pathlib import Path

import numpy as np
from PIL import Image

from tools.local_alpha.models import LocalAlphaModelManifest
from tools.local_alpha.onnx_foreground import LocalOnnxForegroundSegmenter


class FakeSession:
    def __init__(self, output: np.ndarray) -> None:
        self.output = output
        self.inputs: dict[str, np.ndarray] | None = None

    def run(
        self, output_names: list[str], inputs: dict[str, np.ndarray]
    ) -> list[np.ndarray]:
        assert output_names == ["mask"]
        self.inputs = inputs
        return [self.output]


def manifest(*, activation: str = "PROBABILITY") -> LocalAlphaModelManifest:
    return LocalAlphaModelManifest.model_validate(
        {
            "schemaVersion": 1,
            "auditDecision": "PASS",
            "auditSha256": "a" * 64,
            "modelName": "fake",
            "modelVersion": "v1",
            "modelFileName": "model.onnx",
            "modelSha256": "b" * 64,
            "sourceUrl": "https://example.invalid/model",
            "licenseId": "Apache-2.0",
            "licenseUrl": "https://example.invalid/license",
            "inputName": "input",
            "inputWidth": 2,
            "inputHeight": 2,
            "inputLayout": "NCHW",
            "inputDtype": "float32",
            "mean": [0.5, 0.5, 0.5],
            "std": [0.5, 0.5, 0.5],
            "outputName": "mask",
            "outputLayout": "NCHW_SINGLE_CHANNEL",
            "outputActivation": activation,
            "threshold": 0.5,
        }
    )


def test_segment_normalizes_nchw_and_writes_binary_mask(tmp_path: Path) -> None:
    source = tmp_path / "source.png"
    output = tmp_path / "mask.png"
    Image.new("RGB", (2, 2), (255, 128, 0)).save(source)
    session = FakeSession(
        np.array([[[[0.1, 0.9], [0.8, 0.2]]]], dtype=np.float32)
    )
    segmenter = LocalOnnxForegroundSegmenter(
        manifest(), tmp_path / "model.onnx", session=session
    )

    evidence = segmenter.segment(source, output)

    assert session.inputs is not None
    assert session.inputs["input"].shape == (1, 3, 2, 2)
    assert session.inputs["input"].dtype == np.float32
    with Image.open(output) as mask:
        assert mask.mode == "L"
        assert set(mask.getdata()) == {0, 255}
    assert evidence.alpha_values == (0, 255)


def test_logit_output_is_sigmoid_thresholded_deterministically(tmp_path: Path) -> None:
    source = tmp_path / "source.png"
    first = tmp_path / "first.png"
    second = tmp_path / "second.png"
    Image.new("RGB", (2, 2), (255, 255, 255)).save(source)
    output = np.array([[[[-2.0, 2.0], [4.0, -4.0]]]], dtype=np.float32)
    segmenter = LocalOnnxForegroundSegmenter(
        manifest(activation="LOGIT"), tmp_path / "model.onnx", session=FakeSession(output)
    )
    segmenter.segment(source, first)
    segmenter.segment(source, second)
    assert first.read_bytes() == second.read_bytes()
```

Add negative cases for wrong output name/shape, NaN/Inf, and all-background/all-foreground masks.

- [ ] **Step 3: Run the tests and verify RED**

Run:

```bash
.venv/bin/python -m pytest tests/unit/tools/local_alpha/test_onnx_foreground.py -q
```

Expected: collection fails because `tools.local_alpha.onnx_foreground` does not exist.

- [ ] **Step 4: Implement CPU inference with no RGB output path**

Implement `tools/local_alpha/onnx_foreground.py` with these exact rules:

```python
from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol

import numpy as np
from PIL import Image

from tools.local_alpha.compositor import validate_binary_mask
from tools.local_alpha.models import LocalAlphaModelManifest, MaskEvidence


class Session(Protocol):
    def run(
        self, output_names: list[str], inputs: dict[str, np.ndarray]
    ) -> list[np.ndarray]: ...


class LocalOnnxForegroundSegmenter:
    def __init__(
        self,
        manifest: LocalAlphaModelManifest,
        model_path: Path,
        *,
        session: Session | None = None,
    ) -> None:
        self.manifest = manifest
        self.model_path = model_path
        if session is None:
            import onnxruntime as ort

            options = ort.SessionOptions()
            options.intra_op_num_threads = 1
            options.inter_op_num_threads = 1
            options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
            session = ort.InferenceSession(
                model_path.as_posix(),
                sess_options=options,
                providers=["CPUExecutionProvider"],
            )
        self.session = session

    def _preprocess(self, source: Image.Image) -> np.ndarray:
        resized = source.convert("RGB").resize(
            (self.manifest.input_width, self.manifest.input_height),
            Image.Resampling.BILINEAR,
        )
        array = np.asarray(resized, dtype=np.float32) / np.float32(255.0)
        mean = np.asarray(self.manifest.mean, dtype=np.float32)
        std = np.asarray(self.manifest.std, dtype=np.float32)
        normalized = (array - mean) / std
        return np.transpose(normalized, (2, 0, 1))[None, ...].astype(
            np.float32, copy=False
        )

    def segment(self, source_path: Path, output_mask_path: Path) -> MaskEvidence:
        with Image.open(source_path) as opened:
            if opened.format != "PNG":
                raise ValueError("source must be PNG")
            opened.load()
            source = opened.convert("RGB")
        batch = self._preprocess(source)
        outputs = self.session.run(
            [self.manifest.output_name], {self.manifest.input_name: batch}
        )
        if len(outputs) != 1:
            raise ValueError("model must return one requested output")
        probability = np.asarray(outputs[0], dtype=np.float32)
        expected = (1, 1, self.manifest.input_height, self.manifest.input_width)
        if probability.shape != expected:
            raise ValueError(f"model output shape must be {expected}")
        probability = probability[0, 0]
        if not np.isfinite(probability).all():
            raise ValueError("model output contains non-finite values")
        if self.manifest.output_activation == "LOGIT":
            logits = np.clip(probability, -80.0, 80.0)
            probability = 1.0 / (1.0 + np.exp(-logits))
        elif np.any((probability < 0.0) | (probability > 1.0)):
            raise ValueError("probability output must stay in [0, 1]")

        probability_image = Image.fromarray(probability, mode="F").resize(
            source.size, Image.Resampling.BILINEAR
        )
        restored = np.asarray(probability_image, dtype=np.float32)
        binary = np.where(restored >= self.manifest.threshold, 255, 0).astype(
            np.uint8
        )
        mask = Image.fromarray(binary, mode="L")
        output_mask_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = output_mask_path.with_suffix(".png.tmp")
        mask.save(temporary, format="PNG", optimize=False)
        os.replace(temporary, output_mask_path)
        return validate_binary_mask(output_mask_path, source.size)
```

The bilinear resize exists only inside the model's private input/probability path; it never replaces or resamples source RGB. Do not add morphology, color-key cleanup, RGB output, CUDA/CoreML fallback, or model-specific branches not declared in the selected manifest.

- [ ] **Step 5: Run focused tests, offline import proof, and commit**

Run:

```bash
.venv/bin/python -m pytest tests/unit/tools/local_alpha/test_onnx_foreground.py -q
.venv/bin/python -m pytest tests/unit/tools/local_alpha -q
.venv/bin/python -m ruff check tools/local_alpha tests/unit/tools/local_alpha
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  .venv/bin/python -c "import onnxruntime; print(onnxruntime.get_available_providers())"
make check
git diff --check
```

Expected: tests pass; the provider list contains `CPUExecutionProvider`; no inference code attempts networking.

Commit:

```bash
git add pyproject.toml uv.lock tools/local_alpha/onnx_foreground.py \
  tests/unit/tools/local_alpha/test_onnx_foreground.py
git commit -m "feat: run local foreground segmentation"
```

Fresh task review must verify the selected model's real tensor contract matches the manifest and implementation; a fake-session test cannot override a real-model mismatch.

---

### Task 4: Bind correction, review, user decision, and run provenance

**Files:**
- Create: `tools/local_alpha/evidence.py`
- Create: `tools/local_alpha/cli.py`
- Create: `tests/unit/tools/local_alpha/test_evidence.py`
- Create: `tests/unit/tools/local_alpha/test_cli.py`
- Modify: `experiments/local_alpha/README.md`

**Interfaces:**
- Produces: `select_final_mask(run_root: Path, corrected_input: Path | None, *, correction_active_seconds: int | None = None) -> MaskEvidence`.
- Produces: `build_run_manifest(run_root: Path, decision_path: Path) -> Path`, where the decision file validates as either `UserDecision` or `MechanicalStop`.
- Produces: `verify_run_manifest(manifest_path: Path, run_root: Path) -> dict[str, object]`.
- Produces CLI subcommands: `model-verify`, `segment`, `correction-import`, `compose`, `preview`, `diagnostics`, `manifest`, and `verify`.
- Correction import always writes the one fixed path `masks/corrected.png`; it rejects an existing different correction and records the automatic/corrected difference count.
- PASS requires a passing final review, user statement exactly `LOCAL_ALPHA_PASS`, correction count matching artifacts, matching source/foreground hashes, true alpha, previews, repeat-run hashes, and no sensitive content.

- [ ] **Step 1: Write RED provenance and bounded-correction tests**

Create `tests/unit/tools/local_alpha/test_evidence.py` with helpers that build a complete synthetic run. Cover at least:

```python
def test_correction_import_is_idempotent_but_rejects_second_distinct_mask(
    synthetic_run: Path, corrected_mask: Path, different_mask: Path
) -> None:
    first = select_final_mask(
        synthetic_run, corrected_mask, correction_active_seconds=37
    )
    second = select_final_mask(
        synthetic_run, corrected_mask, correction_active_seconds=37
    )
    assert first.sha256 == second.sha256
    with pytest.raises(ValueError, match="second distinct correction"):
        select_final_mask(
            synthetic_run, different_mask, correction_active_seconds=38
        )


def test_pass_manifest_requires_user_pass_and_passing_review(
    complete_run: Path,
) -> None:
    decision = complete_run / "reviews" / "user-decision.json"
    decision.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "decision": "LOCAL_ALPHA_PASS",
                "userStatement": "LOCAL_ALPHA_PASS",
                "correctionCount": 0,
                "sourceSha256": FROZEN_SOURCE_SHA256,
            }
        )
    )
    manifest = build_run_manifest(complete_run, decision)
    assert verify_run_manifest(manifest, complete_run)["decision"] == (
        "LOCAL_ALPHA_PASS"
    )

    review = complete_run / "reviews" / "final-character-review.json"
    payload = json.loads(review.read_text())
    payload["noEdgeHalo"] = False
    payload["pass"] = False
    payload["violations"] = ["Synthetic edge failure."]
    review.write_text(json.dumps(payload))
    with pytest.raises(ValueError, match="final review"):
        build_run_manifest(complete_run, decision)


def test_manifest_rejects_sensitive_nested_strings(complete_run: Path) -> None:
    manifest = build_complete_pass_manifest(complete_run)
    payload = json.loads(manifest.read_text())
    payload["review"]["notes"] = "token=demo"
    manifest.write_text(json.dumps(payload))
    with pytest.raises(ValueError, match="forbidden"):
        verify_run_manifest(manifest, complete_run)
```

Also test: wrong source hash; missing automatic mask; partial correction evidence; missing/negative/changed correction duration; correction count drift; selected mask/output alpha mismatch; changed output foreground RGB; preview hash drift; absolute paths; `data:image`; `api_key`; PASS without repeat-run equality; STOP carrying `approved: true` or a final block.

- [ ] **Step 2: Write RED CLI exit-code tests**

Create `tests/unit/tools/local_alpha/test_cli.py`. Invoke `main([...])` directly for argument validation and use subprocess only for one end-to-end synthetic PASS and one failure. Freeze:

```text
0 = success
2 = invalid input, failed gate, unsafe manifest, or forbidden second correction
```

Assert `--help` performs no writes and unknown commands exit `2` with prefix `LOCAL ALPHA ERROR:`.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
.venv/bin/python -m pytest \
  tests/unit/tools/local_alpha/test_evidence.py \
  tests/unit/tools/local_alpha/test_cli.py -q
```

Expected: collection fails because `evidence.py` and `cli.py` do not exist.

- [ ] **Step 4: Implement fixed paths, relative hashes, privacy checks, and exact decisions**

Use only these private paths relative to `run_root`:

```text
input/source.png
models/model-manifest.json
masks/automatic.png
masks/corrected.png
masks/correction-diff.json
output/character-hd.png
output/repeat-character-hd.png
output/preview-58.png
output/preview-464.png
reviews/diagnostics/automatic/alpha-overlay.png
reviews/diagnostics/automatic/on-white.png
reviews/diagnostics/automatic/on-black.png
reviews/diagnostics/automatic/on-magenta.png
reviews/diagnostics/final/alpha-overlay.png
reviews/diagnostics/final/on-white.png
reviews/diagnostics/final/on-black.png
reviews/diagnostics/final/on-magenta.png
reviews/automatic-mask-review.json
reviews/final-character-review.json
reviews/user-decision.json
reviews/mechanical-stop.json
manifest.json
```

`select_final_mask` validates `automatic.png` first. With no correction input it requires `correction_active_seconds is None`, returns the automatic mask, and records correction count `0`. With a correction input it requires a non-negative integer active duration, validates size/binary values, copies atomically to the single fixed corrected path, records `correction-diff.json` with automatic/corrected hashes, changed-pixel count, and `activeSeconds`, and returns count `1`; if the fixed corrected path already exists, only byte-identical input with the same duration is accepted.

The manifest stores only `{path, sha256}` plus bounded PNG evidence and strict review/decision data. Recursively reject case-insensitive `api_key`, `token`, `secret`, `password`, `data:image`, absolute POSIX paths, Windows drive paths, strings over 4096 characters, and any artifact path escaping `run_root`.

For `LOCAL_ALPHA_PASS`, require:

```text
approved == true
source SHA == frozen Candidate 03 SHA
audit/model hashes verify
automatic mask exists
correctionCount matches corrected-mask presence
final review pass == true and violations == []
userStatement == "LOCAL_ALPHA_PASS"
character-hd and repeat-character-hd hashes match
foreground RGB source/output hashes match
alpha values == [0, 255]
preview dimensions and 8x nearest-neighbor relation pass
```

For a user-selected `STOP_ALPHA_EXTRACTION`, require a `UserDecision` whose statement is exactly `STOP_ALPHA_EXTRACTION`. For a pre-user mechanical STOP, require `MechanicalStop` with a non-empty `stopReason` and no `userStatement`. Both STOP forms require `approved == false`, omit the `final` block, retain available diagnostic artifacts, and never promote an output.

- [ ] **Step 5: Implement the bounded CLI orchestration**

`tools/local_alpha/cli.py` uses `argparse` and delegates all image/evidence work. The commands are:

```bash
.venv/bin/python -m tools.local_alpha.cli model-verify \
  --audit docs/feasibility/local-alpha-model-audit.md \
  --manifest var/models/local-alpha/model-manifest.json \
  --model var/models/local-alpha/model.onnx

.venv/bin/python -m tools.local_alpha.cli segment \
  var/phase-1b/synthetic-cat-01-local-alpha
.venv/bin/python -m tools.local_alpha.cli correction-import \
  var/phase-1b/synthetic-cat-01-local-alpha "$PINDOU_CORRECTED_MASK" \
  --active-seconds "$PINDOU_CORRECTION_ACTIVE_SECONDS"
.venv/bin/python -m tools.local_alpha.cli compose \
  var/phase-1b/synthetic-cat-01-local-alpha
.venv/bin/python -m tools.local_alpha.cli preview \
  var/phase-1b/synthetic-cat-01-local-alpha
.venv/bin/python -m tools.local_alpha.cli diagnostics \
  var/phase-1b/synthetic-cat-01-local-alpha --mask final
.venv/bin/python -m tools.local_alpha.cli manifest \
  var/phase-1b/synthetic-cat-01-local-alpha --decision-file \
  var/phase-1b/synthetic-cat-01-local-alpha/reviews/user-decision.json
.venv/bin/python -m tools.local_alpha.cli verify \
  var/phase-1b/synthetic-cat-01-local-alpha/manifest.json \
  var/phase-1b/synthetic-cat-01-local-alpha
```

`compose` runs twice to the two fixed output paths and fails if hashes differ. It never silently chooses a corrected mask: path presence and correction evidence must agree. `preview` refuses to run before composition evidence passes. `diagnostics --mask automatic` may run immediately after automatic segmentation; `diagnostics --mask final` resolves the correction evidence and may run before or after composition. Both use `render_review_diagnostics`, write only their four fixed review images, and never overwrite the source, masks, or character.

- [ ] **Step 6: Run focused/full tests and commit**

Run:

```bash
.venv/bin/python -m pytest \
  tests/unit/tools/local_alpha/test_evidence.py \
  tests/unit/tools/local_alpha/test_cli.py -q
.venv/bin/python -m pytest tests/unit/tools/local_alpha -q
.venv/bin/python -m ruff check tools/local_alpha tests/unit/tools/local_alpha
make check
git diff --check
git status --short
git ls-files var
```

Expected: all checks pass; `git ls-files var` is empty.

Commit:

```bash
git add tools/local_alpha/evidence.py tools/local_alpha/cli.py \
  experiments/local_alpha/README.md \
  tests/unit/tools/local_alpha/test_evidence.py \
  tests/unit/tools/local_alpha/test_cli.py
git commit -m "feat: verify local alpha run provenance"
```

Fresh task review must attempt to forge a PASS by changing the source, mask, output, review, decision, correction count, repeat output, preview, and nested strings. All forgeries must be rejected before Task 5.

---

### Task 5: Execute the one-cat private alpha gate and stop for the user

**Files:**
- Private create: `var/models/local-alpha/model.onnx`
- Private create: `var/models/local-alpha/model-manifest.json`
- Private create: `var/phase-1b/synthetic-cat-01-local-alpha/**`
- No tracked commit in this task.

**Interfaces:**
- Consumes: exact Phase 1A Candidate 03 and Task 1's passing audited model.
- Produces: automatic mask, optional single corrected mask, deterministic RGBA pair, previews, review records, and either a user decision or a STOP reason.
- Failure: any source/hash/model/mask/compositor/review gate failure; do not ask for user PASS on mechanically invalid output.

- [ ] **Step 1: Initialize the private run without mutating Phase 1A**

Copy the exact source bytes into the new run root, then prove equality:

```bash
mkdir -p var/phase-1b/synthetic-cat-01-local-alpha/input \
  var/phase-1b/synthetic-cat-01-local-alpha/models \
  var/phase-1b/synthetic-cat-01-local-alpha/masks \
  var/phase-1b/synthetic-cat-01-local-alpha/output \
  var/phase-1b/synthetic-cat-01-local-alpha/reviews
cp var/phase-1a/synthetic-cat-01-pixel-v2/reviews/candidate-call-03.png \
  var/phase-1b/synthetic-cat-01-local-alpha/input/source.png
shasum -a 256 var/phase-1b/synthetic-cat-01-local-alpha/input/source.png
```

Expected hash: `b9966dd94dcbf29ec1cbd11beba308b7397dc3a3cc11fea547e82c4ffc9333fa`. If the current worktree does not contain the ignored Phase 1A run, copy from the main checkout's ignored `var/` and compare before continuing; never store that absolute source path in an artifact.

After the audit PASS, set `PINDOU_LOCAL_ALPHA_MODEL_URL` to the exact official weights URL recorded in the audit and download the single selected ONNX file:

```bash
test -n "${PINDOU_LOCAL_ALPHA_MODEL_URL:-}"
mkdir -p var/models/local-alpha
curl --fail --location --proto '=https' --tlsv1.2 \
  --output var/models/local-alpha/model.onnx \
  "$PINDOU_LOCAL_ALPHA_MODEL_URL"
shasum -a 256 docs/feasibility/local-alpha-model-audit.md \
  var/models/local-alpha/model.onnx
```

Write `var/models/local-alpha/model-manifest.json` with the exact Task 1 schema: copy the selected name/version/source/license/tensor/preprocessing/output values from the passing audit and insert the two hashes printed above. Do not infer or invent a tensor name or threshold. Validate the JSON with `LocalAlphaModelManifest.model_validate_json`, then copy the verified private manifest bytes to `run-root/models/model-manifest.json`; keep the model binary only at `var/models/local-alpha/model.onnx`.

- [ ] **Step 2: Verify the model and create exactly one automatic mask**

Run with network proxy variables removed:

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  .venv/bin/python -m tools.local_alpha.cli model-verify \
  --audit docs/feasibility/local-alpha-model-audit.md \
  --manifest var/models/local-alpha/model-manifest.json \
  --model var/models/local-alpha/model.onnx

env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  .venv/bin/python -m tools.local_alpha.cli segment \
  var/phase-1b/synthetic-cat-01-local-alpha
```

Expected: one `masks/automatic.png`, mode `L`, size `1254×1254`, values exactly `{0,255}`. The command must fail rather than overwrite a different automatic mask; byte-identical rerun is allowed only to prove determinism.

- [ ] **Step 3: Independently review the automatic mask before correction**

Render automatic-mask diagnostics without changing source/output:

```bash
.venv/bin/python -m tools.local_alpha.cli diagnostics \
  var/phase-1b/synthetic-cat-01-local-alpha --mask automatic
```

Inspect the mask alone, alpha overlay, and the in-memory automatic composition on white/black/magenta at original detail. Write `reviews/automatic-mask-review.json` with exact integer schema version, complete/holes/residue/edge booleans, `pass`, violations, and notes.

If the mask broadly misses the cat, merges large background regions, or requires reconstructing the silhouette, record STOP and skip correction. If only bounded boundary pixels need change, proceed once.

- [ ] **Step 4: Import at most one mask-only correction when necessary**

The operator may edit a private copy of the mask in a raster editor that preserves mode `L`, size, and binary values. The source RGB must not be opened for painting or saved. Import once:

```bash
test -n "${PINDOU_CORRECTED_MASK:-}"
test -f "$PINDOU_CORRECTED_MASK"
test -n "${PINDOU_CORRECTION_ACTIVE_SECONDS:-}"
.venv/bin/python -m tools.local_alpha.cli correction-import \
  var/phase-1b/synthetic-cat-01-local-alpha \
  "$PINDOU_CORRECTED_MASK" \
  --active-seconds "$PINDOU_CORRECTION_ACTIVE_SECONDS"
```

Expected: fixed `masks/corrected.png` plus `masks/correction-diff.json` with changed-pixel count, hashes, and the measured non-negative active seconds. A second distinct input or changed duration exits `2` and ends the run as STOP. If automatic review already passes, skip this step and correction count remains `0`.

- [ ] **Step 5: Compose twice, render previews, and run mechanical checks**

Run:

```bash
.venv/bin/python -m tools.local_alpha.cli compose \
  var/phase-1b/synthetic-cat-01-local-alpha
.venv/bin/python -m tools.local_alpha.cli preview \
  var/phase-1b/synthetic-cat-01-local-alpha
.venv/bin/python -m tools.local_alpha.cli diagnostics \
  var/phase-1b/synthetic-cat-01-local-alpha --mask final
```

Assert: both outputs have identical SHA-256; dimensions are `1254×1254`; alpha values are `{0,255}`; transparent RGB is black; source/output foreground RGB hashes are equal; previews are `58×58` and `464×464` with the exact 8× nearest-neighbor relation.

- [ ] **Step 6: Perform the independent final visual review**

The reviewer must view original Candidate 03, the alpha mask, final RGBA on white/black/magenta, and both previews. They write `reviews/final-character-review.json` using the committed exact schema. PASS requires every flag true, `pass: true`, and `violations: []`.

If any flag fails, record the violation and choose STOP. Do not regenerate, edit RGB, adjust threshold after viewing this private result, or create a second correction; any threshold/model change is a new future experiment with a new written decision.

- [ ] **Step 7: Present the blocking user gate**

Only after mechanical and independent review PASS, show the user:

1. original Candidate 03;
2. final transparent character on white, black, and magenta;
3. 58×58 preview;
4. 464×464 preview;
5. automatic/final mask difference summary.

Ask for exactly one response:

```text
LOCAL_ALPHA_PASS
STOP_ALPHA_EXTRACTION
```

Stop execution here until the user replies. No agent or reviewer may substitute for this decision.

---

### Task 6: Record the final decision, review the whole branch, and finish

**Files:**
- Private create: `var/phase-1b/synthetic-cat-01-local-alpha/reviews/user-decision.json`
- Private conditional create: `var/phase-1b/synthetic-cat-01-local-alpha/reviews/mechanical-stop.json`
- Private create: `var/phase-1b/synthetic-cat-01-local-alpha/manifest.json`
- Create: `docs/feasibility/local-alpha-prototype-result.md`
- Modify only if review finds a tracked defect: the smallest responsible implementation/test file.

**Interfaces:**
- Consumes: exact user response, correction count, all retained private evidence, and the branch diff.
- Produces: one verified final private manifest, sanitized public result, clean checks, independent whole-branch review, and a user-selected branch finishing action.

- [ ] **Step 1: Record the exact user response**

For PASS, write:

```json
{
  "schemaVersion": 1,
  "decision": "LOCAL_ALPHA_PASS",
  "userStatement": "LOCAL_ALPHA_PASS",
  "correctionCount": 0,
  "sourceSha256": "b9966dd94dcbf29ec1cbd11beba308b7397dc3a3cc11fea547e82c4ffc9333fa"
}
```

Set `correctionCount` to `1` only when the fixed corrected-mask evidence exists. For a user-selected STOP, use `decision` and `userStatement` equal to `STOP_ALPHA_EXTRACTION`. For a mechanical STOP before the user gate, do not create a user-decision file; write `reviews/mechanical-stop.json` instead:

```json
{
  "schemaVersion": 1,
  "decision": "STOP_ALPHA_EXTRACTION",
  "stopReason": "The exact mechanically observed failure without a user statement.",
  "correctionCount": 0,
  "sourceSha256": "b9966dd94dcbf29ec1cbd11beba308b7397dc3a3cc11fea547e82c4ffc9333fa"
}
```

Use correction count `1` only if the fixed corrected mask was consumed before the mechanical failure. The manifest command receives whichever one of the two decision files actually exists; they are mutually exclusive.

- [ ] **Step 2: Build and verify the private manifest**

Run:

```bash
.venv/bin/python -m tools.local_alpha.cli manifest \
  var/phase-1b/synthetic-cat-01-local-alpha \
  --decision-file \
  var/phase-1b/synthetic-cat-01-local-alpha/reviews/user-decision.json
.venv/bin/python -m tools.local_alpha.cli verify \
  var/phase-1b/synthetic-cat-01-local-alpha/manifest.json \
  var/phase-1b/synthetic-cat-01-local-alpha
```

For mechanical STOP, replace the final argument with `reviews/mechanical-stop.json`. Expected PASS manifest: approved true, exact source, verified model/audit, correction count consistent, final review passed, repeat output equal, previews bound, no sensitive strings. Expected STOP manifest: approved false, no final promotion block, retained diagnostic hashes, and no fabricated user statement.

- [ ] **Step 3: Write the sanitized public result**

`docs/feasibility/local-alpha-prototype-result.md` records:

- date and commit;
- `LOCAL_ALPHA_PASS` or `STOP_ALPHA_EXTRACTION`;
- model name/version/license and public audit link;
- model, audit, source, automatic/final mask, and output hashes;
- correction count, changed-pixel count, and correction active seconds when used;
- deterministic repeat result;
- mechanical/review/user gates as booleans;
- explicit statement that private media, paths, reviewer identity, model bytes, and API keys are absent;
- explicit statement that Phase 2 remains blocked until full Phase 1 passes.

Do not embed images, Base64, paths, prompts, raw model outputs, or reviewer names.

- [ ] **Step 4: Run the full repository and privacy gates**

Run:

```bash
.venv/bin/python -m pytest tests/unit/tools/local_alpha -q
make check
git diff --check
git status --short --branch
git ls-files var
rg -n -i '/Users/|data:image|api_key|token|secret|password' \
  docs/feasibility/local-alpha-prototype-result.md \
  experiments/local_alpha tools/local_alpha tests/unit/tools/local_alpha
```

Expected: all tests and builds pass; `git ls-files var` prints nothing; the privacy scan has no sensitive artifact value. Benign prose mentioning forbidden field names in a negative test must be reviewed rather than hidden, and no actual secret/value may exist.

- [ ] **Step 5: Commit the sanitized result**

Run:

```bash
git add docs/feasibility/local-alpha-prototype-result.md
git commit -m "docs: record Phase 1B alpha gate"
```

Do not stage `var/` or the real model.

- [ ] **Step 6: Request broad whole-branch review and fix every material finding**

Create a review package from the Phase 1B branch merge base to HEAD. Provide the approved design, this implementation plan, model audit, sanitized result, task-review outcomes, full tracked diff, and access to the ignored private run for read-only evidence checks. The reviewer must independently reproduce:

- exact source hash;
- local/offline model binding;
- binary automatic/final masks;
- zero-or-one correction invariant;
- foreground RGB equality;
- black transparent RGB;
- repeat output equality;
- preview relation;
- review derivation;
- exact user decision;
- privacy and no-`var/` tracking.

Fix every Critical or Important finding with RED/GREEN tests and re-review until none remain.

- [ ] **Step 7: Finish the development branch**

Use `superpowers:verification-before-completion`, then `superpowers:finishing-a-development-branch`. Re-run `make check` immediately before presenting branch options. Do not merge, push, delete, or claim Phase 1B completion until the selected finishing action succeeds.

## Plan Self-Review Checklist

- [ ] Every approved-spec section maps to a task: model audit (Task 1), binary/pixel-preserving composition (Task 2), local model (Task 3), correction/provenance (Task 4), private visual/user gate (Task 5), final evidence/branch review (Task 6).
- [ ] No task modifies Web/API routes, domain `PartLabel`, Phase 2, editors, animations, or exports.
- [ ] The only pass source/hash/dimensions and both final decisions are exact and consistent across tasks.
- [ ] `LocalAlphaModelManifest`, `MaskEvidence`, `CompositionEvidence`, `FinalCharacterReview`, and CLI names do not drift between tasks.
- [ ] All implementation tasks contain RED command, expected failure, minimal GREEN, focused tests, full gate, commit, and fresh review.
- [ ] No placeholder marker, invented model selection, private media, real absolute path, or implicit retry appears.
