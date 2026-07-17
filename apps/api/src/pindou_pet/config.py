from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PINDOU_",
        env_file=".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="forbid",
    )

    env: str = "development"
    database_url: str = "sqlite:///var/pindou.db"
    storage_root: Path = Path("var/storage")
    redis_url: str = "redis://127.0.0.1:6379/15"
    session_secret: str = "test-only-secret"
    generation_api_key: SecretStr | None = None
