import sqlite3
from collections.abc import Callable
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from pindou_pet.api.router import create_api_router
from pindou_pet.config import Settings


def _sqlite_path(database_url: str) -> Path:
    prefix = "sqlite:///"
    if not database_url.startswith(prefix):
        raise OSError("Phase 0 readiness supports the configured SQLite database only")
    return Path(database_url.removeprefix(prefix))


def _default_readiness_check(settings: Settings) -> None:
    settings.storage_root.mkdir(parents=True, exist_ok=True)
    database_path = _sqlite_path(settings.database_url)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database_path) as connection:
        connection.execute("SELECT 1").fetchone()


def create_app(
    settings: Settings | None = None,
    readiness_check: Callable[[], None] | None = None,
) -> FastAPI:
    resolved_settings = settings or Settings()
    resolved_readiness_check = readiness_check or (
        lambda: _default_readiness_check(resolved_settings)
    )

    app = FastAPI(title="Pindou Pet API")
    app.include_router(create_api_router(resolved_readiness_check))

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content={"error": {"code": "NOT_FOUND", "message": "Resource not found"}},
            )
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": "HTTP_ERROR", "message": str(exc.detail)}},
        )

    return app
