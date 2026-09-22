from datetime import datetime

import httpx
import pytest
from fastapi.testclient import TestClient

import app.services.import_service as import_service
from app.services.environment_service import (
    EnvironmentalObservation,
    calculate_weather_factor,
)

GPS_CSV = (
    "Timestamp,Latitude [deg],Longitude [deg],Speed [kn],Heading [deg]\n"
    "2026-03-01T00:15:00,32.5,-79.4,12,90\n"
    "2026-03-01T00:30:00,32.6,-79.5,12,90\n"
)


def import_vessel(client: TestClient, imo: str = "IMO9001") -> None:
    created = client.post("/api/imports", files=[("files", ("gps.csv", GPS_CSV, "text/csv"))])
    session_id = created.json()["session_id"]
    assert client.post(f"/api/imports/{session_id}/validate").json()["status"] == "VALIDATED"
    assert client.post(
        f"/api/imports/{session_id}/commit", json={"imo": imo, "mode": "CREATE"}
    ).status_code == 200


def test_performance_endpoint_reports_sog_fallback_without_weather(client: TestClient) -> None:
    import_vessel(client)

    response = client.get("/api/vessels/IMO9001/performance")
    assert response.status_code == 200
    body = response.json()
    assert body["fuel_currency"] == "EUR"
    assert body["distance_nm"] > 0
    assert body["fuel_tonnes"] > 0
    assert body["observed_duration_seconds"] == 15 * 60
    assert body["unobserved_duration_seconds"] == 0
    assert body["coverage_percent"] == 100
    assert body["weather_impact"]["model"] == "experimental_heuristic"
    assert "not supplied by AI Universal" in body["weather_impact"]["warning"]
    assert body["weather"]["mean_wave_height_m"] is None
    assert body["weather"]["max_wave_height_m"] is None


def test_environment_endpoint_reports_missing_when_weather_unavailable(client: TestClient) -> None:
    import_vessel(client)

    response = client.get("/api/vessels/IMO9001/environment")
    assert response.status_code == 200
    records = response.json()["records"]
    assert len(records) == 2
    assert all(record["wind_speed_knots"] is None for record in records)
    assert all(record["missing"] is True for record in records)


def _observations() -> dict[datetime, EnvironmentalObservation]:
    return {
        datetime(2026, 3, 1, 0, 15): EnvironmentalObservation(
            timestamp=datetime(2026, 3, 1, 0, 15),
            wind_speed_knots=15.0,
            wind_direction_deg=180.0,
            wave_height_m=2.0,
            wave_direction_deg=270.0,
            wave_period_s=8.0,
            current_speed_knots=2.0,
            current_direction_deg=90.0,
            weather_factor=calculate_weather_factor(2.0),
        ),
        datetime(2026, 3, 1, 0, 30): EnvironmentalObservation(
            timestamp=datetime(2026, 3, 1, 0, 30),
            wind_speed_knots=18.0,
            wind_direction_deg=180.0,
            wave_height_m=3.0,
            wave_direction_deg=270.0,
            wave_period_s=9.0,
            current_speed_knots=2.0,
            current_direction_deg=90.0,
            weather_factor=calculate_weather_factor(3.0),
        ),
    }


def test_enriched_import_applies_current_correction(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        import_service,
        "fetch_environment_for_samples",
        lambda samples, settings, on_progress=None: _observations(),
    )
    import_vessel(client, imo="IMO9002")

    telemetry = client.get("/api/vessels/IMO9002/telemetry").json()
    record = telemetry["records"][0]
    assert record["stw_source"] == "current_corrected"
    assert record["stw_knots"] == pytest.approx(10.0)
    assert record["current_along_heading_knots"] == pytest.approx(2.0)

    performance = client.get("/api/vessels/IMO9002/performance").json()
    assert performance["weather"]["max_wave_height_m"] == pytest.approx(3.0)
    assert performance["weather"]["mean_wave_height_m"] == pytest.approx(2.5)


def test_weather_failure_does_not_break_telemetry_import(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fail(samples, settings, on_progress=None):
        raise httpx.ConnectError("provider down")

    monkeypatch.setattr(import_service, "fetch_environment_for_samples", fail)
    import_vessel(client, imo="IMO9003")

    telemetry = client.get("/api/vessels/IMO9003/telemetry")
    assert telemetry.status_code == 200
    record = telemetry.json()["records"][0]
    assert record["stw_source"] == "sog_fallback"
    assert record["stw_knots"] == pytest.approx(12.0)
