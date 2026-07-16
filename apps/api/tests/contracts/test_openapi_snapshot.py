import json
from pathlib import Path

from pindou_pet.main import create_app

REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
SNAPSHOT_PATH = REPOSITORY_ROOT / "packages/contracts/openapi.json"


def test_openapi_snapshot_matches_application_schema() -> None:
    actual = json.dumps(
        create_app().openapi(),
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    ) + "\n"

    assert SNAPSHOT_PATH.read_text(encoding="utf-8") == actual

