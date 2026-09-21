from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from pathlib import Path

from app.importers.column_detector import SemanticField, extract_unit
from app.importers.csv_reader import CsvInspection, CsvReadError, inspect_csv
from app.importers.unit_converter import UnitConversionError, normalize_speed_unit
from app.schemas.imports import FileMapping


class IssueSeverity(StrEnum):
    ERROR = "error"
    WARNING = "warning"
    INFORMATION = "information"


@dataclass(frozen=True)
class ValidationIssue:
    severity: IssueSeverity
    code: str
    message: str
    file: str | None = None
    column: str | None = None
    row_number: int | None = None


@dataclass(frozen=True)
class ValidationResult:
    issues: tuple[ValidationIssue, ...]
    rows_accepted: int
    rows_rejected: int
    normalized_columns: dict[str, list[str]]

    @property
    def errors(self) -> tuple[ValidationIssue, ...]:
        return tuple(issue for issue in self.issues if issue.severity is IssueSeverity.ERROR)

    @property
    def warnings(self) -> tuple[ValidationIssue, ...]:
        return tuple(issue for issue in self.issues if issue.severity is IssueSeverity.WARNING)

    @property
    def is_valid(self) -> bool:
        return not self.errors


def resolve_columns(
    inspection: CsvInspection, mapping: FileMapping
) -> tuple[dict[SemanticField, str], list[str]]:
    """Combine detected semantics with caller-provided mapping overrides."""
    columns = {
        column.semantic_field: column.source_column
        for column in inspection.columns
        if column.semantic_field is not None
    }
    errors: list[str] = []
    for source_column, semantic_name in mapping.semantic_fields.items():
        if source_column not in inspection.headers:
            errors.append(f"Mapping references missing source column {source_column!r}.")
            continue
        try:
            semantic_field = SemanticField(semantic_name)
        except ValueError:
            errors.append(f"Mapping uses unsupported semantic field {semantic_name!r}.")
            continue
        columns[semantic_field] = source_column
    return columns, errors


def validate_import(
    files: list[tuple[str, Path]], mappings: dict[str, FileMapping]
) -> ValidationResult:
    """Validate every staged file without mutating any source data."""
    inspections: list[tuple[str, CsvInspection]] = []
    read_issues: list[ValidationIssue] = []
    for filename, path in files:
        try:
            inspections.append((filename, inspect_csv(path)))
        except CsvReadError as error:
            read_issues.append(
                ValidationIssue(IssueSeverity.ERROR, "csv_read_error", str(error), file=filename)
            )
    return validate_inspections(inspections, mappings, read_issues)


def validate_inspections(
    inspections: list[tuple[str, CsvInspection]],
    mappings: dict[str, FileMapping],
    extra_issues: list[ValidationIssue] | None = None,
) -> ValidationResult:
    issues = list(extra_issues or [])
    normalized_columns: dict[str, list[str]] = {}
    gps_file_count = 0
    gps_total_rows = 0
    rejected_gps_rows: set[tuple[str, int]] = set()
    rejected_motion_rows: set[tuple[str, int]] = set()

    for filename, inspection in inspections:
        mapping = mappings.get(filename, FileMapping())
        columns, mapping_errors = resolve_columns(inspection, mapping)
        for message in mapping_errors:
            issues.append(
                ValidationIssue(IssueSeverity.ERROR, "invalid_mapping", message, file=filename)
            )
        normalized_columns[filename] = [field.value for field in columns]

        if SemanticField.LATITUDE in columns or SemanticField.LONGITUDE in columns:
            gps_file_count += 1
            gps_total_rows += inspection.row_count
            if _gps_structure_is_valid(inspection, columns, mapping, filename, issues):
                _validate_gps_rows(inspection, columns, filename, issues, rejected_gps_rows)
            else:
                # Without required columns or a known unit no row can be normalized.
                rejected_gps_rows.update(
                    (filename, row_number)
                    for row_number in range(2, inspection.row_count + 2)
                )
        else:
            _validate_motion_rows(inspection, columns, filename, issues, rejected_motion_rows)

    if gps_file_count != 1:
        issues.append(
            ValidationIssue(
                IssueSeverity.ERROR,
                "gps_file_required",
                "Exactly one GPS file with latitude and longitude columns is required.",
            )
        )

    rows_rejected = len(rejected_gps_rows) + len(rejected_motion_rows)
    rows_accepted = max(gps_total_rows - len(rejected_gps_rows), 0)
    if gps_file_count != 1:
        rows_accepted = 0
    return ValidationResult(
        issues=tuple(issues),
        rows_accepted=rows_accepted,
        rows_rejected=rows_rejected,
        normalized_columns=normalized_columns,
    )


def _gps_structure_is_valid(
    inspection: CsvInspection,
    columns: Mapping[SemanticField, str],
    mapping: FileMapping,
    filename: str,
    issues: list[ValidationIssue],
) -> bool:
    valid = True
    for field in (
        SemanticField.TIMESTAMP,
        SemanticField.LATITUDE,
        SemanticField.LONGITUDE,
        SemanticField.SOG,
    ):
        if field not in columns:
            issues.append(
                ValidationIssue(
                    IssueSeverity.ERROR,
                    "required_gps_field_missing",
                    f"Required GPS field is missing: {field.value}.",
                    file=filename,
                )
            )
            valid = False

    if SemanticField.SOG in columns:
        speed_column = columns[SemanticField.SOG]
        unit = mapping.unit_overrides.get(speed_column, extract_unit(speed_column))
        try:
            normalize_speed_unit(unit)
        except UnitConversionError as error:
            if unit is None or not unit.strip():
                code = "speed_unit_required"
            else:
                code = "unsupported_speed_unit"
            issues.append(
                ValidationIssue(
                    IssueSeverity.ERROR,
                    code,
                    str(error),
                    file=filename,
                    column=speed_column,
                )
            )
            valid = False
    return valid


def _validate_gps_rows(
    inspection: CsvInspection,
    columns: Mapping[SemanticField, str],
    filename: str,
    issues: list[ValidationIssue],
    rejected: set[tuple[str, int]],
) -> None:
    timestamp_column = columns[SemanticField.TIMESTAMP]
    latitude_column = columns[SemanticField.LATITUDE]
    longitude_column = columns[SemanticField.LONGITUDE]
    speed_column = columns[SemanticField.SOG]
    seen_timestamps: set[datetime] = set()

    for row_number, row in enumerate(inspection.rows, start=2):
        has_error = False

        timestamp = _timestamp_value(row, timestamp_column, filename, issues, row_number)
        if timestamp is None:
            has_error = True
        elif timestamp in seen_timestamps:
            issues.append(
                ValidationIssue(
                    IssueSeverity.ERROR,
                    "duplicate_gps_timestamp",
                    f"Duplicate GPS timestamp {timestamp.isoformat()}.",
                    file=filename,
                    column=timestamp_column,
                    row_number=row_number,
                )
            )
            has_error = True
        else:
            seen_timestamps.add(timestamp)

        latitude = _numeric_value(row, latitude_column, filename, issues, row_number)
        if latitude is None:
            has_error = True
        elif not -90 <= latitude <= 90:
            issues.append(
                _range_issue(
                    "latitude_out_of_range",
                    "Latitude must be between -90 and 90.",
                    filename,
                    latitude_column,
                    row_number,
                )
            )
            has_error = True

        longitude = _numeric_value(row, longitude_column, filename, issues, row_number)
        if longitude is None:
            has_error = True
        elif not -180 <= longitude <= 180:
            issues.append(
                _range_issue(
                    "longitude_out_of_range",
                    "Longitude must be between -180 and 180.",
                    filename,
                    longitude_column,
                    row_number,
                )
            )
            has_error = True

        speed = _numeric_value(row, speed_column, filename, issues, row_number)
        if speed is None:
            has_error = True
        elif speed < 0:
            issues.append(
                ValidationIssue(
                    IssueSeverity.ERROR,
                    "negative_speed",
                    "Speed cannot be negative.",
                    file=filename,
                    column=speed_column,
                    row_number=row_number,
                )
            )
            has_error = True

        if SemanticField.COURSE in columns:
            course = _optional_numeric_value(
                row, columns[SemanticField.COURSE], filename, issues, row_number
            )
            if course is not None and not 0 <= course <= 360:
                issues.append(
                    _range_issue(
                        "course_out_of_range",
                        "Course must be between 0 and 360.",
                        filename,
                        columns[SemanticField.COURSE],
                        row_number,
                    )
                )
                has_error = True

        if SemanticField.HEADING in columns:
            heading = _optional_numeric_value(
                row, columns[SemanticField.HEADING], filename, issues, row_number
            )
            if heading is not None and not 0 <= heading <= 360:
                issues.append(
                    _range_issue(
                        "heading_out_of_range",
                        "Heading must be between 0 and 360.",
                        filename,
                        columns[SemanticField.HEADING],
                        row_number,
                    )
                )
                has_error = True

        if has_error:
            rejected.add((filename, row_number))


def _validate_motion_rows(
    inspection: CsvInspection,
    columns: Mapping[SemanticField, str],
    filename: str,
    issues: list[ValidationIssue],
    rejected: set[tuple[str, int]],
) -> None:
    timestamp_column = columns.get(SemanticField.TIMESTAMP)
    if timestamp_column is None:
        issues.append(
            ValidationIssue(
                IssueSeverity.ERROR,
                "required_field_missing",
                "Missing timestamp column.",
                file=filename,
            )
        )
        rejected.update((filename, row_number) for row_number in range(2, inspection.row_count + 2))
        return

    seen_timestamps: set[datetime] = set()
    for row_number, row in enumerate(inspection.rows, start=2):
        has_error = False
        timestamp = _timestamp_value(row, timestamp_column, filename, issues, row_number)
        if timestamp is None:
            has_error = True
        elif timestamp in seen_timestamps:
            issues.append(
                ValidationIssue(
                    IssueSeverity.ERROR,
                    "duplicate_motion_timestamp",
                    f"Duplicate motion timestamp {timestamp.isoformat()}.",
                    file=filename,
                    column=timestamp_column,
                    row_number=row_number,
                )
            )
            has_error = True
        else:
            seen_timestamps.add(timestamp)
        if has_error:
            rejected.add((filename, row_number))


def _timestamp_value(
    row: Mapping[str, str],
    column: str,
    filename: str,
    issues: list[ValidationIssue],
    row_number: int,
) -> datetime | None:
    value = row[column].strip()
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        issues.append(
            ValidationIssue(
                IssueSeverity.ERROR,
                "invalid_timestamp",
                "Timestamp must be ISO 8601 compatible.",
                file=filename,
                column=column,
                row_number=row_number,
            )
        )
        return None


def _numeric_value(
    row: Mapping[str, str],
    column: str,
    filename: str,
    issues: list[ValidationIssue],
    row_number: int,
) -> float | None:
    value = row[column].strip()
    try:
        parsed = float(value)
    except ValueError:
        issues.append(_invalid_numeric_issue(filename, column, row_number))
        return None
    if parsed != parsed:  # Reject NaN which float() accepts silently.
        issues.append(_invalid_numeric_issue(filename, column, row_number))
        return None
    return parsed


def _optional_numeric_value(
    row: Mapping[str, str],
    column: str,
    filename: str,
    issues: list[ValidationIssue],
    row_number: int,
) -> float | None:
    if not row.get(column, "").strip():
        return None
    return _numeric_value(row, column, filename, issues, row_number)


def _invalid_numeric_issue(filename: str, column: str, row_number: int) -> ValidationIssue:
    return ValidationIssue(
        IssueSeverity.ERROR,
        "invalid_numeric_value",
        "Value must be numeric.",
        file=filename,
        column=column,
        row_number=row_number,
    )


def _range_issue(
    code: str, message: str, filename: str, column: str, row_number: int
) -> ValidationIssue:
    return ValidationIssue(
        IssueSeverity.ERROR,
        code,
        message,
        file=filename,
        column=column,
        row_number=row_number,
    )
