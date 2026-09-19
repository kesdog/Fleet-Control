from fastapi.testclient import TestClient

GPS_CSV = (
    "Timestamp,Latitude [deg],Longitude [deg],Speed [kn]\n"
    "2026-03-01T00:15:00,10,179,10\n"
    "2026-03-01T00:30:00,11,179.5,11\n"
    "2026-03-01T00:45:00,12,-179.5,12\n"
    "2026-03-01T01:00:00,13,-179,13\n"
)
MOTION_CSV = "Timestamp,Roll motion [deg]\n2026-03-01T00:15:00,0.2\n"


def import_vessel(client: TestClient) -> None:
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
        f"/api/imports/{session_id}/commit", json={"imo": "IMO7001", "mode": "CREATE"}
    ).status_code == 200


def test_trajectory_splits_dateline_and_includes_metric_metadata(client: TestClient) -> None:
    import_vessel(client)

    response = client.get("/api/vessels/IMO7001/trajectory", params={"metric": "rpm"})

    assert response.status_code == 200
    body = response.json()
    assert [len(segment) for segment in body["segments"]] == [2, 2]
    assert body["segments"][0][0]["metric_value"] == 40.0
    assert body["metric"]["origin"] == "estimated"
    assert body["metric"]["based_on"] == ["sog"]


def test_series_reports_missing_values_and_downsamples(client: TestClient) -> None:
    import_vessel(client)

    full_series = client.get("/api/vessels/IMO7001/series/roll_motion_deg")
    assert full_series.status_code == 200
    assert [point["missing"] for point in full_series.json()["points"]] == [False, True, True, True]

    downsampled = client.get("/api/vessels/IMO7001/series/sog", params={"max_points": 2})
    assert downsampled.status_code == 200
    points = downsampled.json()["points"]
    assert [point["timestamp"] for point in points] == [
        "2026-03-01T00:15:00",
        "2026-03-01T01:00:00",
    ]
    assert [point["value"] for point in points] == [10.0, 13.0]


def test_visualization_api_handles_empty_ranges_and_invalid_metrics(client: TestClient) -> None:
    import_vessel(client)

    empty = client.get(
        "/api/vessels/IMO7001/trajectory",
        params={"start": "2026-03-01T00:20:00", "end": "2026-03-01T00:25:00"},
    )
    assert empty.status_code == 200
    assert empty.json()["segments"] == []

    unknown_metric = client.get("/api/vessels/IMO7001/series/unknown")
    assert unknown_metric.status_code == 404

    invalid_limit = client.get("/api/vessels/IMO7001/series/sog", params={"max_points": 1})
    assert invalid_limit.status_code == 422
