from numbers import Real
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

INPUT_DATA_DIRECTORY = Path(__file__).resolve().parents[2] / "input_data"


@pytest.mark.parametrize(
    ("imo", "gps_filename", "motions_filename"),
    [
        ("IMO1", "IMO1_GPS.csv", "IMO1_MOTIONS.csv"),
        ("IMO2", "IMO2_GPS.csv", "IMO2_MOTIONS.csv"),
        ("IMO3", "IMO3_GPS.csv", "IMO3_MOTIONS.csv"),
    ],
)
def test_real_data_import_workflow_and_cached_reads(
    client: TestClient, imo: str, gps_filename: str, motions_filename: str
) -> None:
    """Exercise the production HTTP workflow against each supplied vessel data pair."""
    gps_path = INPUT_DATA_DIRECTORY / gps_filename
    motions_path = INPUT_DATA_DIRECTORY / motions_filename

    with gps_path.open("rb") as gps_file, motions_path.open("rb") as motions_file:
        created = client.post(
            "/api/imports",
            files=[
                ("files", (gps_filename, gps_file, "text/csv")),
                ("files", (motions_filename, motions_file, "text/csv")),
            ],
        )

    assert created.status_code == 201
    session_id = created.json()["session_id"]

    preview = client.get(f"/api/imports/{session_id}/preview")
    assert preview.status_code == 200
    assert {item["filename"] for item in preview.json()["files"]} == {
        gps_filename,
        motions_filename,
    }

    validation = client.post(f"/api/imports/{session_id}/validate")
    assert validation.status_code == 200
    validation_body = validation.json()
    assert validation_body["status"] == "VALIDATED"
    assert not any(issue["severity"] == "error" for issue in validation_body["issues"])

    committed = client.post(
        f"/api/imports/{session_id}/commit",
        json={"imo": imo, "mode": "CREATE"},
    )
    assert committed.status_code == 200
    commit_body = committed.json()
    assert commit_body["status"] == "COMMITTED"
    assert commit_body["imo"] == imo
    assert commit_body["samples_imported"] > 0

    vessel = client.get(f"/api/vessels/{imo}")
    assert vessel.status_code == 200
    vessel_body = vessel.json()
    assert vessel_body["imo"] == imo
    assert vessel_body["sample_count"] > 0
    assert vessel_body["start"]
    assert vessel_body["end"]
    assert vessel_body["metrics"]

    metrics = client.get(f"/api/vessels/{imo}/metrics")
    assert metrics.status_code == 200
    metrics_body = metrics.json()
    assert metrics_body
    metric_origins = {metric["key"]: metric["origin"] for metric in metrics_body}
    assert metric_origins["rpm"] == "estimated"
    assert metric_origins["fuel_tpd"] == "estimated"

    telemetry = client.get(f"/api/vessels/{imo}/telemetry")
    assert telemetry.status_code == 200
    telemetry_body = telemetry.json()
    assert telemetry_body["imo"] == imo
    assert telemetry_body["records"]
    assert all(
        isinstance(record["sog_knots"], Real) and not isinstance(record["sog_knots"], bool)
        for record in telemetry_body["records"]
    )

    trajectory = client.get(f"/api/vessels/{imo}/trajectory", params={"metric": "sog"})
    assert trajectory.status_code == 200
    trajectory_body = trajectory.json()
    assert trajectory_body["imo"] == imo
    assert trajectory_body["metric"]["key"] == "sog"
    assert any(segment for segment in trajectory_body["segments"])

    series = client.get(f"/api/vessels/{imo}/series/sog")
    assert series.status_code == 200
    series_body = series.json()
    assert series_body["imo"] == imo
    assert series_body["metric"]["key"] == "sog"
    assert series_body["points"]

    sql_executions = 0

    def count_sql_executions(conn, cursor, statement, parameters, context, executemany) -> None:
        nonlocal sql_executions
        sql_executions += 1

    event.listen(client.app.state.engine, "before_cursor_execute", count_sql_executions)
    try:
        cached_telemetry = client.get(f"/api/vessels/{imo}/telemetry")
    finally:
        event.remove(client.app.state.engine, "before_cursor_execute", count_sql_executions)

    assert cached_telemetry.status_code == 200
    assert cached_telemetry.json()["records"]
    assert sql_executions == 0
