from typing import Protocol
from uuid import UUID


class QueueGateway(Protocol):
    def enqueue_submit(self, stage_job_id: UUID) -> str: ...

    def enqueue_poll(self, stage_job_id: UUID, *, delay_seconds: int) -> str: ...

    def cancel(self, rq_job_id: str) -> None: ...

