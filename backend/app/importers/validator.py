from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from app.importers.column_detector import DetectedColumn, SemanticField
from app.importers.csv_reader import CsvInspection
from app.importers.unit_converter import UnitConversionError, normalize_speed_unit


class IssueSeverity(StrEnum):
    ERROR = "error"
    WARNING = "warning"


@dataclass(frozen=True)
class ValidationIssue:
    severity: IssueSeverity
    code: str
    message: str
    column: str | None = None
    row_number: int | None = None


@dataclass(frozen=True)
class ValidationResult:
    errors: tuple[ValidationIssue, ...]
    warnings: tuple[ValidationIssue, ...]

    @property
    def is_valid(self) -> bool:
        return not self.errors


def validate_inspection(
    inspection: CsvInspection, unit_overrides: Mapping[str, str] | None = None
) -> ValidationResult:
    """Validate recognized navigation fields without mutating source rows."""
    overrides = unit_overrides or {}
    errors: list[ValidationIssue] = []
    semantic_columns = {
        column.semantic_field: column
        for column in inspection.columns
        if column.semantic_field is not None
    }

    # An explicit mapping supplied by the caller takes precedence over the header unit.
    _validate_speed_unit(semantic_columns.get(SemanticField.SOG), overrides, errors)
    _validate_required_gps_columns(semantic_columns, errors)

    # CSV row numbers start at two because the first source row is the header.
    for row_index, row in enumerate(inspection.rows, start=2):
        _validate_timestamp(row, row_index, semantic_columns.get(SemanticField.TIMESTAMP), errors)
        _validate_float_range(
            row, row_index, semantic_columns.get(SemanticField.LATITUDE), -90, 90, errors
        )
        _validate_float_range(
            row, row_index, semantic_columns.get(SemanticField.LONGITUDE), -180, 180, errors
        )
        _validate_speed(row, row_index, semantic_columns.get(SemanticField.SOG), errors)

    return ValidationResult(errors=tuple(errors), warnings=())


def _validate_speed_unit(
    column: DetectedColumn | None,
    overrides: Mapping[str, str],
    errors: list[ValidationIssue],
) -> None:
    if column is None:
        return
    unit = overrides.get(column.source_column, column.detected_unit)
    try:
        normalize_speed_unit(unit)
    except UnitConversionError as error:
        errors.append(
            ValidationIssue(
                severity=IssueSeverity.ERROR,
                code="speed_unit_required" if unit is None else "unsupported_speed_unit",
                message=str(error),
                column=column.source_column,
            )
        )


def _validate_required_gps_columns(
    semantic_columns: Mapping[SemanticField, DetectedColumn], errors: list[ValidationIssue]
) -> None:
    for field in (SemanticField.TIMESTAMP, SemanticField.LATITUDE, SemanticField.LONGITUDE):
        if field not in semantic_columns:
            errors.append(
                ValidationIssue(
                    severity=IssueSeverity.ERROR,
                    code="required_gps_field_missing",
                    message=f"Required GPS field is missing: {field.value}.",
                )
            )


def _validate_timestamp(
    row: Mapping[str, str],
    row_number: int,
    column: DetectedColumn | None,
    errors: list[ValidationIssue],
) -> None:
    if column is None:
        return
    value = row[column.source_column].strip()
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        errors.append(
            ValidationIssue(
                severity=IssueSeverity.ERROR,
                code="invalid_timestamp",
                message="Timestamp must be ISO 8601 compatible.",
                column=column.source_column,
                row_number=row_number,
            )
        )


def _validate_float_range(
    row: Mapping[str, str],
    row_number: int,
    column: DetectedColumn | None,
    minimum: float,
    maximum: float,
    errors: list[ValidationIssue],
) -> None:
    if column is None:
        return
    value = _as_float(row[column.source_column], column.source_column, row_number, errors)
    if value is not None and not minimum <= value <= maximum:
        errors.append(
            ValidationIssue(
                severity=IssueSeverity.ERROR,
                code="value_out_of_range",
                message=f"Value must be between {minimum:g} and {maximum:g}.",
                column=column.source_column,
                row_number=row_number,
            )
        )


def _validate_speed(
    row: Mapping[str, str],
    row_number: int,
    column: DetectedColumn | None,
    errors: list[ValidationIssue],
) -> None:
    if column is None:
        return
    value = _as_float(row[column.source_column], column.source_column, row_number, errors)
    if value is not None and value < 0:
        errors.append(
            ValidationIssue(
                severity=IssueSeverity.ERROR,
                code="negative_speed",
                message="Speed cannot be negative.",
                column=column.source_column,
                row_number=row_number,
            )
        )


def _as_float(
    value: str, column: str, row_number: int, errors: list[ValidationIssue]
) -> float | None:
    try:
        return float(value)
    except ValueError:
        errors.append(
            ValidationIssue(
                severity=IssueSeverity.ERROR,
                code="invalid_numeric_value",
                message="Value must be numeric.",
                column=column,
                row_number=row_number,
            )
        )
        return None
