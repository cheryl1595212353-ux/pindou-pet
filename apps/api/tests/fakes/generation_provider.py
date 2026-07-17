import hashlib
from dataclasses import dataclass
from typing import Any

from pindou_pet.domain.providers import (
    GenerationRequest,
    NormalizedImageResult,
    ProviderJobState,
)


@dataclass
class _FakeJob:
    request: GenerationRequest
    state: ProviderJobState = ProviderJobState.QUEUED
    normalized_result: NormalizedImageResult | None = None


class FakeGenerationProvider:
    name = "fake-generation-provider"
    model_version = "fake-v1"

    def __init__(self) -> None:
        self._job_ids_by_key: dict[str, str] = {}
        self._jobs: dict[str, _FakeJob] = {}
        self.accepted_count = 0

    def submit(self, request: GenerationRequest, *, idempotency_key: str) -> str:
        if existing := self._job_ids_by_key.get(idempotency_key):
            return existing
        job_id = f"fake-{hashlib.sha256(idempotency_key.encode()).hexdigest()[:24]}"
        self._job_ids_by_key[idempotency_key] = job_id
        self._jobs[job_id] = _FakeJob(request=request)
        self.accepted_count += 1
        return job_id

    def lookup_by_idempotency_key(self, key: str) -> str | None:
        return self._job_ids_by_key.get(key)

    def status(self, provider_job_id: str) -> ProviderJobState:
        return self._jobs[provider_job_id].state

    def result(self, provider_job_id: str) -> NormalizedImageResult:
        result = self._jobs[provider_job_id].normalized_result
        if result is None:
            raise RuntimeError("provider result is not available")
        return result

    def complete(
        self,
        provider_job_id: str,
        result: NormalizedImageResult | dict[str, Any],
    ) -> None:
        normalized = NormalizedImageResult.model_validate(result)
        job = self._jobs[provider_job_id]
        job.normalized_result = normalized
        job.state = ProviderJobState.SUCCEEDED

    def cancel(self, provider_job_id: str) -> None:
        self._jobs[provider_job_id].state = ProviderJobState.CANCELLED

