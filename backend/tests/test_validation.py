from pathlib import Path

from app.importers.csv_reader import inspect_csv
from app.importers.validator import validate_inspection


def make_inspection(tmp_path: Path, header: str, row: str):
    source = tmp_path / "telemetry.csv"
    source.write_text(f"{header}\n{row}\n")
    return inspect_csv(source)


def test_speed_without_unit_requires_explicit_mapping(tmp_path: Path) -> None:
    inspection = make_inspection(
        tmp_path,
        "Timestamp,Latitude,Longitude,Speed",
        "2026-03-01T00:15:00,32.5,-79.4,20",
    )

    result = validate_inspection(inspection)

    assert not result.is_valid
    assert result.errors[0].code == "speed_unit_required"
    assert validate_inspection(inspection, {"Speed": "kn"}).is_valid


def test_invalid_values_are_reported(tmp_path: Path) -> None:
    inspection = make_inspection(
        tmp_path,
        "Timestamp,Latitude,Longitude,Speed [kn]",
        "not-a-time,not-a-number,181,-1",
    )

    result = validate_inspection(inspection)

    assert {issue.code for issue in result.errors} == {
        "invalid_timestamp",
        "invalid_numeric_value",
        "value_out_of_range",
        "negative_speed",
    }


def test_missing_required_gps_field_is_reported(tmp_path: Path) -> None:
    inspection = make_inspection(tmp_path, "Timestamp,Speed [kn]", "2026-03-01T00:15:00,20")

    result = validate_inspection(inspection)

    assert {issue.message for issue in result.errors} == {
        "Required GPS field is missing: latitude.",
        "Required GPS field is missing: longitude.",
    }
