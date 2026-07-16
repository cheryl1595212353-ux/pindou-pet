import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

from pindou_pet.main import create_app

REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
SNAPSHOT_PATH = REPOSITORY_ROOT / "packages/contracts/openapi.json"


def render_openapi() -> str:
    return json.dumps(
        create_app().openapi(),
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    ) + "\n"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Write or verify the canonical OpenAPI snapshot")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true", help="write the canonical snapshot")
    mode.add_argument("--check", action="store_true", help="verify without changing files")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    rendered = render_openapi()

    if arguments.write:
        SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
        SNAPSHOT_PATH.write_text(rendered, encoding="utf-8")
        return 0

    try:
        expected = SNAPSHOT_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        print("OpenAPI snapshot is missing. Run `make contracts`.", file=sys.stderr)
        return 1
    if expected != rendered:
        print("OpenAPI snapshot is stale. Run `make contracts`.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

