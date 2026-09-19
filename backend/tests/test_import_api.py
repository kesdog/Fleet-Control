from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db.models import ImportSession, Sample, Vessel

GPS_CSV = (
    "Timestamp,Latitude [deg],Longitude [deg],Speed [kn]\n"
    "2026-03-01T00:15:00,32.5,-79.4,10\n"
    "2026-03-01T00:30:00,32.6,-79.5,12\n"
)
MOTION_CSV = "Timestamp,Roll motion [deg]\n2026-03-01T00:15:00,0.2\n"


def test_create_preview_map_and_cancel_multi_file_import(client: TestClient, settings) -> None:
    response = client.post(
        "/api/imports",
        files=[
            ("files", ("gps.csv", GPS_CSV, "text/csv")),
            ("files", ("motion.csv", MOTION_CSV, "text/csv")),
        ],
    )

    assert response.status_code == 201
    created = response.json()
    assert created["status"] == "UPLOADED"
    assert [file["row_count"] for file in created["files"]] == [2, 1]
    session_id = created["session_id"]
    assert (settings.imports_directory / session_id).is_dir()

    preview = client.get(f"/api/imports/{session_id}/preview")

    assert preview.status_code == 200
    preview_body = preview.json()
    assert preview_body["status"] == "INSPECTED"
    assert preview_body["files"][0]["timestamp_range"] == [
        "2026-03-01T00:15:00",
        "2026-03-01T00:30:00",
    ]
    assert preview_body["files"][0]["null_counts"]["Speed [kn]"] == 0
    assert "1 unrecognized columns" in preview_body["files"][1]["warnings"][0]

    mapping = client.put(
        f"/api/imports/{session_id}/mapping",
        json={
            "files": {
                "gps.csv": {
                    "semantic_fields": {"Speed [kn]": "sog"},
                    "unit_overrides": {"Speed [kn]": "kn"},
                }
            }
        },
    )

    assert mapping.status_code == 200
    assert mapping.json()["status"] == "MAPPED"

    deleted = client.delete(f"/api/imports/{session_id}")

    assert deleted.status_code == 204
    assert not (settings.imports_directory / session_id).exists()
    with client.app.state.session_factory() as session:
        assert session.get(ImportSession, session_id) is None
        assert session.scalar(select(func.count()).select_from(Vessel)) == 0
        assert session.scalar(select(func.count()).select_from(Sample)) == 0


def test_rejects_invalid_upload_without_creating_a_session(client: TestClient, settings) -> None:
    response = client.post("/api/imports", files={"files": ("not-csv.txt", "x", "text/plain")})

    assert response.status_code == 422
    assert response.json()["detail"] == "Only .csv files are supported."
    assert not any(settings.imports_directory.iterdir())


def test_rejects_unknown_mapping_file(client: TestClient) -> None:
    response = client.post("/api/imports", files={"files": ("gps.csv", GPS_CSV, "text/csv")})
    session_id = response.json()["session_id"]

    mapping = client.put(
        f"/api/imports/{session_id}/mapping",
        json={"files": {"other.csv": {}}},
    )

    assert mapping.status_code == 422
    assert "unknown files" in mapping.json()["detail"]


def test_empty_csv_is_rejected_and_cleaned_up(client: TestClient, settings) -> None:
    response = client.post("/api/imports", files={"files": ("empty.csv", "", "text/csv")})

    assert response.status_code == 422
    assert response.json()["detail"] == "CSV input is empty."
    assert not any(settings.imports_directory.iterdir())
