from pathlib import Path

from app.importers.validator import validate_import
from app.schemas.imports import FileMapping


def validate_csv(
    tmp_path: Path, header: str, *rows: str, mappings: dict[str, FileMapping] | None = None
):
    source = tmp_path / "telemetry.csv"
    source.write_text(header + "\n" + "\n".join(rows) + "\n")
    return validate_import([("telemetry.csv", source)], mappings or {})


def error_codes(result) -> set[str]:
    return {issue.code for issue in result.errors}


def test_speed_without_unit_requires_explicit_mapping(tmp_path: Path) -> None:
    result = validate_csv(
        tmp_path,
        "Timestamp,Latitude,Longitude,Speed",
        "2026-03-01T00:15:00,32.5,-79.4,20",
    )

    assert not result.is_valid
    assert result.errors[0].code == "speed_unit_required"
    assert result.errors[0].column == "Speed"

    mapped = validate_csv(
        tmp_path,
        "Timestamp,Latitude,Longitude,Speed",
        "2026-03-01T00:15:00,32.5,-79.4,20",
        mappings={"telemetry.csv": FileMapping(unit_overrides={"Speed": "kn"})},
    )
    assert mapped.is_valid


def test_invalid_values_are_reported(tmp_path: Path) -> None:
    result = validate_csv(
        tmp_path,
        "Timestamp,Latitude,Longitude,Speed [kn]",
        "not-a-time,not-a-number,181,-1",
    )

    assert error_codes(result) == {
        "invalid_timestamp",
        "invalid_numeric_value",
        "longitude_out_of_range",
        "negative_speed",
    }
    assert any(issue.row_number == 2 for issue in result.errors)


def test_missing_required_gps_field_is_reported(tmp_path: Path) -> None:
    result = validate_csv(
        tmp_path,
        "Timestamp,Latitude [deg],Speed [kn]",
        "2026-03-01T00:15:00,32.5,20",
    )

    assert any(issue.code == "required_gps_field_missing" for issue in result.errors)
    assert any("longitude" in issue.message for issue in result.errors)


def test_missing_sog_is_required_for_gps_import(tmp_path: Path) -> None:
    result = validate_csv(
        tmp_path,
        "Timestamp,Latitude [deg],Longitude [deg]",
        "2026-03-01T00:15:00,32.5,-79.4",
    )

    assert not result.is_valid
    assert any(
        issue.code == "required_gps_field_missing" and issue.column is None
        for issue in result.errors
    )


def test_course_out_of_range_is_an_error(tmp_path: Path) -> None:
    result = validate_csv(
        tmp_path,
        "Timestamp,Latitude [deg],Longitude [deg],Speed [kn],Course [deg]",
        "2026-03-01T00:15:00,32.5,-79.4,20,400",
    )

    assert any(issue.code == "course_out_of_range" for issue in result.errors)
    assert not result.is_valid


def test_heading_out_of_range_is_an_error(tmp_path: Path) -> None:
    result = validate_csv(
        tmp_path,
        "Timestamp,Latitude [deg],Longitude [deg],Speed [kn],Heading [deg]",
        "2026-03-01T00:15:00,32.5,-79.4,20,-5",
    )

    assert any(issue.code == "heading_out_of_range" for issue in result.errors)
    assert not result.is_valid


def test_unsupported_speed_unit_is_an_error(tmp_path: Path) -> None:
    result = validate_csv(
        tmp_path,
        "Timestamp,Latitude [deg],Longitude [deg],Speed [furlongs/day]",
        "2026-03-01T00:15:00,32.5,-79.4,20",
    )

    assert any(issue.code == "unsupported_speed_unit" for issue in result.errors)


def test_issues_carry_structured_row_and_column_context(tmp_path: Path) -> None:
    result = validate_csv(
        tmp_path,
        "Timestamp,Latitude [deg],Longitude [deg],Speed [kn]",
        "2026-03-01T00:15:00,32.5,-79.4,-3",
    )

    issue = next(issue for issue in result.errors if issue.code == "negative_speed")
    assert issue.severity.value == "error"
    assert issue.column == "Speed [kn]"
    assert issue.row_number == 2
    assert issue.file == "telemetry.csv"
