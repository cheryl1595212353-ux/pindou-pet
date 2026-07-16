# 拼豆虚拟宠物 Phase 1：三猫 Provider 可行性硬门禁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 Phase 0 已有单仓和 Provider 契约，接入真实候选生成服务与冻结的本地分割模型，并用三只外观差异明显的猫完成不可绕过的可行性硬门禁。

**Architecture:** 候选生成服务通过异步 HTTP 任务适配器接入，必须提供幂等提交和按幂等键查询。Provider 可返回普通 RGB/RGBA PNG；透明角色由本地 ONNX 分割掩码确定性合成。CLI 执行能力证明、三猫生成、拆层、局部补全、动作关键帧和 58×58 压力预览；私人媒体留在忽略的 `var/`，仓库只提交脱敏 PASS 报告与冻结清单。

**Tech Stack:** Phase 0 固定的 Python 3.12、既有 FastAPI/Pydantic Provider 契约、httpx、Pillow、NumPy、ONNX Runtime、pytest；既有 `@pindou/*` pnpm workspace 仅运行检查。

## Global Constraints

- 消费 Phase 0 已存在的 `domain/providers.py`、假 Provider 契约测试、pnpm workspace、React 外壳与 OpenAPI 链；不得重新创建这些基础文件。
- 命令只用 `.venv/bin/python` 与 `pnpm`。
- 输入枚举固定为 `FRONT`、`CAT_LEFT_FRONT_45`、`CAT_RIGHT_FRONT_45`；前爪固定为 `SCREEN_LEFT_FRONT_PAW`、`SCREEN_RIGHT_FRONT_PAW`。
- 复用 Phase 0 精确六值 `PartLabel`：`BODY`、`HEAD`、`SCREEN_LEFT_FRONT_PAW`、`SCREEN_RIGHT_FRONT_PAW`、`TAIL`、`EYES`。`FOREGROUND` 是实例模型的独立证据／alpha 掩码，不属于该枚举；睁眼／闭眼是 Phase 3 的同一 `EYES` 节点变体，不是分割标签。
- 固定姿势为脸朝用户、身体向画面右侧约 20°、尾巴在画面右侧。
- 三猫结果必须各自通过姿势门：自动指标与盲检均确认正脸、身体画面右转目标 20°（容差 ±10°）和尾巴质心位于身体中心画面右侧；任一 false 即失败，不能只证明请求里写过姿势。
- 不要求 Provider 原生透明；本地分割必须交付透明角色，重复运行 alpha 哈希一致。
- 能力声明、提交后查询、同键重复提交任一幂等证明失败，CLI 在完整付费运行前退出 `2`，Phase 2 停线。
- 三猫全部通过：三评审同时查看三张参考图和匿名 8 倍最近邻 58×58 预览，使用规格冻结的 1/3/5 锚点且不知道 Provider/阈值；总体平均 `>=4.0/5`、单猫 `>=3.5/5`。操作者先完成一次记录在 manifest 中的 5 分钟校正演示；随后校正活动时间（草稿打开到三门通过的墙钟时间减去局部 Provider 等待区间并集）中位数 `<=300s`、单猫 `<=600s`；初稿 `<=120s`；单猫生成等待累计 `<=300s`。
- 每猫交付 Provider 初稿、本地透明角色、六个必需逻辑组与睁/闭眼变体、两个复合局部 edit 结果：A 覆盖颈胸+画面左肩，B 同时覆盖尾根并生成闭眼变体；五动作关键帧、58×58 预览和重复提交证明也必须存在。
- 每猫在初稿后最多完整重生成 1 次、局部 edit submission 最多 2 次；初稿、完整重生成和局部 edit 三类服务端等待累计 `<=300s`。最终评分使用允许次数内的最后结果，任何次数或等待超限使整猫失败。
- 三猫 manifest 不含人工 point/box prompts。先保存自动 prompts/自动 masks，再允许人工边界校正并单独计时；自动草稿必须已经含六个非空必需逻辑组，否则该猫失败。
- 不实现项目、上传页、队列、编辑器、量化、互动或导出；媒体、原始响应、真实任务 ID、密钥、绝对路径和评审身份不得进入 Git/报告。

## Exact Files

- Create only after official audit PASS: `apps/api/src/pindou_pet/providers/generation/adapter.py`
- Create: `apps/api/src/pindou_pet/domain/identity_traits.py`
- Create: `apps/api/src/pindou_pet/providers/segmentation/local_onnx.py`
- Create: `apps/api/src/pindou_pet/providers/perception/local_bundle.py`
- Create: `tools/provider_gate/{__init__,artifacts,capability,cli,models,report,review,run,visual_proxy}.py`
- Create: `tools/provider_gate/identity_traits.py`
- Create: `experiments/provider_feasibility/{README.md,manifest.example.json,reviews.example.json,target-pose.md}`
- Create after PASS: `config/{provider.freeze.yaml,segmentation.freeze.yaml}`
- Create: `docs/feasibility/provider-capability-audit.md`
- Create after PASS: `docs/feasibility/three-cat-provider-gate.md`
- Create: `tests/unit/providers/{test_generation_adapter.py,test_local_onnx_segmenter.py,test_local_perception_bundle.py}`
- Create: `tests/contracts/providers/test_segmentation_contract.py`
- Create: `tests/unit/tools/{test_capability_gate.py,test_gate_identity_traits.py,test_gate_models.py,test_gate_review.py,test_visual_proxy.py}`
- Create synthetic only: `tests/fixtures/{transparent-cat.png,segmentation-output.npy}`
- Private: `var/models/perception/{instance.onnx,encoder.onnx,decoder.onnx,view-yaw.onnx,cat-reid.onnx}`, `var/feasibility/**`

---

### Task 1: Audit official capabilities, then implement only a qualifying Provider adapter

**Files:**
- Create only after audit PASS: `apps/api/src/pindou_pet/providers/generation/adapter.py`
- Create: `tools/provider_gate/__init__.py`
- Create: `tools/provider_gate/capability.py`
- Create: `docs/feasibility/provider-capability-audit.md`
- Test after audit PASS: `tests/unit/providers/test_generation_adapter.py`
- Test: `tests/unit/tools/test_capability_gate.py`
- Modify: `.env.example`
- Modify: `apps/api/src/pindou_pet/config.py`
- Modify: `pyproject.toml` only if Phase 0 lacks `httpx`

**Interfaces:**
- Consumes: Phase 0 `GenerationProvider`
- Produces after audit PASS: `build_generation_provider(settings) -> GenerationProvider`
- Produces: `verify_provider_capability(provider, probe_request) -> CapabilityProof`
- Failure: `ProviderGateStopped` maps to exit `2`

- [ ] **Step 1: Audit official Provider documentation before code or paid calls**

Inspect only official API/model documentation. In `docs/feasibility/provider-capability-audit.md`, record direct official URLs and retrieval date for: three references, mask edit, fixed seed, immutable model version, native client idempotency key, native recovery/query by that same key, async poll/result, retention/deletion and cost. A Provider request ID plus ordinary polling is not recovery by idempotency key and is a FAIL.

First write the evidence document manually. It ends with one selected candidate and `decision: PASS`, or `decision: STOP_NO_QUALIFYING_PROVIDER`. On STOP, do not create `adapter.py`, do not call a paid API, and terminate Phase 1.

Research baseline as of 2026-07-16: the official [OpenAI image-generation guide](https://developers.openai.com/api/docs/guides/image-generation) is useful evidence for multiple references and masked edits; official [Replicate prediction docs](https://replicate.com/docs/topics/predictions/create-a-prediction) and [fal asynchronous inference docs](https://fal.ai/docs/documentation/model-apis/inference/queue) are useful evidence for returned task IDs and polling. None of those facts by itself proves native recovery by a client submission key. Re-check current official documentation during execution and mark each capability independently; do not infer the missing recovery contract from ordinary request-ID polling.

After audit PASS, `build_generation_provider(settings)` requires the Phase 0 typed `generation_api_key: SecretStr | None`, fails before network access when it is null/empty, and passes `get_secret_value()` only to the selected transport constructor. The setting remains optional for offline tests and STOP audits, and no second provider-specific `.env` parser is created.

- [ ] **Step 2: Write RED audit-validation tests, then implement offline validation**

```python
def test_audit_rejects_request_id_polling_as_key_recovery(audit_document):
    audit_document.native_lookup_by_submission_key = False
    with pytest.raises(CapabilityAuditFailure, match="native lookup"):
        validate_capability_audit(audit_document)


def test_audit_requires_official_url_and_retrieval_date_for_every_claim(audit_document):
    audit_document.mask_edit.evidence_url = None
    with pytest.raises(CapabilityAuditFailure, match="official evidence"):
        validate_capability_audit(audit_document)
```

Run before implementation:

```bash
.venv/bin/python -m pytest tests/unit/tools/test_capability_gate.py -q
```

Expected: FAIL because `validate_capability_audit` is absent. Implement a purely offline parser/validator in `capability.py`, then run:

```bash
.venv/bin/python -m tools.provider_gate.capability audit \
  --document docs/feasibility/provider-capability-audit.md
```

Expected PASS: exit `0` with `OFFICIAL PROVIDER CAPABILITY AUDIT: PASS`; every required capability has a supporting official URL/date. Expected STOP: exit `2` before adapter import or submission.

On STOP, preserve the evidence without pretending Phase 1 passed:

```bash
git add docs/feasibility/provider-capability-audit.md
git commit -m "docs: record provider capability stop"
```

Then end this plan. The remaining steps are conditional on audit PASS.

- [ ] **Step 3: Write RED tests against the selected Provider's documented API**

```python
def test_submit_forwards_native_idempotency_key(provider, request, recorded_requests):
    provider.submit(request, idempotency_key="opaque-123")
    assert recorded_requests[-1].native_idempotency_value == "opaque-123"


def test_lookup_never_submits(provider, gateway_state):
    gateway_state.idempotency_jobs["opaque-123"] = "job-7"
    assert provider.lookup_by_idempotency_key("opaque-123") == "job-7"
    assert gateway_state.submit_calls == 0


def test_lookup_rejects_malformed_native_response(provider, gateway_state):
    gateway_state.lookup_response = {"unexpected": "shape"}
    with pytest.raises(ProviderProtocolError):
        provider.lookup_by_idempotency_key("opaque-123")
```

Run: `.venv/bin/python -m pytest tests/unit/providers/test_generation_adapter.py -q`

Expected: FAIL because the adapter is absent.

- [ ] **Step 4: Implement the single selected Provider's real adapter**

Implement the selected Provider's documented authentication, native idempotency placement (body, named header, or documented client-submission field exactly as the official audit states), native lookup/query operation, async status/result calls, timeouts, outbound image encoding, typed 429/5xx/timeout/content/malformed errors, PNG validation and normalized Phase 0 `GenerationProvider` mapping. The fake transport exposes a normalized `native_idempotency_value` only to assert equivalence without assuming placement. Official audit evidence, not a new `capabilities()` method, proves feature support. Never invent a generic endpoint, persist raw responses, require transparency, or emulate native lookup in process memory/the product database.

- [ ] **Step 5: Write RED hard-gate tests**

```python
def test_stops_before_paid_probe_when_lookup_false(provider, request):
    provider.lookup_error = ProviderLookupUnsupported("native recovery unavailable")
    with pytest.raises(ProviderGateStopped):
        verify_provider_capability(provider, request)
    assert provider.submit_calls == 0


def test_stops_when_repeat_returns_second_job(provider, request):
    provider.repeat_job_id = "second-job"
    with pytest.raises(ProviderGateStopped, match="different job"):
        verify_provider_capability(provider, request)
```

Run: `.venv/bin/python -m pytest tests/unit/tools/test_capability_gate.py -q`

Expected: FAIL because capability proof is absent.

- [ ] **Step 6: Implement and verify the live proof**

Sequence: validate the PASS audit checksum against the selected adapter; create a fresh key; initial native lookup must return `None`; submit one fixed low-cost probe; native lookup must return its ID; identical re-submit must return the same ID; poll terminal; return only hashed key/job/result plus model/version. No in-memory lookup fallback.

```bash
.venv/bin/python -m pytest tests/unit/providers/test_generation_adapter.py \
  tests/unit/tools/test_capability_gate.py -q
.venv/bin/python -m ruff check apps/api/src/pindou_pet/providers tools/provider_gate tests/unit
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add .env.example pyproject.toml docs/feasibility/provider-capability-audit.md \
  apps/api/src/pindou_pet/providers/generation/adapter.py tools/provider_gate \
  tests/unit/providers/test_generation_adapter.py \
  tests/unit/tools/test_capability_gate.py
git commit -m "feat: hard-gate provider idempotency lookup"
```

---

### Task 2: Qualify a licensed local perception bundle and transparent compositor

**Files:**
- Modify: `pyproject.toml`
- Create: `apps/api/src/pindou_pet/providers/segmentation/local_onnx.py`
- Create: `apps/api/src/pindou_pet/providers/perception/local_bundle.py`
- Test: `tests/unit/providers/test_local_onnx_segmenter.py`
- Test: `tests/unit/providers/test_local_perception_bundle.py`
- Create: `tests/contracts/providers/test_segmentation_contract.py`
- Create synthetic: `tests/fixtures/transparent-cat.png`
- Create synthetic: `tests/fixtures/segmentation-output.npy`
- Create private candidate manifest: `var/feasibility/perception-candidate.yaml`
- Create private calibration inputs: `var/feasibility/perception-calibration/**`
- Create only after the three-cat pass in Task 4: `config/segmentation.freeze.yaml`

**Interfaces:**
- Consumes: Phase 0 `SegmentationProvider`
- Produces: `LocalPromptableOnnxSegmentationProvider(model_paths, manifest_path)`
- Produces: `LocalPerceptionBundle(instance_model, view_yaw_model, cat_reid_model, promptable_segmenter, derive_part_prompts)`
- Produces: `derive_part_prompts(image, foreground_mask, target_pose) -> tuple[PointOrBoxPrompt, ...]`
- Produces: `compose_transparent_role(source_png, physical_masks) -> NormalizedImageResult`
- Consumes: exact six-value Phase 0 `PartLabel` plus `PointOrBoxPrompt` values; no semantic seven-class output is assumed. The seventh recorded mask artifact is the separate instance `FOREGROUND` mask.

- [ ] **Step 1: Write RED checksum and alpha tests**

```python
def test_rejects_encoder_or_decoder_hash_mismatch(tmp_path, manifest_path):
    encoder = tmp_path / "encoder.onnx"
    decoder = tmp_path / "decoder.onnx"
    encoder.write_bytes(b"wrong")
    decoder.write_bytes(b"decoder")
    with pytest.raises(ModelManifestError, match="sha256"):
        LocalPromptableOnnxSegmentationProvider((encoder, decoder), manifest_path)


def test_derived_prompts_produce_repeatable_alpha(segmenter, opaque_png, derived_part_prompts):
    first = make_transparent_role(segmenter, opaque_png, derived_part_prompts)
    second = make_transparent_role(segmenter, opaque_png, derived_part_prompts)
    assert alpha_sha256(first.png_bytes) == alpha_sha256(second.png_bytes)


def test_automatic_part_prompts_are_repeatable(perception_bundle, opaque_png, target_pose):
    first = perception_bundle.derive_part_prompts(opaque_png, target_pose)
    second = perception_bundle.derive_part_prompts(opaque_png, target_pose)
    assert first == second
    assert {prompt.part_label for prompt in first} == set(PartLabel)


def test_bundle_rejects_zero_or_multiple_cat_instances(perception_bundle, multi_cat_png):
    with pytest.raises(PerceptionInputRejected, match="exactly one cat"):
        perception_bundle.inspect_and_prompt(multi_cat_png, TARGET_POSE)


def test_bundle_distinguishes_dog_from_no_detected_animal(perception_bundle, dog_png):
    result = perception_bundle.inspect_instances(dog_png)
    assert result.labels == ("dog",)


@pytest.mark.parametrize(
    ("yaw", "expected"), [(29.0, False), (30.0, True), (60.0, True), (61.0, False)]
)
def test_side_front_yaw_boundaries_are_inclusive(yaw, expected):
    assert is_valid_side_front_yaw(yaw, min_deg=30, max_deg=60) is expected


def test_view_and_reid_outputs_are_repeatable(perception_bundle, three_view_pngs):
    first = perception_bundle.inspect_view_and_identity(three_view_pngs)
    second = perception_bundle.inspect_view_and_identity(three_view_pngs)
    assert first == second
    assert first.views["CAT_LEFT_FRONT_45"].estimated_camera_yaw_deg >= 30
    assert first.views["CAT_RIGHT_FRONT_45"].estimated_camera_yaw_deg <= -30
```

Run: `.venv/bin/python -m pytest tests/unit/providers/test_local_onnx_segmenter.py -q`

Expected: FAIL because the segmenter is absent.

- [ ] **Step 2: Implement manifest-driven promptable CPU inference**

Add runtime dependencies `numpy>=2,<3`, `onnxruntime>=1.20,<2`, and `pyyaml>=6,<7` to root `pyproject.toml`, reinstall `.[dev]`, and verify all three imports before model work. Do not rely on packages already present in the developer's global Python.

Select actually available licensed ONNX candidates for: a general instance detector exposing at least cat/dog labels and cat foreground geometry, camera-relative cat view/yaw estimation, cat re-identification embeddings, and promptable segmentation. The bundle first distinguishes wrong species, zero/multiple cats and exactly one cat, estimates each view/confidence and pairwise identity distances, then `derive_part_prompts` deterministically derives prompts for exactly `BODY`, `HEAD`, `SCREEN_LEFT_FRONT_PAW`, `SCREEN_RIGHT_FRONT_PAW`, `TAIL`, and `EYES` from normalized foreground geometry and the fixed target-pose convention. The manifest contains every model's name/version/source/license/file, tensor ABI, preprocessing and output-semantics checksum; label-producing models additionally require a label-map checksum. It also freezes thresholds, calibration checksums and algorithm parameters; the three-cat manifest contains no hand-entered prompts. The promptable adapter executes its documented encoder/decoder ABI and returns one binary mask per requested `PartLabel`; the separate instance `FOREGROUND` mask is stored under its own evidence key and never inserted into `NormalizedPartMasks`. It never assumes logits already contain cat-part semantics.

The candidate manifest is validated by these exact types; values are read from the selected model files/session metadata and official documentation rather than assumed by this plan:

```python
class TensorSpec(BaseModel):
    name: str
    dtype: Literal["float32", "int32", "int64", "bool"]
    shape: tuple[int | str, ...]


class OnnxFileSpec(BaseModel):
    path: Path
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class PromptableSegmentationManifest(BaseModel):
    schema_version: Literal[1]
    model_name: str
    model_version: str
    source_url: HttpUrl
    license_spdx: str
    license_file_sha256: str
    encoder: OnnxFileSpec
    decoder: OnnxFileSpec
    encoder_inputs: tuple[TensorSpec, ...]
    encoder_outputs: tuple[TensorSpec, ...]
    decoder_inputs: tuple[TensorSpec, ...]
    decoder_outputs: tuple[TensorSpec, ...]
    preprocess: str
    coordinate_transform: str
    mask_threshold: float
    postprocess: Literal["nearest-to-source-binary-png"]
    output_semantics_sha256: str
    calibration_sha256: str


class PerceptionBundleManifest(BaseModel):
    schema_version: Literal[1]
    instance_model_name: str
    instance_model_version: str
    instance_model: OnnxFileSpec
    instance_model_source_url: HttpUrl
    instance_model_license_spdx: str
    instance_model_license_file_sha256: str
    instance_model_inputs: tuple[TensorSpec, ...]
    instance_model_outputs: tuple[TensorSpec, ...]
    instance_preprocess: str
    instance_postprocess: str
    instance_output_semantics_sha256: str
    instance_label_map_sha256: str
    view_yaw_model_name: str
    view_yaw_model_version: str
    view_yaw_model: OnnxFileSpec
    view_yaw_source_url: HttpUrl
    view_yaw_license_spdx: str
    view_yaw_license_file_sha256: str
    view_yaw_inputs: tuple[TensorSpec, ...]
    view_yaw_outputs: tuple[TensorSpec, ...]
    view_yaw_preprocess: str
    view_yaw_postprocess: str
    view_yaw_output_semantics_sha256: str
    view_yaw_calibration_sha256: str
    view_confidence_min: float
    front_abs_yaw_max_deg: float
    side_front_yaw_min_deg: Literal[30]
    side_front_yaw_max_deg: Literal[60]
    cat_reid_model_name: str
    cat_reid_model_version: str
    cat_reid_model: OnnxFileSpec
    cat_reid_source_url: HttpUrl
    cat_reid_license_spdx: str
    cat_reid_license_file_sha256: str
    cat_reid_inputs: tuple[TensorSpec, ...]
    cat_reid_outputs: tuple[TensorSpec, ...]
    cat_reid_preprocess: str
    cat_reid_postprocess: str
    cat_reid_output_semantics_sha256: str
    cat_reid_calibration_sha256: str
    reid_match_max_distance: float
    reid_different_min_distance: float
    promptable_segmenter: PromptableSegmentationManifest
    prompt_deriver_version: str
    prompt_deriver_parameters: dict[str, float | int | str]
    target_pose_version: str
    pose_evaluator_version: str
    pose_evaluator_parameters: dict[str, float | int | str]
    pose_evaluator_calibration_sha256: str
```

Qualify the licensed view-yaw and cat re-ID ONNX candidates on a private labeled calibration set before freeze. The view output is `estimatedCameraYawDeg` plus confidence, with positive yaw defined as camera on the cat's left; confident side-front acceptance is inclusive `[30,60]` or `[-60,-30]`, while 29/61-degree logic tests reject. The re-ID manifest freezes separate match/different thresholds with a non-overlapping uncertainty band. Calibration must include correct, swapped/repeated, rear, clear same-cat, clear different-cat and borderline cases; report per-case results/checksums without media. A model/threshold that cannot separate the clear cases fails Phase 1 rather than moving the rules into Phase 2.

The physical alpha union uses `BODY`, `HEAD`, `SCREEN_LEFT_FRONT_PAW`, `SCREEN_RIGHT_FRONT_PAW`, and `TAIL`; eye masks do not expand alpha. Apply the union to original RGB and ignore Provider alpha. `experiments/provider_feasibility/target-pose.md` freezes `faceDirection=front`, `bodyRotationDegrees=20`, `tailSide=screen_right`, positive body angle toward screen right, and the inclusive formal body band 10–30 degrees. The pose evaluator deterministically derives face yaw, body-right angle and tail/body centroids from the high-resolution neutral source composition plus frozen part geometry; its version/parameters/calibration checksum enter `config/segmentation.freeze.yaml` for Phase 5 reuse.

- [ ] **Step 3: Verify real model, tests, and commit**

```bash
.venv/bin/python -m pindou_pet.providers.segmentation.local_onnx verify \
  --manifest var/feasibility/perception-candidate.yaml
.venv/bin/python -m pytest tests/unit/providers/test_local_onnx_segmenter.py \
  tests/unit/providers/test_local_perception_bundle.py \
  tests/contracts/providers/test_segmentation_contract.py -q
git add apps/api/src/pindou_pet/providers/segmentation/local_onnx.py \
  apps/api/src/pindou_pet/providers/perception/local_bundle.py \
  pyproject.toml \
  tests/unit/providers/test_local_onnx_segmenter.py \
  tests/unit/providers/test_local_perception_bundle.py \
  tests/contracts/providers/test_segmentation_contract.py tests/fixtures
git commit -m "feat: add automatic local perception candidate"
```

Expected: verification prints `PERCEPTION BUNDLE ABI VERIFIED`; instance/view-yaw/re-ID/promptable-segmentation automatic and contract tests pass; model files/candidate manifest remain ignored. This task does not create `config/segmentation.freeze.yaml`; Task 4 creates it only if the same licensed model files, calibration thresholds, prompt derivation algorithm and segmenter pass all required cases.

---

### Task 3: Build the reproducible three-cat harness

**Files:**
- Create: `apps/api/src/pindou_pet/domain/identity_traits.py`
- Create: `tools/provider_gate/{models,artifacts,identity_traits,run,visual_proxy,review,report,cli}.py`
- Create: `experiments/provider_feasibility/{README.md,manifest.example.json,reviews.example.json,target-pose.md}`
- Test: `tests/unit/tools/{test_gate_identity_traits.py,test_gate_models.py,test_visual_proxy.py,test_gate_review.py}`

**Interfaces:**
- Produces: `.venv/bin/python -m tools.provider_gate.cli validate|capability|run|review|report|verify-freeze`
- Exit codes: `0=pass`, `1=config/execution error`, `2=hard failure`
- Produces: deterministic `IdentityTraits` and content hash before any generation submit

- [ ] **Step 1: Write RED manifest tests**

```python
def test_requires_three_cats(valid_data):
    with pytest.raises(ValidationError):
        GateManifest.model_validate({**valid_data, "cats": valid_data["cats"][:2]})


def test_requires_camera_relative_views(valid_data):
    data = deepcopy(valid_data)
    del data["cats"][0]["images"]["CAT_RIGHT_FRONT_45"]
    with pytest.raises(ValidationError):
        GateManifest.model_validate(data)
```

Run: `.venv/bin/python -m pytest tests/unit/tools/test_gate_models.py -q`

Expected: FAIL.

- [ ] **Step 2: Write RED deterministic identity-trait tests**

```python
def test_extracts_all_identity_fields_from_masks_geometry_and_colors(reference_masks):
    checkpoint = extract_identity_traits(reference_masks)
    assert checkpoint.traits.face_shape
    assert checkpoint.traits.ear_shape
    assert checkpoint.traits.eye_description
    assert checkpoint.traits.body_build
    assert checkpoint.traits.primary_coat_colors
    assert checkpoint.traits.distinctive_markings is not None


def test_trait_card_and_hash_repeat(reference_masks):
    first = extract_identity_traits(reference_masks)
    second = extract_identity_traits(reference_masks)
    assert first.traits == second.traits
    assert first.content_hash == second.content_hash
```

Run: `.venv/bin/python -m pytest tests/unit/tools/test_gate_identity_traits.py -q`

Expected: FAIL because identity extraction is absent.

- [ ] **Step 3: Implement the reusable identity extractor**

The core implementation lives in `pindou_pet.domain.identity_traits`; the gate wrapper loads images/masks. Derive face shape from normalized head contour ratios, ear shape from upper-head contour peaks, eye description from prompted eye-mask median sRGB/Lab values, body build from body length/height ratios, up to five primary coat colors from deterministic Lab clustering, and distinctive markings from stable color components anchored to normalized head/body coordinates. Sort colors/markings with explicit tie-breaks, then canonical-JSON hash the complete `IdentityTraits`, source hashes and extraction manifest checksum.

The three-cat manifest contains neither prompts nor a hand-written trait card: the frozen perception bundle derives prompts, and this core function derives the card. Phase 2 imports the same core function through `uploads/identity_traits.py`; it does not reimplement the algorithm.

- [ ] **Step 4: Implement records, atomic artifacts, and fixed runner**

Require exactly three cat IDs/appearance groups, nine files, seeds and target pose. Before timed correction, require `operatorTrainingDemoMinutes=5` and a recorded completion timestamp. Record ordered hashes, automatically derived prompt hashes, identity-card/hash, hashed Provider IDs, and for initial/full/local-edit attempts record server `acceptedAt→resultReadyAt` totals separately from nested Provider-wait intervals. The three server totals—not Provider-only time—form the 300-second cumulative value. Also record full-regeneration count, local-edit submission count, correction-open/completion server timestamps, the union of local-edit Provider-wait intervals, derived correction wall/wait/active milliseconds, exactly seven named mask artifacts (`FOREGROUND` plus the six `PartLabel` masks), transparent/alpha, two completion-job hashes, action frames, preview and freeze checksums. Record pose metrics/booleans `faceFront`, `bodyRightDegrees` (10–30 inclusive), and `tailScreenRight` from frozen view/part geometry plus blinded operator confirmation. Write temp then `os.replace`; reject secrets, Base64, absolute paths and raw responses.

Per cat order: normalize/hash inputs and finish entry validation; record `acceptedAt`; run the frozen perception bundle to detect foreground and automatically derive part prompts; save automatic prompts/masks before correction; derive/save identity card/hash; pass that card to `GenerationRequest`; submit/poll initial, derive local alpha, and record `initialDraftReadyAt` only when the transparent high-resolution draft and trait card are readable; require `initialDraftReadyAt - acceptedAt <=120s` (the CLI has no queue, while Phase 5 repeats this on the complete queued product path); lookup and identical re-submit; allow at most one feedback-driven full regeneration; automatically derive prompts and segment the last allowed pose; save six nonempty automatic groups; record correction-open when this draft is first shown and completion when identity/layer/action gates pass; locally composite transparent role twice; submit at most two compound local edits—A masks neck/chest plus screen-left shoulder, B masks tail root plus both eye regions with an instruction to keep the body unchanged and close the eyes; record each actual Provider-wait interval and subtract their union from the correction wall time; extract the tail-root patch and closed-eye variant from B; re-segment; render neutral/breath/blink/tail/paw/jump without scaling; create 58×58/464×464 previews from the last allowed result. Abort all cats on idempotency mismatch or any count/wait overrun.

- [ ] **Step 5: Write RED proxy and decision tests**

```python
def test_proxy_is_fixed_and_bounded(role):
    proxy = make_bead_proxy(role)
    assert proxy.size == (58, 58)
    assert count_opaque_colors(proxy) <= 32
    assert scale_for_blind_review(proxy).size == (464, 464)


def test_one_low_cat_fails(valid_review):
    valid_review.cats[1].reviewers = scores(3.0, 3.0, 3.0)
    assert decide_gate(valid_review).passed is False


def test_review_requires_three_references_frozen_anchors_and_blinding(valid_review):
    assert all(len(cat.reference_hashes) == 3 for cat in valid_review.cats)
    assert valid_review.presentation.role_size == (464, 464)
    assert valid_review.presentation.scaling == "nearest-neighbor-8x"
    assert valid_review.presentation.anchor_checksum == FROZEN_1_3_5_ANCHOR_CHECKSUM
    assert valid_review.presentation.shows_provider is False
    assert valid_review.presentation.shows_thresholds is False
```

Run: `.venv/bin/python -m pytest tests/unit/tools/test_visual_proxy.py tests/unit/tools/test_gate_review.py -q`

Expected: FAIL, then pass after implementing every Global Constraint threshold. The review command shows all three private references beside the anonymous 464×464 nearest-neighbor role and the frozen anchors: 1 = clearly not the same cat or multiple key traits wrong; 3 = coat/build broadly correct but face or markings visibly wrong; 5 = immediately recognizable with face/shape/color/markings retained. It stores only reference/role/presentation hashes, blinded order, hashed reviewer ID, score and timestamp; Provider/thresholds remain hidden. Proxy is marked `NOT A PHYSICAL PALETTE EXPORT` and is never imported by production quantization.

- [ ] **Step 6: Verify and commit**

```bash
.venv/bin/python -m pytest tests/unit/tools -q
.venv/bin/python -m ruff check tools/provider_gate tests/unit/tools
pnpm typecheck
git add apps/api/src/pindou_pet/domain/identity_traits.py tools/provider_gate \
  experiments/provider_feasibility tests/unit/tools
git commit -m "test: add reproducible three-cat provider gate"
```

Expected: offline tests pass without private media; Phase 0 web is unchanged.

---

### Task 4: Execute the hard gate and freeze only PASS

**Files:**
- Create private: `var/feasibility/{manifest.json,reviews.json,runs/gate-01/**}`
- Create only after PASS: `config/provider.freeze.yaml`
- Create only after PASS: `config/segmentation.freeze.yaml`
- Create only after PASS: `docs/feasibility/three-cat-provider-gate.md`

**Interfaces:**
- Consumes: live gateway, frozen model, nine photos, three blinded reviewers
- Produces: immutable Provider checksum required by Phase 2

- [ ] **Step 1: Validate private inputs without network**

```bash
.venv/bin/python -m tools.provider_gate.cli validate --manifest var/feasibility/manifest.json
```

Expected: exit `0`, three IDs/nine hashes, no image bytes/absolute paths.

- [ ] **Step 2: Run capability proof first**

```bash
.venv/bin/python -m tools.provider_gate.cli capability \
  --manifest var/feasibility/manifest.json \
  --output var/feasibility/runs/gate-01/capability-proof.json
```

Expected pass: `PROVIDER IDEMPOTENCY CAPABILITY VERIFIED`. Failure exits `2` with `STOP: PROVIDER IDEMPOTENCY GATE FAILED`; do not begin Phase 2.

- [ ] **Step 3: Run three cats and blinded review**

```bash
.venv/bin/python -m tools.provider_gate.cli run \
  --manifest var/feasibility/manifest.json --output var/feasibility/runs/gate-01
.venv/bin/python -m tools.provider_gate.cli review \
  --run var/feasibility/runs/gate-01 --reviews var/feasibility/reviews.json
```

Expected: each cat has the last allowed Provider target, local transparent role, seven masks, two completion-job results covering all three regions, six keyframe images including neutral, two previews, timings/record/checksums; records prove full regeneration `<=1`, local edits `<=2`, total service wait `<=300s`. Automatic pose evidence and the blinded operator record both prove face front, body-right angle 10–30 degrees inclusive and tail on screen right; review prints `THREE-CAT PROVIDER GATE: PASS`. Failure exits `2`.

If the promptable candidate cannot produce all required masks for all three cats within the correction thresholds, this is a segmentation gate failure: do not create `config/segmentation.freeze.yaml`, stop Phase 1, and qualify another licensed local candidate.

- [ ] **Step 4: Generate byte-stable freeze/report and verify**

```bash
.venv/bin/python -m tools.provider_gate.cli report \
  --run var/feasibility/runs/gate-01 --reviews var/feasibility/reviews.json \
  --report docs/feasibility/three-cat-provider-gate.md \
  --freeze config/provider.freeze.yaml \
  --segmentation-freeze config/segmentation.freeze.yaml
.venv/bin/python -m tools.provider_gate.cli verify-freeze \
  --freeze config/provider.freeze.yaml \
  --segmentation-freeze config/segmentation.freeze.yaml \
  --report docs/feasibility/three-cat-provider-gate.md
```

Expected: byte-stable files containing Provider/model/version/parameters/retention, official capability-audit checksum, instance/view-yaw/re-ID/segmentation source-license-model-ABI checksums, frozen yaw/re-ID thresholds, pose-evaluator version/parameters and calibration summary checksums, run checksums and `decision: PASS`, with no secret/raw ID/media mapping/reviewer identity.

- [ ] **Step 5: Commit PASS**

```bash
git status --short
git add config/provider.freeze.yaml config/segmentation.freeze.yaml \
  docs/feasibility/three-cat-provider-gate.md
git commit -m "docs: freeze passing three-cat provider gate"
```

Expected: `var/` and media absent; failed gate creates no freeze commit.

## Phase 1 Completion Check

```bash
.venv/bin/python -m pytest tests/unit/providers tests/unit/tools tests/contracts/providers -q
.venv/bin/python -m tools.provider_gate.cli verify-freeze \
  --freeze config/provider.freeze.yaml \
  --segmentation-freeze config/segmentation.freeze.yaml \
  --report docs/feasibility/three-cat-provider-gate.md
pnpm typecheck
git diff --check
```

Expected: live one-job idempotency proof; three cats pass all thresholds; Provider target and local transparent role are separate/checksummed; no Phase 0 recreation, product page, Phase 2 code, private media, raw response, key or reviewer identity. Phase 2 begins only when all commands exit `0`.
