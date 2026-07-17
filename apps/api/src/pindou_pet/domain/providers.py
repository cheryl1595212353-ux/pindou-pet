import hashlib
import io
from collections.abc import Mapping
from enum import StrEnum
from typing import Annotated, Literal, Protocol

from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_validator

from pindou_pet.domain.enums import PartLabel, PhotoView

PART_LABEL_ORDER = tuple(PartLabel)
PHOTO_VIEW_ORDER = tuple(PhotoView)
Sha256 = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


def _validate_png(png_bytes: bytes, *, width: int, height: int) -> None:
    try:
        with Image.open(io.BytesIO(png_bytes)) as image:
            actual_size = image.size
            image_format = image.format
            image.verify()
    except (OSError, UnidentifiedImageError) as exc:
        raise ValueError("image bytes must contain a valid PNG") from exc
    if image_format != "PNG":
        raise ValueError("image bytes must use PNG format")
    if actual_size != (width, height):
        raise ValueError("declared image dimensions do not match the PNG")


def _validate_hash(data: bytes, expected_hash: str) -> None:
    if hashlib.sha256(data).hexdigest() != expected_hash:
        raise ValueError("content_hash does not match the image bytes")


class ReferenceImage(ContractModel):
    view: PhotoView
    png_bytes: bytes = Field(repr=False)
    content_hash: Sha256
    width: int = Field(gt=0)
    height: int = Field(gt=0)

    @field_serializer("png_bytes", when_used="json")
    def reject_json_serialization(self, _value: bytes) -> str:
        raise ValueError("reference image bytes must not be serialized to JSON")

    @model_validator(mode="after")
    def validate_image(self) -> "ReferenceImage":
        _validate_hash(self.png_bytes, self.content_hash)
        _validate_png(self.png_bytes, width=self.width, height=self.height)
        return self


class IdentityTraits(ContractModel):
    face_shape: str = Field(min_length=1)
    ear_shape: str = Field(min_length=1)
    eye_description: str = Field(min_length=1)
    body_build: str = Field(min_length=1)
    primary_coat_colors: tuple[str, ...] = Field(min_length=1, max_length=5)
    distinctive_markings: tuple[str, ...]


class TargetPose(ContractModel):
    face_direction: Literal["front"] = "front"
    body_rotation_degrees: Literal[20] = 20
    tail_side: Literal["screen_right"] = "screen_right"


class GenerationRequest(ContractModel):
    reference_images: tuple[ReferenceImage, ...]
    identity_traits: IdentityTraits
    target_pose: TargetPose
    edit_mask: bytes | None = Field(default=None, repr=False)
    edit_instruction: str | None = None
    attempt: int = Field(ge=0)
    seed: int

    @model_validator(mode="after")
    def validate_reference_order(self) -> "GenerationRequest":
        views = tuple(image.view for image in self.reference_images)
        if views != PHOTO_VIEW_ORDER:
            raise ValueError("reference_images must contain the three PhotoView values in order")
        if (self.edit_mask is None) != (self.edit_instruction is None):
            raise ValueError("edit_mask and edit_instruction must be supplied together")
        return self


class PromptGeometry(ContractModel):
    box: tuple[int, int, int, int]
    points: tuple[tuple[int, int], ...] = ()

    @model_validator(mode="after")
    def validate_box(self) -> "PromptGeometry":
        left, top, right, bottom = self.box
        if left < 0 or top < 0 or right <= left or bottom <= top:
            raise ValueError("prompt box must have positive geometry")
        return self


class SegmentationRequest(ContractModel):
    png_bytes: bytes = Field(repr=False)
    content_hash: Sha256
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    part_labels: tuple[PartLabel, ...]
    prompts: Mapping[PartLabel, PromptGeometry]

    @model_validator(mode="after")
    def validate_request(self) -> "SegmentationRequest":
        _validate_hash(self.png_bytes, self.content_hash)
        _validate_png(self.png_bytes, width=self.width, height=self.height)
        if self.part_labels != PART_LABEL_ORDER:
            raise ValueError("part_labels must contain the six PartLabel values in order")
        if tuple(self.prompts) != self.part_labels:
            raise ValueError("prompts must contain exactly one ordered entry per part label")
        for prompt in self.prompts.values():
            left, top, right, bottom = prompt.box
            if right > self.width or bottom > self.height:
                raise ValueError("prompt box exceeds image dimensions")
            if any(not (0 <= x < self.width and 0 <= y < self.height) for x, y in prompt.points):
                raise ValueError("prompt point exceeds image dimensions")
        return self


class NormalizedPartMasks(ContractModel):
    part_labels: tuple[PartLabel, ...]
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    masks: Mapping[PartLabel, bytes] = Field(repr=False)
    model_version: str = Field(min_length=1)
    source_content_hash: Sha256

    @model_validator(mode="after")
    def validate_masks(self) -> "NormalizedPartMasks":
        if self.part_labels != PART_LABEL_ORDER:
            raise ValueError("part_labels must contain the six PartLabel values in order")
        if tuple(self.masks) != self.part_labels:
            raise ValueError("masks must contain exactly one ordered entry per part label")
        expected_size = self.width * self.height
        for mask in self.masks.values():
            if len(mask) != expected_size:
                raise ValueError("binary mask dimensions do not match width and height")
            if not set(mask).issubset({0, 255}):
                raise ValueError("binary masks may contain only 0 and 255")
        return self


class NormalizedImageResult(ContractModel):
    png_bytes: bytes = Field(repr=False)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    content_hash: Sha256
    seed: int
    model_name: str = Field(min_length=1)
    model_version: str = Field(min_length=1)
    request_fingerprint: Sha256

    @model_validator(mode="after")
    def validate_result(self) -> "NormalizedImageResult":
        _validate_hash(self.png_bytes, self.content_hash)
        _validate_png(self.png_bytes, width=self.width, height=self.height)
        return self


class ProviderJobState(StrEnum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED_RETRYABLE = "FAILED_RETRYABLE"
    FAILED_FINAL = "FAILED_FINAL"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class GenerationProvider(Protocol):
    name: str
    model_version: str

    def submit(self, request: GenerationRequest, *, idempotency_key: str) -> str: ...

    def lookup_by_idempotency_key(self, key: str) -> str | None: ...

    def status(self, provider_job_id: str) -> ProviderJobState: ...

    def result(self, provider_job_id: str) -> NormalizedImageResult: ...

    def cancel(self, provider_job_id: str) -> None: ...


class SegmentationProvider(Protocol):
    model_version: str

    def segment(self, request: SegmentationRequest) -> NormalizedPartMasks: ...
