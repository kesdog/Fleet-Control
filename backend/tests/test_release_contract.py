from fastapi.testclient import TestClient


def test_openapi_publishes_complete_route_surface(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    document = response.json()
    assert document["info"]["version"] == "0.20.0"
    assert {tag["name"] for tag in document["tags"]} == {
        "agents",
        "health",
        "imports",
        "vessels",
    }
    assert {
        "/api/health",
        "/api/agents/docs",
        "/api/agents/report",
        "/api/imports",
        "/api/imports/{session_id}/preview",
        "/api/imports/{session_id}/mapping",
        "/api/imports/{session_id}/validate",
        "/api/imports/{session_id}/commit",
        "/api/imports/{session_id}",
        "/api/vessels",
        "/api/vessels/{imo}",
        "/api/vessels/{imo}/metrics",
        "/api/vessels/{imo}/telemetry",
        "/api/vessels/{imo}/trajectory",
        "/api/vessels/{imo}/series/{metric}",
        "/api/vessels/{imo}/environment",
        "/api/vessels/{imo}/performance",
    }.issubset(document["paths"])


def test_application_errors_use_documented_detail_envelope(client: TestClient) -> None:
    response = client.get("/api/vessels/UNKNOWN")

    assert response.status_code == 404
    assert response.json() == {
        "detail": {"code": "vessel_not_found", "message": "Vessel was not found."}
    }


def test_vite_development_origin_is_allowed_by_cors(client: TestClient) -> None:
    response = client.options(
        "/api/vessels",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
