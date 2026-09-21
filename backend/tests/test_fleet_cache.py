from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

GPS_CSV = (
    "Timestamp,Latitude [deg],Longitude [deg],Speed [kn],Course [deg]\n"
    "2026-03-01T00:15:00,32.5,-79.4,10,180\n"
    "2026-03-01T00:30:00,32.6,-79.5,12,\n"
)
MOTION_CSV = "Timestamp,Roll motion [deg]\n2026-03-01T00:15:00,0.2\n"


def import_vessel(client: TestClient, imo: str, csv: str = GPS_CSV) -> None:
    created = client.post(
        "/api/imports",
        files=[
            ("files", ("gps.csv", csv, "text/csv")),
            ("files", ("motion.csv", MOTION_CSV, "text/csv")),
        ],
    )
    session_id = created.json()["session_id"]
    assert client.post(f"/api/imports/{session_id}/validate").json()["status"] == "VALIDATED"
    assert client.post(
        f"/api/imports/{session_id}/commit", json={"imo": imo, "mode": "CREATE"}
    ).status_code == 200


def test_cache_hydrates_immutable_samples_and_marks_missing_telemetry(client: TestClient) -> None:
    import_vessel(client, "IMO5001")

    entry = client.app.state.fleet_cache.snapshot.get("IMO5001")

    assert entry is not None
    assert len(entry.samples) == 2
    assert {metric.key for metric in entry.metric_definitions} >= {"sog", "rpm", "fuel_tpd", "stw"}
    assert entry.samples[0].missing_fields == frozenset({"heading"})
    assert entry.samples[1].missing_fields == frozenset({"course", "heading", "roll_motion_deg"})
    assert entry.samples[0].metrics == {"roll_motion_deg": 0.2}
    with pytest.raises(AttributeError):
        entry.samples[0].missing_fields.add("course")
    with pytest.raises(TypeError):
        entry.samples[0].metrics["roll_motion_deg"] = 1.0


def test_cache_range_lookup_uses_ordered_immutable_samples(client: TestClient) -> None:
    import_vessel(client, "IMO5002")
    entry = client.app.state.fleet_cache.snapshot.get("IMO5002")
    assert entry is not None

    range_samples = entry.samples_in_range(
        datetime.fromisoformat("2026-03-01T00:30:00"),
        datetime.fromisoformat("2026-03-01T00:30:00"),
    )

    assert len(range_samples) == 1
    assert range_samples[0].timestamp == datetime.fromisoformat("2026-03-01T00:30:00")


def test_cache_reads_execute_no_sql_after_hydration(client: TestClient) -> None:
    import_vessel(client, "IMO5003")
    queries = 0

    def count_queries(conn, cursor, statement, parameters, context, executemany) -> None:
        nonlocal queries
        queries += 1

    event.listen(client.app.state.engine, "before_cursor_execute", count_queries)
    try:
        entry = client.app.state.fleet_cache.snapshot.get("IMO5003")
        assert entry is not None
        assert len(entry.samples_in_range()) == 2
        assert entry.samples[0].missing_fields == frozenset({"heading"})
    finally:
        event.remove(client.app.state.engine, "before_cursor_execute", count_queries)

    assert queries == 0


def test_replacing_one_vessel_keeps_unrelated_cache_entry(client: TestClient) -> None:
    import_vessel(client, "IMO5004")
    import_vessel(client, "IMO5005")
    before = client.app.state.fleet_cache.snapshot
    unrelated_entry = before.get("IMO5005")
    assert unrelated_entry is not None

    replacement_csv = (
        "Timestamp,Latitude [deg],Longitude [deg],Speed [kn]\n"
        "2026-03-01T00:15:00,1,2,3\n"
    )
    created = client.post("/api/imports", files={"files": ("gps.csv", replacement_csv, "text/csv")})
    session_id = created.json()["session_id"]
    assert client.post(f"/api/imports/{session_id}/validate").json()["status"] == "VALIDATED"
    assert client.post(
        f"/api/imports/{session_id}/commit", json={"imo": "IMO5004", "mode": "REPLACE"}
    ).status_code == 200

    after = client.app.state.fleet_cache.snapshot
    assert after.get("IMO5005") is unrelated_entry
    assert len(after.get("IMO5004").samples) == 1
