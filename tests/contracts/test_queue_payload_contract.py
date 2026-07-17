from pathlib import Path
from uuid import uuid4

from apps.api.tests.fakes.queue import FakeQueueGateway


def test_queue_payload_contains_only_the_stage_uuid() -> None:
    queue = FakeQueueGateway()
    stage_job_id = uuid4()

    submit_id = queue.enqueue_submit(stage_job_id)
    poll_id = queue.enqueue_poll(stage_job_id, delay_seconds=7)

    assert submit_id != poll_id
    assert queue.calls[0].payload == (stage_job_id,)
    assert queue.calls[0].delay_seconds == 0
    assert queue.calls[1].payload == (stage_job_id,)
    assert queue.calls[1].delay_seconds == 7
    assert all(
        not isinstance(value, (bytes, bytearray, memoryview, Path))
        for call in queue.calls
        for value in call.payload
    )


def test_queue_cancel_is_idempotent() -> None:
    queue = FakeQueueGateway()
    rq_job_id = queue.enqueue_submit(uuid4())

    queue.cancel(rq_job_id)
    queue.cancel(rq_job_id)

    assert queue.cancelled_job_ids == {rq_job_id}
