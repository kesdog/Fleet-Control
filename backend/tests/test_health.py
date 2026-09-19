from fastapi.testclient import TestClient
from sqlalchemy import inspect


def test_application_starts_and_initializes_schema(client: TestClient) -> None:
    assert set(inspect(client.app.state.engine).get_table_names()) == {
        "import_sessions",
        "samples",
        "vessel_metrics",
        "vessels",
    }


def test_health_endpoint_reports_database_status(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "database": "connected",
        "cache": "initialized",
    }
