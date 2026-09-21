import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

GPS_CSV = (
    "Timestamp,Latitude [deg],Longitude [deg],Speed [kn],Course [deg]\n"
    "2026-03-01T00:15:00,32.5,-79.4,10,180\n"
    "2026-03-01T00:30:00,32.6,-79.5,12,\n"
)
MOTION_CSV = "Timestamp,Roll motion [deg]\n2026-03-01T00:15:00,0.2\n"


def import_vessel(client: TestClient, imo: str = "IMO6001") -> None:
    created = client.post(
        "/api/imports",
        files=[
            ("files", ("gps.csv", GPS_CSV, "text/csv")),
            ("files", ("motion.csv", MOTION_CSV, "text/csv")),
        ],
    )
    session_id = created.json()["session_id"]
    assert client.post(f"/api/imports/{session_id}/validate").json()["status"] == "VALIDATED"
    assert client.post(
        f"/api/imports/{session_id}/commit",
        json={"imo": imo, "name": "Read API Vessel", "mode": "CREATE"},
    ).status_code == 200


def test_vessel_summary_and_metadata_contracts(client: TestClient) -> None:
    assert client.get("/api/vessels").json() == []
    import_vessel(client)

    vessels = client.get("/api/vessels")
    assert vessels.status_code == 200
    assert vessels.json() == [
        {
            "imo": "IMO6001",
            "name": "Read API Vessel",
            "start": "2026-03-01T00:15:00",
            "end": "2026-03-01T00:30:00",
            "sample_count": 2,
            "available_metrics": [
                "course",
                "current_along_heading",
                "current_direction",
                "current_speed",
                "fuel_tpd",
                "latitude_deg",
                "longitude_deg",
                "roll_motion_deg",
                "rpm",
                "sog",
                "stw",
                "wave_direction",
                "wave_height",
                "wave_period",
                "weather_factor",
                "wind_direction",
                "wind_speed",
            ],
        }
    ]

    vessel = client.get("/api/vessels/IMO6001")
    assert vessel.status_code == 200
    rpm = next(metric for metric in vessel.json()["metrics"] if metric["key"] == "rpm")
    assert rpm == {
        "key": "rpm",
        "label": "Propeller RPM",
        "unit": "rpm",
        "origin": "estimated",
        "source_column": None,
        "formula": "4 × STW",
        "based_on": ["stw"],
        "warning": "Estimated from Speed Through Water; not measured RPM.",
    }

    metrics = client.get("/api/vessels/IMO6001/metrics")
    assert metrics.status_code == 200
    assert metrics.json() == vessel.json()["metrics"]


def test_telemetry_uses_cache_and_exposes_missing_source_fields(client: TestClient) -> None:
    import_vessel(client)
    query_count = 0

    def count_queries(conn, cursor, statement, parameters, context, executemany) -> None:
        nonlocal query_count
        query_count += 1

    event.listen(client.app.state.engine, "before_cursor_execute", count_queries)
    try:
        response = client.get(
            "/api/vessels/IMO6001/telemetry",
            params={"start": "2026-03-01T00:30:00Z", "end": "2026-03-01T00:30:00Z"},
        )
    finally:
        event.remove(client.app.state.engine, "before_cursor_execute", count_queries)

    assert response.status_code == 200
    assert query_count == 0
    records = response.json()["records"]
    assert len(records) == 1
    assert records[0]["timestamp"] == "2026-03-01T00:30:00"
    assert records[0]["latitude_deg"] == 32.6
    assert records[0]["longitude_deg"] == -79.5
    assert records[0]["sog_knots"] == 12.0
    assert records[0]["course_deg"] is None
    assert records[0]["heading_deg"] is None
    assert records[0]["estimated_rpm"] == 48.0
    assert records[0]["estimated_fuel_tpd"] == pytest.approx(76.8)
    assert records[0]["metrics"] == {}
    assert records[0]["missing_fields"] == ["course", "heading", "roll_motion_deg"]


def test_read_api_rejects_unknown_vessels_and_invalid_windows(client: TestClient) -> None:
    import_vessel(client)

    unknown = client.get("/api/vessels/IMO9999")
    assert unknown.status_code == 404

    invalid_order = client.get(
        "/api/vessels/IMO6001/telemetry",
        params={"start": "2026-03-01T00:30:00", "end": "2026-03-01T00:15:00"},
    )
    assert invalid_order.status_code == 400

    unavailable = client.get(
        "/api/vessels/IMO6001/telemetry",
        params={"start": "2026-02-01T00:00:00"},
    )
    assert unavailable.status_code == 416

    invalid_date = client.get("/api/vessels/IMO6001/telemetry", params={"start": "not-a-date"})
    assert invalid_date.status_code == 422
