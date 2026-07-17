from collections.abc import Callable

from fastapi import APIRouter, Response, status
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


def create_api_router(readiness_check: Callable[[], None]) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.get("/health/live", response_model=HealthResponse)
    def live() -> HealthResponse:
        return HealthResponse(status="live")

    @router.get(
        "/health/ready",
        response_model=HealthResponse,
        responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": HealthResponse}},
    )
    def ready(response: Response) -> HealthResponse:
        try:
            readiness_check()
        except OSError:
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            return HealthResponse(status="not_ready")
        return HealthResponse(status="ready")

    return router
