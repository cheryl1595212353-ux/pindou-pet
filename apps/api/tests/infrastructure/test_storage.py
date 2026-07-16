import hashlib
import os
from pathlib import Path

import pytest

from pindou_pet.infrastructure.storage import FileObjectStorage


def test_atomic_put_is_content_addressed_and_repeatable(tmp_path: Path) -> None:
    storage = FileObjectStorage(tmp_path)
    data = b"canonical-pindou-image"

    first = storage.put_atomic(namespace="uploads", data=data)
    second = storage.put_atomic(namespace="uploads", data=data)

    expected_hash = hashlib.sha256(data).hexdigest()
    assert first.content_hash == expected_hash
    assert first.key == f"uploads/{expected_hash}"
    assert second == first
    assert storage.exists(first.key)
    with storage.open(first.key) as stored:
        assert stored.read() == data
    assert list(tmp_path.rglob("*.part")) == []


def test_failed_publish_removes_temporary_part(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    storage = FileObjectStorage(tmp_path)

    def fail_replace(_source: Path, _target: Path) -> None:
        raise OSError("injected replace failure")

    monkeypatch.setattr(os, "replace", fail_replace)

    with pytest.raises(OSError, match="injected replace failure"):
        storage.put_atomic(namespace="uploads", data=b"not-published")

    assert list(tmp_path.rglob("*.part")) == []


@pytest.mark.parametrize("unsafe", ["../secret", "/absolute", "safe/../../secret"])
def test_storage_rejects_path_traversal(tmp_path: Path, unsafe: str) -> None:
    storage = FileObjectStorage(tmp_path)

    with pytest.raises(ValueError, match="unsafe storage path"):
        storage.put_atomic(namespace=unsafe, data=b"private")
