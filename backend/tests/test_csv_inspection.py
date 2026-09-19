from pathlib import Path

import pytest

from app.importers.column_detector import SemanticField
from app.importers.csv_reader import CsvReadError, inspect_csv
from app.importers.validator import validate_inspection


def test_inspects_delimiter_columns_and_types(tmp_path: Path) -> None:
    source = tmp_path / "telemetry.csv"
    source.write_text(
        "Timestamp;GPS Latitude [deg];GPS Longitude [deg];Speed [km/h]\n"
        "2026-03-01T00:15:00;32.5;-79.4;20\n"
    )

    inspection = inspect_csv(source)

    assert inspection.delimiter == ";"
    assert inspection.row_count == 1
    assert inspection.numeric_columns == (
        "GPS Latitude [deg]",
        "GPS Longitude [deg]",
        "Speed [km/h]",
    )
    assert {column.semantic_field for column in inspection.columns} == {
        SemanticField.TIMESTAMP,
        SemanticField.LATITUDE,
        SemanticField.LONGITUDE,
        SemanticField.SOG,
    }
    assert validate_inspection(inspection).is_valid


def test_empty_csv_is_rejected(tmp_path: Path) -> None:
    source = tmp_path / "empty.csv"
    source.write_text("")

    with pytest.raises(CsvReadError, match="empty"):
        inspect_csv(source)
