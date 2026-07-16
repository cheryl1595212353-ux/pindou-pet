from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

from pindou_pet.config import Settings
from pindou_pet.infrastructure.db import create_engine_from_settings


ROOT = Path(__file__).resolve().parents[4]


def test_sqlite_connections_enable_wal_foreign_keys_and_busy_timeout(tmp_path: Path) -> None:
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'database.db'}",
        storage_root=tmp_path / "storage",
    )
    engine = create_engine_from_settings(settings)

    with engine.connect() as connection:
        assert connection.execute(text("PRAGMA journal_mode")).scalar_one().lower() == "wal"
        assert connection.execute(text("PRAGMA foreign_keys")).scalar_one() == 1
        assert connection.execute(text("PRAGMA busy_timeout")).scalar_one() == 5000


def test_empty_database_upgrades_to_foundation_head(tmp_path: Path) -> None:
    database_url = f"sqlite:///{tmp_path / 'migration.db'}"
    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)

    command.upgrade(config, "head")

    settings = Settings(database_url=database_url, storage_root=tmp_path / "storage")
    engine = create_engine_from_settings(settings)
    assert "schema_metadata" in inspect(engine).get_table_names()
    with engine.connect() as connection:
        revision = connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one()
    assert revision == "0001_foundation"
