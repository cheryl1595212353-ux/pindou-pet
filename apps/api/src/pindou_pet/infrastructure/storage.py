import hashlib
import os
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import BinaryIO, Protocol
from uuid import uuid4


@dataclass(frozen=True)
class StoredObject:
    key: str
    content_hash: str
    size: int


class ObjectStorage(Protocol):
    def put_atomic(self, *, namespace: str, data: bytes) -> StoredObject: ...

    def open(self, key: str) -> BinaryIO: ...

    def exists(self, key: str) -> bool: ...

    def delete(self, key: str) -> None: ...


class FileObjectStorage:
    def __init__(self, root: Path) -> None:
        self._root = root.resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    def _resolve(self, key: str) -> Path:
        logical_path = PurePosixPath(key)
        if (
            logical_path.is_absolute()
            or not logical_path.parts
            or any(part in {"", ".", ".."} for part in logical_path.parts)
            or "\\" in key
        ):
            raise ValueError("unsafe storage path")

        resolved = (self._root / Path(*logical_path.parts)).resolve()
        if resolved != self._root and self._root not in resolved.parents:
            raise ValueError("unsafe storage path")
        return resolved

    def put_atomic(self, *, namespace: str, data: bytes) -> StoredObject:
        namespace_path = self._resolve(namespace)
        content_hash = hashlib.sha256(data).hexdigest()
        key = f"{PurePosixPath(namespace).as_posix()}/{content_hash}"
        target = self._resolve(key)
        target.parent.mkdir(parents=True, exist_ok=True)

        if target.exists():
            return StoredObject(key=key, content_hash=content_hash, size=len(data))

        temporary = namespace_path / f".{uuid4().hex}.part"
        try:
            with temporary.open("xb") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, target)
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise

        return StoredObject(key=key, content_hash=content_hash, size=len(data))

    def open(self, key: str) -> BinaryIO:
        return self._resolve(key).open("rb")

    def exists(self, key: str) -> bool:
        return self._resolve(key).is_file()

    def delete(self, key: str) -> None:
        self._resolve(key).unlink(missing_ok=True)
