import hashlib
import io

import pytest
from PIL import Image
from pydantic import ValidationError
from pydantic_core import PydanticSerializationError

from apps.api.tests.fakes.generation_provider import FakeGenerationProvider
from pindou_pet.domain.enums import JobStatus, PartLabel, PhotoView, ProjectStatus
from pindou_pet.domain.providers import (
    PART_LABEL_ORDER,
    GenerationRequest,
    IdentityTraits,
    NormalizedImageResult,
    NormalizedPartMasks,
    PromptGeometry,
    ProviderJobState,
    ReferenceImage,
    SegmentationRequest,
    TargetPose,
)


def png_bytes(*, width: int = 2, height: int = 2, color: str = "#ad7a55") -> bytes:
    output = io.BytesIO()
    Image.new("RGBA", (width, height), color).save(output, format="PNG")
    return output.getvalue()


def reference_image(view: PhotoView) -> ReferenceImage:
    image = png_bytes()
    return ReferenceImage(
        view=view,
        png_bytes=image,
        content_hash=hashlib.sha256(image).hexdigest(),
        width=2,
        height=2,
    )


def identity_traits() -> IdentityTraits:
    return IdentityTraits(
        face_shape="round",
        ear_shape="upright",
        eye_description="amber",
        body_build="compact",
        primary_coat_colors=("#ad7a55", "#f4e4cc"),
        distinctive_markings=("white chest",),
    )


def generation_request() -> GenerationRequest:
    return GenerationRequest(
        reference_images=tuple(reference_image(view) for view in PhotoView),
        identity_traits=identity_traits(),
        target_pose=TargetPose(),
        attempt=0,
        seed=20260716,
    )


def prompt_map() -> dict[PartLabel, PromptGeometry]:
    return {
        label: PromptGeometry(box=(0, 0, 2, 2), points=((1, 1),))
        for label in PART_LABEL_ORDER
    }


def test_enums_and_part_order_are_frozen() -> None:
    assert [view.value for view in PhotoView] == [
        "FRONT",
        "CAT_LEFT_FRONT_45",
        "CAT_RIGHT_FRONT_45",
    ]
    assert [label.value for label in PartLabel] == [
        "BODY",
        "HEAD",
        "SCREEN_LEFT_FRONT_PAW",
        "SCREEN_RIGHT_FRONT_PAW",
        "TAIL",
        "EYES",
    ]
    assert PART_LABEL_ORDER == tuple(PartLabel)
    assert [status.value for status in ProjectStatus] == [
        "UPLOADED",
        "PROCESSING",
        "LAYER_REVIEW",
        "BEAD_REVIEW",
        "READY",
        "FAILED",
        "CANCELLED",
        "EXPIRED",
    ]
    assert [status.value for status in JobStatus] == [
        "QUEUED",
        "SUBMITTING",
        "SUBMIT_UNKNOWN",
        "WAITING_PROVIDER",
        "SUCCEEDED",
        "FAILED",
        "CANCELLED",
    ]

    for forbidden in ("LEFT_FRONT_PAW", "RIGHT_FRONT_PAW", "EYES_OPEN", "EYES_CLOSED"):
        with pytest.raises(ValueError):
            PartLabel(forbidden)


def test_reference_image_has_only_the_approved_in_memory_fields() -> None:
    image = reference_image(PhotoView.FRONT)

    assert set(type(image).model_fields) == {
        "view",
        "png_bytes",
        "content_hash",
        "width",
        "height",
    }
    assert image.png_bytes not in repr(image).encode()
    with pytest.raises(PydanticSerializationError, match="must not be serialized to JSON"):
        image.model_dump_json()

    with pytest.raises(ValidationError):
        ReferenceImage(
            view=PhotoView.FRONT,
            png_bytes=image.png_bytes,
            content_hash="0" * 64,
            width=2,
            height=2,
        )


def test_generation_request_requires_three_ordered_verified_views() -> None:
    request = generation_request()

    assert tuple(image.view for image in request.reference_images) == tuple(PhotoView)
    assert request.target_pose == TargetPose(
        face_direction="front",
        body_rotation_degrees=20,
        tail_side="screen_right",
    )

    with pytest.raises(ValidationError):
        GenerationRequest(
            reference_images=(
                reference_image(PhotoView.FRONT),
                reference_image(PhotoView.CAT_RIGHT_FRONT_45),
                reference_image(PhotoView.CAT_LEFT_FRONT_45),
            ),
            identity_traits=identity_traits(),
            target_pose=TargetPose(),
            attempt=0,
            seed=1,
        )

    with pytest.raises(ValidationError):
        TargetPose(face_direction="left", body_rotation_degrees=20, tail_side="screen_right")


def test_segmentation_request_requires_all_six_unique_prompts() -> None:
    image = png_bytes()
    request = SegmentationRequest(
        png_bytes=image,
        content_hash=hashlib.sha256(image).hexdigest(),
        width=2,
        height=2,
        part_labels=PART_LABEL_ORDER,
        prompts=prompt_map(),
    )
    assert request.part_labels == PART_LABEL_ORDER
    assert tuple(request.prompts) == PART_LABEL_ORDER

    with pytest.raises(ValidationError):
        SegmentationRequest(
            png_bytes=image,
            content_hash=hashlib.sha256(image).hexdigest(),
            width=2,
            height=2,
            part_labels=PART_LABEL_ORDER[:-1],
            prompts={label: prompt_map()[label] for label in PART_LABEL_ORDER[:-1]},
        )

    with pytest.raises(ValidationError):
        SegmentationRequest(
            png_bytes=image,
            content_hash=hashlib.sha256(image).hexdigest(),
            width=2,
            height=2,
            part_labels=(*PART_LABEL_ORDER[:-1], PartLabel.TAIL),
            prompts=prompt_map(),
        )


def test_normalized_masks_are_total_binary_and_dimension_matched() -> None:
    valid = {label: bytes((0, 255, 255, 0)) for label in PART_LABEL_ORDER}
    result = NormalizedPartMasks(
        part_labels=PART_LABEL_ORDER,
        width=2,
        height=2,
        masks=valid,
        model_version="fake-segmenter-v1",
        source_content_hash="a" * 64,
    )
    assert tuple(result.masks) == PART_LABEL_ORDER

    missing = dict(valid)
    missing.pop(PartLabel.EYES)
    with pytest.raises(ValidationError):
        NormalizedPartMasks(
            part_labels=PART_LABEL_ORDER,
            width=2,
            height=2,
            masks=missing,
            model_version="fake-segmenter-v1",
            source_content_hash="a" * 64,
        )

    with pytest.raises(ValidationError):
        NormalizedPartMasks(
            part_labels=PART_LABEL_ORDER,
            width=2,
            height=2,
            masks={**valid, "FOREGROUND": bytes((0, 255, 255, 0))},
            model_version="fake-segmenter-v1",
            source_content_hash="a" * 64,
        )

    with pytest.raises(ValidationError):
        NormalizedPartMasks(
            part_labels=PART_LABEL_ORDER,
            width=3,
            height=2,
            masks=valid,
            model_version="fake-segmenter-v1",
            source_content_hash="a" * 64,
        )

    corrupt = dict(valid)
    corrupt[PartLabel.BODY] = bytes((0, 1, 255, 0))
    with pytest.raises(ValidationError):
        NormalizedPartMasks(
            part_labels=PART_LABEL_ORDER,
            width=2,
            height=2,
            masks=corrupt,
            model_version="fake-segmenter-v1",
            source_content_hash="a" * 64,
        )


def test_fake_provider_is_idempotent_recoverable_and_cancel_safe() -> None:
    provider = FakeGenerationProvider()
    request = generation_request()

    first = provider.submit(request, idempotency_key="same-key")
    second = provider.submit(request, idempotency_key="same-key")

    assert first == second
    assert provider.accepted_count == 1
    assert provider.lookup_by_idempotency_key("same-key") == first
    provider.cancel(first)
    provider.cancel(first)
    assert provider.status(first) is ProviderJobState.CANCELLED


def test_fake_provider_rejects_an_abnormal_result() -> None:
    provider = FakeGenerationProvider()
    job_id = provider.submit(generation_request(), idempotency_key="bad-result")

    with pytest.raises(ValidationError):
        provider.complete(
            job_id,
            {
                "png_bytes": b"not-a-png",
                "width": 2,
                "height": 2,
                "content_hash": hashlib.sha256(b"not-a-png").hexdigest(),
                "seed": 1,
                "model_name": "fake",
                "model_version": "v1",
                "request_fingerprint": "b" * 64,
            },
        )


def test_normalized_image_result_exposes_only_the_frozen_fields() -> None:
    image = png_bytes()
    result = NormalizedImageResult(
        png_bytes=image,
        width=2,
        height=2,
        content_hash=hashlib.sha256(image).hexdigest(),
        seed=1,
        model_name="fake",
        model_version="v1",
        request_fingerprint="b" * 64,
    )
    assert set(type(result).model_fields) == {
        "png_bytes",
        "width",
        "height",
        "content_hash",
        "seed",
        "model_name",
        "model_version",
        "request_fingerprint",
    }
