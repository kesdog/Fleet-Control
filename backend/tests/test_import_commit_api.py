from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select

from app.db.models import ImportSession, Sample, Vessel, VesselMetric
from app.importers.normalizer import NormalizedSample
from app.services.import_service import _enrich_committed_vessel

GPS_CSV = (
    "Timestamp,Latitude [deg],Longitude [deg],Speed [km/h],Course [deg]\n"
    "2026-03-01T00:15:00,32.5,-79.4,20,180\n"
    "2026-03-01T00:30:00,32.6,-79.5,30,190\n"
)
MOTION_CSV = (
    "Timestamp,Roll motion [deg]\n"
    "2026-03-01T00:15:00,0.2\n"
    "2026-03-01T00:45:00,0.4\n"
)


def create_and_validate(
    client: TestClient, gps_csv: str = GPS_CSV, motion_csv: str | None = None
) -> str:
    files = [("files", ("gps.csv", gps_csv, "text/csv"))]
    if motion_csv is not None:
        files.append(("files", ("motion.csv", motion_csv, "text/csv")))
    created = client.post("/api/imports", files=files)
    assert created.status_code == 201
    session_id = created.json()["session_id"]
    validation = client.post(f"/api/imports/{session_id}/validate")
    assert validation.status_code == 200
    assert validation.json()["status"] == "VALIDATED"
    return session_id


def test_validated_import_commits_normalized_timestamp_joined_data(client: TestClient) -> None:
    session_id = create_and_validate(client, motion_csv=MOTION_CSV)

    validation = client.post(f"/api/imports/{session_id}/validate").json()
    assert validation["rows_accepted"] == 2
    assert validation["rows_rejected"] == 0
    assert validation["estimated_metrics"] == [
        "rpm",
        "fuel_tpd",
        "stw",
        "current_along_heading",
        "weather_factor",
    ]
    warning_messages = [
        issue["message"] for issue in validation["issues"] if issue["severity"] == "warning"
    ]
    assert "1 GPS rows have no matching motion timestamp." in warning_messages
    assert "1 motion rows have no matching GPS timestamp." in warning_messages

    committed = client.post(
        f"/api/imports/{session_id}/commit",
        json={"imo": "IMO1001", "name": "Test Vessel", "mode": "CREATE"},
    )

    assert committed.status_code == 200
    assert committed.json()["samples_imported"] == 2
    progress = client.get(f"/api/imports/{session_id}/progress")
    assert progress.status_code == 200
    assert progress.json() == {
        "session_id": session_id,
        "status": "COMMITTED",
        "imo": "IMO1001",
        "enrichment_days_completed": 0,
        "enrichment_days_total": 0,
    }
    with client.app.state.session_factory() as session:
        vessel = session.scalar(select(Vessel).where(Vessel.imo == "IMO1001"))
        assert vessel is not None
        samples = list(session.scalars(select(Sample).where(Sample.vessel_id == vessel.id)))
        assert len(samples) == 2
        assert samples[0].sog_knots == 10.79913606
        assert samples[0].estimated_rpm == 43.19654424
        assert samples[0].metrics_json == {"roll_motion_deg": 0.2}
        assert samples[1].metrics_json is None
        metrics = list(
            session.scalars(select(VesselMetric).where(VesselMetric.vessel_id == vessel.id))
        )
        rpm = next(metric for metric in metrics if metric.key == "rpm")
        assert rpm.origin == "estimated"
        assert rpm.formula == "4 × STW"
        assert rpm.based_on == ["stw"]


def test_existing_vessel_requires_explicit_replace(client: TestClient) -> None:
    first_session = create_and_validate(client)
    created = client.post(
        f"/api/imports/{first_session}/commit",
        json={"imo": "IMO1002", "mode": "CREATE"},
    )
    assert created.status_code == 200

    replacement_gps = (
        "Timestamp,Latitude [deg],Longitude [deg],Speed [kn]\n"
        "2026-03-01T00:15:00,10,20,5\n"
    )
    second_session = create_and_validate(client, replacement_gps)
    blocked = client.post(
        f"/api/imports/{second_session}/commit",
        json={"imo": "IMO1002", "mode": "CREATE"},
    )
    assert blocked.status_code == 409

    replaced = client.post(
        f"/api/imports/{second_session}/commit",
        json={"imo": "IMO1002", "mode": "REPLACE"},
    )
    assert replaced.status_code == 200
    with client.app.state.session_factory() as session:
        vessel = session.scalar(select(Vessel).where(Vessel.imo == "IMO1002"))
        assert vessel is not None
        assert len(list(session.scalars(select(Sample).where(Sample.vessel_id == vessel.id)))) == 1


def test_stale_enrichment_cannot_update_a_replaced_vessel(client: TestClient) -> None:
    first_session = create_and_validate(client)
    assert client.post(
        f"/api/imports/{first_session}/commit",
        json={"imo": "IMO1005", "mode": "CREATE"},
    ).status_code == 200
    with client.app.state.session_factory() as session:
        first_vessel = session.scalar(select(Vessel).where(Vessel.imo == "IMO1005"))
        assert first_vessel is not None
        first_vessel_id = first_vessel.id

    replacement_session = create_and_validate(client)
    assert client.post(
        f"/api/imports/{replacement_session}/commit",
        json={"imo": "IMO1005", "mode": "REPLACE"},
    ).status_code == 200
    with client.app.state.session_factory() as session:
        replacement = session.scalar(select(Vessel).where(Vessel.imo == "IMO1005"))
        assert replacement is not None
        replacement_generation = replacement.enrichment_generation
        replacement_sample = session.scalar(
            select(Sample).where(Sample.vessel_id == replacement.id)
        )
        assert replacement_sample is not None
        replacement_fuel_rate = replacement_sample.estimated_fuel_tpd

    # This payload would materially change the replacement's fuel rate if the worker
    # found by IMO alone, which exercises the protected write path.
    stale_sample = NormalizedSample(
        timestamp=datetime(2026, 3, 1, 0, 15),
        latitude_deg=32.5,
        longitude_deg=-79.4,
        sog_knots=20.0,
        course_deg=None,
        heading_deg=None,
        estimated_rpm=80.0,
        estimated_fuel_tpd=0.0,
        metrics={},
    )

    _enrich_committed_vessel(
        client.app.state.session_factory,
        first_session,
        "IMO1005",
        first_vessel_id,
        first_session,
        (stale_sample,),
        client.app.state.settings,
        client.app.state.fleet_cache,
    )

    with client.app.state.session_factory() as session:
        replacement = session.scalar(select(Vessel).where(Vessel.imo == "IMO1005"))
        assert replacement is not None
        assert replacement.enrichment_generation == replacement_generation
        replacement_sample = session.scalar(
            select(Sample).where(Sample.vessel_id == replacement.id)
        )
        assert replacement_sample is not None
        assert replacement_sample.estimated_fuel_tpd == replacement_fuel_rate
        first_import = session.get(ImportSession, first_session)
        assert first_import is not None
        assert first_import.status == "COMMITTED"


def test_duplicate_gps_timestamps_fail_validation_and_cannot_commit(client: TestClient) -> None:
    duplicate_gps = (
        "Timestamp,Latitude [deg],Longitude [deg],Speed [kn]\n"
        "2026-03-01T00:15:00,10,20,5\n"
        "2026-03-01T00:15:00,11,21,6\n"
    )
    created = client.post("/api/imports", files={"files": ("gps.csv", duplicate_gps, "text/csv")})
    session_id = created.json()["session_id"]

    validation = client.post(f"/api/imports/{session_id}/validate")
    assert validation.json()["status"] == "FAILED"
    issues = validation.json()["issues"]
    assert any(
        issue["severity"] == "error" and issue["code"] == "duplicate_gps_timestamp"
        for issue in issues
    )

    committed = client.post(
        f"/api/imports/{session_id}/commit",
        json={"imo": "IMO1003", "mode": "CREATE"},
    )
    assert committed.status_code == 409


def test_failed_replace_transaction_preserves_existing_vessel(client: TestClient) -> None:
    first_session = create_and_validate(client)
    assert client.post(
        f"/api/imports/{first_session}/commit",
        json={"imo": "IMO1004", "mode": "CREATE"},
    ).status_code == 200
    replacement_session = create_and_validate(client)

    def fail_metric_insert(conn, cursor, statement, parameters, context, executemany) -> None:
        if "INSERT INTO vessel_metrics" in statement:
            raise RuntimeError("simulated database failure")

    event.listen(client.app.state.engine, "before_cursor_execute", fail_metric_insert)
    try:
        with pytest.raises(RuntimeError, match="simulated database failure"):
            client.post(
                f"/api/imports/{replacement_session}/commit",
                json={"imo": "IMO1004", "mode": "REPLACE"},
            )
    finally:
        event.remove(client.app.state.engine, "before_cursor_execute", fail_metric_insert)

    with client.app.state.session_factory() as session:
        vessel = session.scalar(select(Vessel).where(Vessel.imo == "IMO1004"))
        assert vessel is not None
        assert len(list(session.scalars(select(Sample).where(Sample.vessel_id == vessel.id)))) == 2


def test_validation_returns_structured_issues(client: TestClient) -> None:
    bad_course = (
        "Timestamp,Latitude [deg],Longitude [deg],Speed [kn],Course [deg]\n"
        "2026-03-01T00:15:00,32.5,-79.4,20,400\n"
    )
    created = client.post("/api/imports", files={"files": ("gps.csv", bad_course, "text/csv")})
    session_id = created.json()["session_id"]

    validation = client.post(f"/api/imports/{session_id}/validate")
    assert validation.json()["status"] == "FAILED"
    issues = validation.json()["issues"]
    issue = next(issue for issue in issues if issue["code"] == "course_out_of_range")
    assert issue["severity"] == "error"
    assert issue["column"] == "Course [deg]"
    assert issue["row_number"] == 2
    assert issue["file"] == "gps.csv"


def test_validation_distinguishes_warning_from_error(client: TestClient) -> None:
    valid = (
        "Timestamp,Latitude [deg],Longitude [deg],Speed [kn]\n"
        "2026-03-01T00:15:00,32.5,-79.4,20\n"
    )
    motion = "Timestamp,Roll motion [deg]\n2026-03-01T00:45:00,0.2\n"
    created = client.post(
        "/api/imports",
        files=[
            ("files", ("gps.csv", valid, "text/csv")),
            ("files", ("motion.csv", motion, "text/csv")),
        ],
    )
    session_id = created.json()["session_id"]

    validation = client.post(f"/api/imports/{session_id}/validate")
    body = validation.json()
    assert body["status"] == "VALIDATED"
    assert not any(issue["severity"] == "error" for issue in body["issues"])
    assert any(issue["severity"] == "warning" for issue in body["issues"])
    assert any(issue["severity"] == "information" for issue in body["issues"])
