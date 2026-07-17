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
REQUIRED_REVIEW_FLAGS = (
    "sameIdentity",
    "viewsCorrect",
    "anatomicalMarkingsStable",
    "fullBodyVisible",
    "noExtraLimbs",
    "photographicNotBeadArt",
)


class VisualPrototypeArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        self.print_usage(sys.stderr)
        self.exit(2, f"VISUAL PROTOTYPE ERROR: {self.prog}: error: {message}\n")


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


def _require_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def _require_list(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise ValueError(f"{label} must be a list")
    return value


def _require_artifact(
    value: Any,
    run_root: Path,
    label: str,
    *,
    png: bool = False,
    require_alpha: bool = False,
) -> Path:
    artifact = _require_mapping(value, f"{label} artifact")
    relative_value = artifact.get("path")
    sha256 = artifact.get("sha256")
    if not isinstance(relative_value, str) or not relative_value:
        raise ValueError(f"{label} artifact path must be a non-empty string")
    if not isinstance(sha256, str) or not SHA256_RE.fullmatch(sha256):
        raise ValueError(f"{label} artifact sha256 is malformed")

    relative = PurePosixPath(relative_value)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"{label} artifact path must be relative and contained")
    path = (run_root.resolve() / Path(*relative.parts)).resolve()
    if not path.is_relative_to(run_root.resolve()):
        raise ValueError(f"{label} artifact path escapes run root")
    if not path.is_file():
        raise ValueError(f"{label} artifact is missing: {relative}")
    if sha256_file(path) != sha256:
        raise ValueError(f"{label} artifact hash mismatch: {relative}")

    if png:
        expected_png = {
            "width": artifact.get("width"),
            "height": artifact.get("height"),
            "hasRealAlpha": artifact.get("hasRealAlpha"),
        }
        if (
            type(expected_png["width"]) is not int
            or expected_png["width"] <= 0
            or type(expected_png["height"]) is not int
            or expected_png["height"] <= 0
            or type(expected_png["hasRealAlpha"]) is not bool
        ):
            raise ValueError(f"{label} PNG artifact metadata is malformed")
        actual_png = inspect_png(path, require_alpha=require_alpha)
        if any(actual_png[key] != expected_png[key] for key in expected_png):
            raise ValueError(f"{label} PNG artifact metadata mismatch")
    return path


def _assert_three_view_master(master: Path) -> None:
    evidence = inspect_png(master)
    if evidence["width"] % len(VIEWS) != 0:
        raise ValueError("three-view master width must divide into three equal panels")
    if evidence["width"] // len(VIEWS) < 512 or evidence["height"] < 512:
        raise ValueError("every reference panel must be at least 512x512")


def _assert_reference_provenance(
    master: Path,
    references: Any,
    run_root: Path,
) -> None:
    reference_entries = _require_list(references, "references")
    if len(reference_entries) != len(VIEWS):
        raise ValueError("references must contain the complete frozen view set")
    _assert_three_view_master(master)

    try:
        with Image.open(master) as source:
            source.load()
            panel_width = source.width // len(VIEWS)
            for index, (view, filename) in enumerate(VIEWS):
                entry = _require_mapping(reference_entries[index], "reference")
                if entry.get("view") != view:
                    raise ValueError("reference order is invalid")
                reference_path = _require_artifact(
                    entry,
                    run_root,
                    f"reference {view}",
                    png=True,
                )
                expected_path = (run_root / "references" / filename).resolve()
                if reference_path != expected_path:
                    raise ValueError("reference path does not match frozen view order")
                expected = source.crop(
                    (index * panel_width, 0, (index + 1) * panel_width, source.height)
                ).convert("RGBA")
                with Image.open(reference_path) as reference:
                    actual = reference.convert("RGBA")
                    if actual.size != expected.size or actual.tobytes() != expected.tobytes():
                        raise ValueError("reference pixels do not match the three-view master")
    except (OSError, UnidentifiedImageError) as exc:
        raise ValueError("three-view reference evidence is unreadable") from exc


def _assert_preview_contract(preview_58: Path, preview_464: Path) -> None:
    preview_58_evidence = inspect_png(preview_58, require_alpha=True)
    preview_464_evidence = inspect_png(preview_464, require_alpha=True)
    if (preview_58_evidence["width"], preview_58_evidence["height"]) != (58, 58):
        raise ValueError("preview-58 must be exactly 58x58")
    if (preview_464_evidence["width"], preview_464_evidence["height"]) != (464, 464):
        raise ValueError("preview-464 must be exactly 464x464")
    with Image.open(preview_58) as source, Image.open(preview_464) as preview:
        expected = source.convert("RGBA").resize((464, 464), Image.Resampling.NEAREST)
        if expected.tobytes() != preview.convert("RGBA").tobytes():
            raise ValueError("preview-464 must be the nearest-neighbor 8x preview-58")


def _validate_reference_review_shape(review: Any) -> dict[str, Any]:
    review_object = _require_mapping(review, "reference review")
    if type(review_object.get("pass")) is not bool:
        raise ValueError("reference review pass must be a boolean")
    if any(type(review_object.get(flag)) is not bool for flag in REQUIRED_REVIEW_FLAGS):
        raise ValueError("reference review flags must be booleans")
    if not isinstance(review_object.get("violations"), list):
        raise ValueError("reference review violations must be a list")
    return review_object


def _assert_reference_review(review: Any) -> dict[str, Any]:
    review_object = _validate_reference_review_shape(review)
    if review_object.get("pass") is not True:
        raise ValueError("reference review must pass before prototype PASS")
    if any(review_object.get(flag) is not True for flag in REQUIRED_REVIEW_FLAGS):
        raise ValueError("reference review flags must all pass before prototype PASS")
    if review_object.get("violations") != []:
        raise ValueError("reference review violations must be empty before prototype PASS")
    return review_object


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
        _assert_reference_review(review)
        if not user_approved or selected_candidate_id not in candidate_ids:
            raise ValueError("prototype PASS requires an approved existing candidate")
        _assert_reference_provenance(master, references, run_root)
        selected_dir = run_root / "selected"
        preview_58 = selected_dir / "preview-58.png"
        preview_464 = selected_dir / "preview-464.png"
        _assert_preview_contract(preview_58, preview_464)
        payload["final"] = {
            "character": _relative_artifact(
                selected_dir / "character-hd.png",
                run_root,
                png=True,
                require_alpha=True,
            ),
            "preview58": _relative_artifact(
                preview_58,
                run_root,
                png=True,
                require_alpha=True,
            ),
            "preview464": _relative_artifact(
                preview_464,
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


def verify_manifest(manifest_path: Path, run_root: Path) -> dict[str, Any]:
    payload = _load_json(manifest_path)
    _assert_manifest_safe(payload)
    if payload.get("schemaVersion") != 1:
        raise ValueError("manifest schemaVersion must be 1")
    decision = payload.get("decision")
    if decision not in DECISIONS:
        raise ValueError("manifest decision is invalid")
    master_attempt_count = payload.get("masterAttemptCount")
    if (
        type(master_attempt_count) is not int
        or not 1 <= master_attempt_count <= 3
    ):
        raise ValueError("manifest masterAttemptCount must be between 1 and 3")

    root = run_root.resolve()
    _require_artifact(payload.get("identity"), root, "identity")
    _require_artifact(payload.get("referencePrompt"), root, "reference prompt")
    master = _require_artifact(payload.get("master"), root, "master", png=True)
    review = _validate_reference_review_shape(payload.get("referenceReview"))
    review_evidence = _require_artifact(
        review.get("evidence"), root, "reference review evidence"
    )
    review_payload = {key: value for key, value in review.items() if key != "evidence"}
    if review_payload != _load_json(review_evidence):
        raise ValueError("reference review does not match its evidence artifact")

    references = _require_list(payload.get("references"), "references")
    expected_views = [view for view, _ in VIEWS]
    actual_views: list[str] = []
    for reference in references:
        reference_object = _require_mapping(reference, "reference")
        view = reference_object.get("view")
        if not isinstance(view, str):
            raise ValueError("reference view must be a string")
        actual_views.append(view)

    candidates = _require_list(payload.get("candidates"), "candidates")
    if len(candidates) > 3:
        raise ValueError("manifest contains more than three candidates")
    candidate_ids: set[str] = set()
    for candidate in candidates:
        candidate_object = _require_mapping(candidate, "candidate")
        candidate_id = candidate_object.get("candidateId")
        if not isinstance(candidate_id, str) or not candidate_id:
            raise ValueError("candidateId must be a non-empty string")
        if candidate_id in candidate_ids:
            raise ValueError("candidate IDs must be unique")
        candidate_ids.add(candidate_id)
        _require_artifact(
            candidate_object.get("image"),
            root,
            f"candidate {candidate_id} image",
            png=True,
            require_alpha=True,
        )
        _require_artifact(
            candidate_object.get("prompt"), root, f"candidate {candidate_id} prompt"
        )

    selection = _require_mapping(payload.get("selection"), "selection")
    approved = selection.get("approved")
    selected_candidate_id = selection.get("candidateId")
    correction_count = selection.get("correctionCount")
    if type(approved) is not bool:
        raise ValueError("selection approved must be a boolean")
    if selected_candidate_id is not None and not isinstance(selected_candidate_id, str):
        raise ValueError("selection candidateId must be a string or null")
    if type(correction_count) is not int or correction_count not in (0, 1):
        raise ValueError("selection correctionCount must be 0 or 1")
    if "correctionPrompt" in payload:
        _require_artifact(payload["correctionPrompt"], root, "correction prompt")

    if decision == "VISUAL_PROTOTYPE_PASS":
        _assert_reference_review(review)
        _assert_reference_provenance(master, references, root)
        if not candidate_ids:
            raise ValueError("PASS manifest requires at least one candidate")
        if approved is not True or selected_candidate_id not in candidate_ids:
            raise ValueError("PASS manifest selection must approve an existing candidate")
        final = _require_mapping(payload.get("final"), "final")
        _require_artifact(
            final.get("character"), root, "final character", png=True, require_alpha=True
        )
        preview_58 = _require_artifact(
            final.get("preview58"), root, "final preview58", png=True, require_alpha=True
        )
        preview_464 = _require_artifact(
            final.get("preview464"), root, "final preview464", png=True, require_alpha=True
        )
        _assert_preview_contract(preview_58, preview_464)
        if correction_count == 1 and "correctionPrompt" not in payload:
            raise ValueError("PASS manifest lacks correction prompt")
        if correction_count == 0 and "correctionPrompt" in payload:
            raise ValueError("PASS manifest has an unexpected correction prompt")
    else:
        if actual_views not in ([], expected_views):
            raise ValueError("STOP reference evidence is partial or out of order")
        if actual_views:
            _assert_reference_provenance(master, references, root)
        if approved:
            raise ValueError("STOP manifest cannot claim user approval")

    return payload


def _json_print(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2, default=str))


def build_parser() -> argparse.ArgumentParser:
    parser = VisualPrototypeArgumentParser()
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
