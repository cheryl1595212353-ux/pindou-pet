from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def test_runtime_and_private_paths_are_declared() -> None:
    assert (ROOT / ".python-version").read_text().strip() == "3.12"
    assert (ROOT / ".nvmrc").read_text().strip() == "24"

    ignore = (ROOT / ".gitignore").read_text()
    assert ".env" in ignore
    assert ".venv/" in ignore
    assert "var/" in ignore
