import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select

from app.db.models import Sample, Vessel, VesselMetric

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
    assert validation["estimated_metrics"] == ["rpm", "fuel_tpd"]
    assert "1 GPS rows have no matching motion timestamp." in validation["warnings"]
    assert "1 motion rows have no matching GPS timestamp." in validation["warnings"]

    committed = client.post(
        f"/api/imports/{session_id}/commit",
        json={"imo": "IMO1001", "name": "Test Vessel", "mode": "CREATE"},
    )

    assert committed.status_code == 200
    assert committed.json()["samples_imported"] == 2
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
        assert rpm.formula == "4 × SOG"
        assert rpm.based_on == ["sog"]


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
    assert "duplicate GPS timestamp" in validation.json()["errors"][0]

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
