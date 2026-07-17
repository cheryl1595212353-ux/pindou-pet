from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class QueuedCall:
    kind: str
    payload: tuple[UUID]
    delay_seconds: int


class FakeQueueGateway:
    def __init__(self) -> None:
        self.calls: list[QueuedCall] = []
        self.cancelled_job_ids: set[str] = set()

    def enqueue_submit(self, stage_job_id: UUID) -> str:
        return self._record("submit", stage_job_id, delay_seconds=0)

    def enqueue_poll(self, stage_job_id: UUID, *, delay_seconds: int) -> str:
        if delay_seconds < 0:
            raise ValueError("delay_seconds must be nonnegative")
        return self._record("poll", stage_job_id, delay_seconds=delay_seconds)

    def cancel(self, rq_job_id: str) -> None:
        self.cancelled_job_ids.add(rq_job_id)

    def _record(self, kind: str, stage_job_id: UUID, *, delay_seconds: int) -> str:
        rq_job_id = f"fake-rq-{len(self.calls) + 1}"
        self.calls.append(
            QueuedCall(kind=kind, payload=(stage_job_id,), delay_seconds=delay_seconds)
        )
        return rq_job_id
