import os
from uuid import uuid4

import pytest
from redis import Redis


@pytest.mark.redis
def test_real_redis_round_trip() -> None:
    if os.environ.get("RUN_REDIS_TESTS") != "1":
        pytest.skip("set RUN_REDIS_TESTS=1 to run the real Redis smoke test")

    redis_url = os.environ.get("PINDOU_REDIS_URL")
    if not redis_url:
        pytest.fail("PINDOU_REDIS_URL is required when RUN_REDIS_TESTS=1")

    client = Redis.from_url(redis_url, decode_responses=True)
    key = f"pindou:smoke:{uuid4()}"
    key_was_written = False
    try:
        assert client.ping() is True
        assert client.set(key, "ok", ex=60) is True
        key_was_written = True
        assert client.get(key) == "ok"
        assert 0 < client.ttl(key) <= 60
    finally:
        if key_was_written:
            client.delete(key)
        client.close()
