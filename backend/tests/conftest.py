from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path: object) -> Settings:
    return Settings(
        database_url=f"sqlite:///{tmp_path}/test-fleet.db",
        imports_directory=tmp_path / "imports",
        logs_directory=tmp_path / "logs",
        environment_enrichment_enabled=False,
    )


@pytest.fixture
def app(settings: Settings, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    return create_app()


@pytest.fixture
def client(app: object) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
