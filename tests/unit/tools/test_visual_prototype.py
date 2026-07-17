import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from PIL import Image

from tools.visual_prototype import (
    build_manifest,
    inspect_png,
    main,
    render_previews,
    split_master,
    verify_manifest,
)

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
    normalized_prompt = " ".join(prompt.lower().split())

    assert "one wide three-panel contact sheet" in prompt
    assert "FRONT" in prompt
    assert "CAT_LEFT_FRONT_45" in prompt
    assert "CAT_RIGHT_FRONT_45" in prompt
    assert "Do not generate the three views independently" in prompt
    assert "no bead art" in prompt
    assert (
        "the cat's anatomical left is the cat's own left and appears on the "
        "viewer's right in the front panel." in normalized_prompt
    )
    assert "never mirror or exchange the two named head markings." in normalized_prompt


def test_character_prompt_freezes_the_2p5d_square_pixel_contract() -> None:
    prompt = (EXPERIMENT / "prompts" / "character-candidates.md").read_text()
    normalized_prompt = " ".join(prompt.lower().split())

    assert "identity preservation is the highest priority" in normalized_prompt
    assert "static 2.5d pixel-art game sprite" in normalized_prompt
    assert "one screen-aligned 2d raster grid" in normalized_prompt
    assert "flat square pixels with no gaps, holes" in normalized_prompt
    assert "limited-palette clustered highlights and shadows" in normalized_prompt
    assert "real alpha transparency" in normalized_prompt
    assert "orange-and-black back patches" in normalized_prompt
    assert "torso is angled about 20 degrees toward image" in normalized_prompt
    assert "tail on image right" in normalized_prompt
    assert "pixel_art_visual_proxy" in normalized_prompt
    assert "static 2.5d fuse-bead character" not in normalized_prompt
    assert "plastic fuse-bead units" not in normalized_prompt


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
    assert (
        "controlled fine square-pixel texture is allowed" in review["notes"].lower()
    )


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
    _write_final_character_review(run_root)

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


def test_cli_argument_validation_uses_the_visual_prototype_error_prefix() -> None:
    result = subprocess.run(
        [
            sys.executable,
            "tools/visual_prototype.py",
            "manifest",
            "--master-attempts",
            "1",
            "--decision",
            "INVALID",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 2
    assert "VISUAL PROTOTYPE ERROR" in result.stderr


def _save_transparent_swatch(path: Path, size: tuple[int, int]) -> None:
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    image.putpixel((0, 0), (30, 180, 220, 255))
    image.save(path, format="PNG")


def _final_character_review(**updates: object) -> dict[str, object]:
    review: dict[str, object] = {
        "schemaVersion": 1,
        "sameIdentity": True,
        "markingsStable": True,
        "poseCorrect": True,
        "squarePixelGrid": True,
        "limitedBlockShading": True,
        "noBeadOrVoxelMaterials": True,
        "fullBodyVisible": True,
        "noExtraLimbs": True,
        "stylePass": True,
        "alphaValid": True,
        "pass": True,
        "violations": [],
        "notes": "The final character is the reviewed selected image.",
    }
    review.update(updates)
    return review


def _write_final_character_review(run_root: Path, **updates: object) -> Path:
    review_path = run_root / "reviews" / "final-character-consistency.json"
    review_path.write_text(json.dumps(_final_character_review(**updates)))
    return review_path


def _refresh_png_artifact(artifact: dict[str, object], path: Path) -> None:
    artifact.update(inspect_png(path))


def _prepare_passing_run(tmp_path: Path) -> Path:
    run_root = tmp_path / "synthetic-cat-01"
    for name in (
        "identity",
        "prompts",
        "references",
        "reviews",
        "candidates",
        "selected",
    ):
        (run_root / name).mkdir(parents=True, exist_ok=True)

    (run_root / "identity" / "identity-card.json").write_text("{}")
    (run_root / "prompts" / "reference-master.md").write_text("reference")
    (run_root / "prompts" / "candidate-01.md").write_text("candidate")
    master = run_root / "references" / "three-view-master.png"
    _save_rgb(master, (1536, 512))
    split_master(master, run_root / "references")
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
    render_previews(run_root / "selected" / "character-hd.png", run_root / "selected")
    _write_final_character_review(run_root)
    return run_root


def _build_passing_manifest(run_root: Path) -> Path:
    return build_manifest(
        run_root,
        master_attempt_count=1,
        decision="VISUAL_PROTOTYPE_PASS",
        selected_candidate_id="candidate-01",
        user_approved=True,
        correction_count=0,
    )


def test_pass_manifest_embeds_the_valid_final_character_review(tmp_path: Path) -> None:
    run_root = _prepare_passing_run(tmp_path)

    manifest = _build_passing_manifest(run_root)
    payload = json.loads(manifest.read_text())

    assert "review" in payload["final"]
    assert payload["final"]["review"]["evidence"]["path"] == (
        "reviews/final-character-consistency.json"
    )
    assert payload["final"]["review"]["pass"] is True


def test_build_manifest_rejects_missing_or_failed_final_character_review(
    tmp_path: Path,
) -> None:
    run_root = _prepare_passing_run(tmp_path)
    (run_root / "reviews" / "final-character-consistency.json").unlink()

    with pytest.raises(ValueError, match="final character review"):
        _build_passing_manifest(run_root)

    _write_final_character_review(
        run_root,
        markingsStable=False,
        stylePass=False,
        violations=["Markings changed."],
        **{"pass": False},
    )

    with pytest.raises(ValueError, match="final character review"):
        _build_passing_manifest(run_root)


def test_build_and_verify_reject_selected_candidate_final_hash_mismatch(
    tmp_path: Path,
) -> None:
    run_root = _prepare_passing_run(tmp_path)
    _save_transparent_swatch(run_root / "selected" / "character-hd.png", (120, 90))
    render_previews(run_root / "selected" / "character-hd.png", run_root / "selected")

    with pytest.raises(ValueError, match="selected candidate"):
        _build_passing_manifest(run_root)

    shutil.copyfile(
        run_root / "candidates" / "candidate-01.png",
        run_root / "selected" / "character-hd.png",
    )
    render_previews(run_root / "selected" / "character-hd.png", run_root / "selected")
    manifest = _build_passing_manifest(run_root)
    _save_transparent_swatch(run_root / "selected" / "character-hd.png", (120, 90))
    render_previews(run_root / "selected" / "character-hd.png", run_root / "selected")
    payload = json.loads(manifest.read_text())
    _refresh_png_artifact(
        payload["final"]["character"], run_root / "selected" / "character-hd.png"
    )
    _refresh_png_artifact(
        payload["final"]["preview58"], run_root / "selected" / "preview-58.png"
    )
    _refresh_png_artifact(
        payload["final"]["preview464"], run_root / "selected" / "preview-464.png"
    )
    manifest.write_text(json.dumps(payload))

    with pytest.raises(ValueError, match="selected candidate"):
        verify_manifest(manifest, run_root)


def test_corrected_pass_requires_matching_prompt_and_output(tmp_path: Path) -> None:
    run_root = _prepare_passing_run(tmp_path)
    correction_prompt = run_root / "prompts" / "correction.md"
    correction_prompt.write_text("correct only the reviewed selected image")

    with pytest.raises(ValueError, match="correction output"):
        build_manifest(
            run_root,
            master_attempt_count=1,
            decision="VISUAL_PROTOTYPE_PASS",
            selected_candidate_id="candidate-01",
            user_approved=True,
            correction_count=1,
        )

    correction_output = run_root / "reviews" / "correction-call.png"
    shutil.copyfile(run_root / "candidates" / "candidate-01.png", correction_output)
    manifest = build_manifest(
        run_root,
        master_attempt_count=1,
        decision="VISUAL_PROTOTYPE_PASS",
        selected_candidate_id="candidate-01",
        user_approved=True,
        correction_count=1,
    )
    payload = json.loads(manifest.read_text())
    assert "correctionOutput" in payload

    _save_transparent_swatch(correction_output, (120, 90))
    _refresh_png_artifact(payload["correctionOutput"], correction_output)
    manifest.write_text(json.dumps(payload))

    with pytest.raises(ValueError, match="correction output"):
        verify_manifest(manifest, run_root)


def test_stop_manifest_requires_null_selection_and_records_opaque_correction_output(
    tmp_path: Path,
) -> None:
    run_root = _prepare_passing_run(tmp_path)
    (run_root / "prompts" / "correction.md").write_text("attempt correction")
    _save_rgb(run_root / "reviews" / "correction-call.png", (120, 90))

    with pytest.raises(ValueError, match="candidateId"):
        build_manifest(
            run_root,
            master_attempt_count=1,
            decision="STOP_REVISE_STYLE",
            selected_candidate_id="candidate-01",
            user_approved=False,
            correction_count=1,
        )

    manifest = build_manifest(
        run_root,
        master_attempt_count=1,
        decision="STOP_REVISE_STYLE",
        selected_candidate_id=None,
        user_approved=False,
        correction_count=1,
    )
    payload = json.loads(manifest.read_text())
    assert "correctionPrompt" in payload
    assert payload["correctionOutput"]["hasRealAlpha"] is False
    assert verify_manifest(manifest, run_root)["decision"] == "STOP_REVISE_STYLE"

    payload["selection"]["candidateId"] = "candidate-01"
    manifest.write_text(json.dumps(payload))
    with pytest.raises(ValueError, match="candidateId"):
        verify_manifest(manifest, run_root)


def test_correction_count_zero_rejects_prompt_and_output_evidence(tmp_path: Path) -> None:
    run_root = _prepare_passing_run(tmp_path)
    (run_root / "prompts" / "correction.md").write_text("unexpected correction")

    with pytest.raises(ValueError, match="correction prompt"):
        build_manifest(
            run_root,
            master_attempt_count=1,
            decision="STOP_REVISE_STYLE",
            selected_candidate_id=None,
            user_approved=False,
            correction_count=0,
        )

    (run_root / "prompts" / "correction.md").unlink()
    manifest = build_manifest(
        run_root,
        master_attempt_count=1,
        decision="STOP_REVISE_STYLE",
        selected_candidate_id=None,
        user_approved=False,
        correction_count=0,
    )
    _save_rgb(run_root / "reviews" / "correction-call.png", (120, 90))

    with pytest.raises(ValueError, match="correction output"):
        verify_manifest(manifest, run_root)


def test_build_and_verify_reject_nested_sensitive_manifest_values(tmp_path: Path) -> None:
    run_root = _prepare_passing_run(tmp_path)
    reference_review = run_root / "reviews" / "reference-consistency.json"
    review = json.loads(reference_review.read_text())
    review["notes"] = "token=demo"
    reference_review.write_text(json.dumps(review))

    with pytest.raises(ValueError, match="forbidden manifest string"):
        _build_passing_manifest(run_root)

    review["notes"] = "ordinary reviewed note"
    reference_review.write_text(json.dumps(review))
    manifest = _build_passing_manifest(run_root)
    payload = json.loads(manifest.read_text())
    review["notes"] = "api_key=demo"
    reference_review.write_text(json.dumps(review))
    payload["referenceReview"]["notes"] = review["notes"]
    payload["referenceReview"]["evidence"]["sha256"] = hashlib.sha256(
        reference_review.read_bytes()
    ).hexdigest()
    manifest.write_text(json.dumps(payload))

    with pytest.raises(ValueError, match="forbidden manifest string"):
        verify_manifest(manifest, run_root)


@pytest.mark.parametrize("invalid_version", [True, 1.0, "1", None])
def test_manifest_rejects_non_exact_top_level_schema_version(
    tmp_path: Path, invalid_version: object
) -> None:
    run_root = _prepare_passing_run(tmp_path)
    manifest = _build_passing_manifest(run_root)
    payload = json.loads(manifest.read_text())
    payload["schemaVersion"] = invalid_version
    manifest.write_text(json.dumps(payload))

    with pytest.raises(ValueError, match="schemaVersion"):
        verify_manifest(manifest, run_root)


@pytest.mark.parametrize("invalid_version", [True, 1.0, "1", None])
def test_build_rejects_non_exact_review_schema_versions(
    tmp_path: Path, invalid_version: object
) -> None:
    run_root = _prepare_passing_run(tmp_path)
    reference_review = run_root / "reviews" / "reference-consistency.json"
    reference_payload = json.loads(reference_review.read_text())
    reference_payload["schemaVersion"] = invalid_version
    reference_review.write_text(json.dumps(reference_payload))

    with pytest.raises(ValueError, match="reference review schemaVersion"):
        _build_passing_manifest(run_root)

    reference_payload["schemaVersion"] = 1
    reference_review.write_text(json.dumps(reference_payload))
    _write_final_character_review(run_root, schemaVersion=invalid_version)

    with pytest.raises(ValueError, match="final character review schemaVersion"):
        _build_passing_manifest(run_root)


def test_verify_manifest_rejects_forged_final_review_evidence(tmp_path: Path) -> None:
    run_root = _prepare_passing_run(tmp_path)
    manifest = _build_passing_manifest(run_root)
    payload = json.loads(manifest.read_text())

    assert "review" in payload["final"]
    payload["final"]["review"]["notes"] = "forged review text"
    manifest.write_text(json.dumps(payload))

    with pytest.raises(ValueError, match="final character review"):
        verify_manifest(manifest, run_root)


def test_build_manifest_rejects_invalid_pass_master_and_reference_provenance(
    tmp_path: Path,
) -> None:
    run_root = _prepare_passing_run(tmp_path)
    _save_rgb(run_root / "references" / "three-view-master.png", (1200, 512))

    with pytest.raises(ValueError, match="512"):
        _build_passing_manifest(run_root)

    _save_rgb(run_root / "references" / "three-view-master.png", (1536, 512))
    _save_transparent_swatch(run_root / "references" / "front.png", (512, 512))

    with pytest.raises(ValueError, match="reference"):
        _build_passing_manifest(run_root)


def test_verify_manifest_rejects_forged_pass_review_selection_and_final(
    tmp_path: Path,
) -> None:
    run_root = _prepare_passing_run(tmp_path)
    manifest = _build_passing_manifest(run_root)
    payload = json.loads(manifest.read_text())
    payload["referenceReview"]["sameIdentity"] = False
    manifest.write_text(json.dumps(payload))

    with pytest.raises(ValueError, match="reference review"):
        verify_manifest(manifest, run_root)

    manifest = _build_passing_manifest(run_root)
    payload = json.loads(manifest.read_text())
    payload["selection"]["candidateId"] = "candidate-99"
    manifest.write_text(json.dumps(payload))

    with pytest.raises(ValueError, match="selection"):
        verify_manifest(manifest, run_root)

    manifest = _build_passing_manifest(run_root)
    payload = json.loads(manifest.read_text())
    payload["final"] = {"character": payload["final"]["character"]}
    manifest.write_text(json.dumps(payload))

    with pytest.raises(ValueError, match="final"):
        verify_manifest(manifest, run_root)


def test_verify_manifest_rejects_malformed_pass_collections_and_artifacts(
    tmp_path: Path,
) -> None:
    run_root = _prepare_passing_run(tmp_path)
    manifest = _build_passing_manifest(run_root)
    payload = json.loads(manifest.read_text())
    payload["references"] = None
    manifest.write_text(json.dumps(payload))

    with pytest.raises(ValueError, match="references"):
        verify_manifest(manifest, run_root)

    manifest = _build_passing_manifest(run_root)
    payload = json.loads(manifest.read_text())
    payload["candidates"] = [{"candidateId": "candidate-01"}]
    manifest.write_text(json.dumps(payload))

    with pytest.raises(ValueError, match="candidate"):
        verify_manifest(manifest, run_root)

    manifest = _build_passing_manifest(run_root)
    payload = json.loads(manifest.read_text())
    payload["identity"]["path"] = 42
    manifest.write_text(json.dumps(payload))

    with pytest.raises(ValueError, match="artifact"):
        verify_manifest(manifest, run_root)


def test_verify_manifest_rejects_forged_master_reference_and_preview_evidence(
    tmp_path: Path,
) -> None:
    run_root = _prepare_passing_run(tmp_path)
    manifest = _build_passing_manifest(run_root)
    master = run_root / "references" / "three-view-master.png"
    _save_rgb(master, (1200, 512))
    payload = json.loads(manifest.read_text())
    payload["master"].update(inspect_png(master))
    manifest.write_text(json.dumps(payload))

    with pytest.raises(ValueError, match="512"):
        verify_manifest(manifest, run_root)

    _save_rgb(master, (1536, 512))
    split_master(master, run_root / "references")
    manifest = _build_passing_manifest(run_root)
    front = run_root / "references" / "front.png"
    _save_transparent_swatch(front, (512, 512))
    payload = json.loads(manifest.read_text())
    payload["references"][0].update(inspect_png(front))
    manifest.write_text(json.dumps(payload))

    with pytest.raises(ValueError, match="reference"):
        verify_manifest(manifest, run_root)

    split_master(
        run_root / "references" / "three-view-master.png",
        run_root / "references",
    )
    manifest = _build_passing_manifest(run_root)
    preview_464 = run_root / "selected" / "preview-464.png"
    _save_transparent_swatch(preview_464, (464, 464))
    payload = json.loads(manifest.read_text())
    payload["final"]["preview464"].update(inspect_png(preview_464))
    manifest.write_text(json.dumps(payload))

    with pytest.raises(ValueError, match="preview"):
        verify_manifest(manifest, run_root)


def test_build_manifest_rejects_invalid_preview_relationship(tmp_path: Path) -> None:
    run_root = _prepare_passing_run(tmp_path)
    _save_transparent_swatch(run_root / "selected" / "preview-58.png", (57, 58))

    with pytest.raises(ValueError, match="58x58"):
        _build_passing_manifest(run_root)

    render_previews(run_root / "selected" / "character-hd.png", run_root / "selected")
    _save_transparent_swatch(run_root / "selected" / "preview-464.png", (464, 464))

    with pytest.raises(ValueError, match="preview"):
        _build_passing_manifest(run_root)


def test_cli_reports_malformed_manifest_as_a_validation_error(tmp_path: Path) -> None:
    run_root = _prepare_passing_run(tmp_path)
    manifest = _build_passing_manifest(run_root)
    payload = json.loads(manifest.read_text())
    payload["references"] = None
    manifest.write_text(json.dumps(payload))

    result = subprocess.run(
        [
            sys.executable,
            "tools/visual_prototype.py",
            "verify",
            str(manifest),
            str(run_root),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 2
    assert "VISUAL PROTOTYPE ERROR" in result.stderr


def test_cli_reports_decompression_bomb_as_a_validation_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    image = tmp_path / "small.png"
    _save_rgb(image, (120, 90))
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 1)

    assert main(["check", str(image)]) == 2

    captured = capsys.readouterr()
    assert "VISUAL PROTOTYPE ERROR" in captured.err
    assert "Traceback" not in captured.err
