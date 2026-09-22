from fastapi.testclient import TestClient

GPS_CSV = (
    "Timestamp,Latitude [deg],Longitude [deg],Speed [kn],Course [deg]\n"
    "2026-03-01T00:15:00,32.5,-79.4,10,180\n"
    "2026-03-01T00:30:00,32.6,-79.5,12,\n"
)


def import_vessel(client: TestClient, imo: str) -> None:
    created = client.post("/api/imports", files=[("files", ("gps.csv", GPS_CSV, "text/csv"))])
    session_id = created.json()["session_id"]
    assert client.post(f"/api/imports/{session_id}/validate").json()["status"] == "VALIDATED"
    assert client.post(
        f"/api/imports/{session_id}/commit",
        json={"imo": imo, "name": f"Vessel {imo}", "mode": "CREATE"},
    ).status_code == 200


def test_agent_report_returns_compact_vessel_summary(client: TestClient) -> None:
    import_vessel(client, "IMO7001")

    response = client.get("/api/agents/report", params={"imo": "IMO7001"})

    assert response.status_code == 200
    body = response.json()
    assert body["app"]["name"] == "Marine Fleet Control Center"
    assert len(body["reports"]) == 1
    report = body["reports"][0]
    assert report["imo"] == "IMO7001"
    assert report["start"] == "2026-03-01T00:15:00"
    assert report["end"] == "2026-03-01T00:30:00"
    assert report["sample_count"] == 2
    assert "records" not in report
    assert report["data_quality"]["missing_field_counts"] == {"course": 1, "heading": 2}
    assert report["data_quality"]["records_without_environment"] == 2
    assert report["performance"]["distance_nm"] > 0


def test_agent_documentation_describes_discovery_and_report_examples(client: TestClient) -> None:
    response = client.get("/api/agents/docs")

    assert response.status_code == 200
    body = response.json()
    assert body["discovery_endpoint"] == "GET /api/vessels"
    assert body["report_endpoint"] == "GET /api/agents/report"
    assert body["openapi_endpoint"] == "GET /openapi.json"
    assert [example["request"] for example in body["examples"]] == [
        "GET /api/vessels",
        "GET /api/agents/report?imo=IMO1234567",
        (
            "GET /api/agents/report?imo=IMO1234567&imo=IMO7654321"
            "&start=2026-03-01T00:00:00Z&end=2026-03-07T00:00:00Z"
        ),
    ]


def test_agent_report_accepts_multiple_vessels_and_explicit_window(client: TestClient) -> None:
    import_vessel(client, "IMO7001")
    import_vessel(client, "IMO7002")

    response = client.get(
        "/api/agents/report",
        params=[
            ("imo", "IMO7001"),
            ("imo", "IMO7002"),
            ("start", "2026-03-01T00:30:00Z"),
            ("end", "2026-03-01T00:30:00Z"),
        ],
    )

    assert response.status_code == 200
    reports = response.json()["reports"]
    assert [report["imo"] for report in reports] == ["IMO7001", "IMO7002"]
    assert all(report["sample_count"] == 1 for report in reports)
    assert all(report["start"] == "2026-03-01T00:30:00" for report in reports)


def test_agent_report_uses_existing_error_contracts(client: TestClient) -> None:
    import_vessel(client, "IMO7001")

    assert client.get("/api/agents/report").status_code == 422
    assert client.get("/api/agents/report", params={"imo": "IMO9999"}).status_code == 404
    assert (
        client.get(
            "/api/agents/report",
            params={
                "imo": "IMO7001",
                "start": "2026-03-01T00:30:00",
                "end": "2026-03-01T00:15:00",
            },
        ).status_code
        == 400
    )


def test_agent_report_is_globally_limited_to_fifteen_requests_per_minute(
    client: TestClient,
) -> None:
    import_vessel(client, "IMO7001")

    for _ in range(15):
        assert client.get("/api/agents/report", params={"imo": "IMO7001"}).status_code == 200

    limited = client.get("/api/agents/report", params={"imo": "IMO7001"})
    assert limited.status_code == 429
    assert limited.json()["detail"] == (
        "Agent report request limit exceeded. Retry after one minute."
    )
    assert int(limited.headers["retry-after"]) > 0
