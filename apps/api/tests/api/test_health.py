from fastapi.testclient import TestClient

from pindou_pet.main import create_app


def test_live_and_ready_are_distinct() -> None:
    client = TestClient(create_app())

    assert client.get("/api/health/live").json() == {"status": "live"}
    assert client.get("/api/health/ready").json() == {"status": "ready"}


def test_unknown_api_route_uses_stable_error_shape() -> None:
    response = TestClient(create_app()).get("/api/missing")

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "NOT_FOUND", "message": "Resource not found"}
    }
