from fastapi.testclient import TestClient


def test_operational_and_request_validation_errors_use_the_shared_envelope(
    client: TestClient,
) -> None:
    missing_vessel = client.get("/api/vessels/IMO404")
    assert missing_vessel.status_code == 404
    assert missing_vessel.json()["detail"] == {
        "code": "vessel_not_found",
        "message": "Vessel was not found.",
    }

    invalid_request = client.post("/api/imports/not-a-session/commit", json={})
    assert invalid_request.status_code == 422
    assert invalid_request.json()["detail"] == {
        "code": "request_validation_error",
        "message": "The request is invalid.",
    }
