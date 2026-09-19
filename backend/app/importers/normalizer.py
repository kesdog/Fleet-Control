import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from app.importers.column_detector import SemanticField, extract_unit
from app.importers.csv_reader import CsvInspection, CsvReadError, inspect_csv
from app.importers.unit_converter import UnitConversionError, convert_speed_to_knots
from app.schemas.imports import FileMapping


@dataclass(frozen=True)
class MetricDefinition:
    key: str
    display_name: str
    unit: str
    origin: str
    source_column: str | None
    formula: str | None = None
    based_on: tuple[str, ...] | None = None
    warning: str | None = None


@dataclass(frozen=True)
class NormalizedSample:
    timestamp: datetime
    latitude_deg: float
    longitude_deg: float
    sog_knots: float
    course_deg: float | None
    heading_deg: float | None
    estimated_rpm: float
    estimated_fuel_tpd: float
    metrics: dict[str, float]


@dataclass(frozen=True)
class NormalizedImport:
    samples: tuple[NormalizedSample, ...]
    metric_definitions: tuple[MetricDefinition, ...]
    errors: tuple[str, ...]
    warnings: tuple[str, ...]
    normalized_columns: dict[str, list[str]]
    rows_rejected: int


def normalize_import(
    files: list[tuple[str, Path]], mappings: dict[str, FileMapping]
) -> NormalizedImport:
    """Read staged files, normalize GPS rows, and merge optional metrics by timestamp."""
    errors: list[str] = []
    warnings: list[str] = []
    normalized_columns: dict[str, list[str]] = {}
    gps_rows: dict[datetime, NormalizedSample] = {}
    motion_rows: dict[datetime, dict[str, float]] = {}
    metric_definitions: dict[str, MetricDefinition] = {}
    rows_rejected = 0
    gps_files = 0

    for filename, path in files:
        try:
            inspection = inspect_csv(path)
        except CsvReadError as error:
            errors.append(f"{filename}: {error}")
            continue

        field_columns, mapping_errors = _resolve_columns(
            inspection, mappings.get(filename, FileMapping())
        )
        errors.extend(f"{filename}: {error}" for error in mapping_errors)
        normalized_columns[filename] = [field.value for field in field_columns]
        is_gps = SemanticField.LATITUDE in field_columns or SemanticField.LONGITUDE in field_columns
        if is_gps:
            gps_files += 1
            rejected = _normalize_gps_rows(
                filename,
                inspection,
                field_columns,
                mappings.get(filename, FileMapping()),
                gps_rows,
                metric_definitions,
                errors,
                warnings,
            )
            rows_rejected += rejected
        else:
            rejected = _normalize_motion_rows(
                filename,
                inspection,
                field_columns,
                motion_rows,
                metric_definitions,
                errors,
                warnings,
            )
            rows_rejected += rejected

    if gps_files != 1:
        errors.append("Exactly one GPS file with latitude and longitude columns is required.")
    if not gps_rows:
        errors.append("No valid GPS rows are available for import.")

    samples: list[NormalizedSample] = []
    missing_motion_rows = 0
    for timestamp, sample in sorted(gps_rows.items()):
        metrics = motion_rows.get(timestamp, {})
        if motion_rows and not metrics:
            missing_motion_rows += 1
        samples.append(
            NormalizedSample(
                timestamp=sample.timestamp,
                latitude_deg=sample.latitude_deg,
                longitude_deg=sample.longitude_deg,
                sog_knots=sample.sog_knots,
                course_deg=sample.course_deg,
                heading_deg=sample.heading_deg,
                estimated_rpm=sample.estimated_rpm,
                estimated_fuel_tpd=sample.estimated_fuel_tpd,
                metrics=metrics,
            )
        )
    unmatched_motion_rows = len(set(motion_rows) - set(gps_rows))
    if missing_motion_rows:
        warnings.append(f"{missing_motion_rows} GPS rows have no matching motion timestamp.")
    if unmatched_motion_rows:
        warnings.append(f"{unmatched_motion_rows} motion rows have no matching GPS timestamp.")

    metric_definitions.update(_estimated_metric_definitions())
    return NormalizedImport(
        samples=tuple(samples),
        metric_definitions=tuple(metric_definitions.values()),
        errors=tuple(errors),
        warnings=tuple(warnings),
        normalized_columns=normalized_columns,
        rows_rejected=rows_rejected,
    )


def _resolve_columns(
    inspection: CsvInspection, mapping: FileMapping
) -> tuple[dict[SemanticField, str], list[str]]:
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


def _normalize_gps_rows(
    filename: str,
    inspection: CsvInspection,
    columns: dict[SemanticField, str],
    mapping: FileMapping,
    gps_rows: dict[datetime, NormalizedSample],
    metric_definitions: dict[str, MetricDefinition],
    errors: list[str],
    warnings: list[str],
) -> int:
    required_fields = (
        SemanticField.TIMESTAMP,
        SemanticField.LATITUDE,
        SemanticField.LONGITUDE,
        SemanticField.SOG,
    )
    missing = [field.value for field in required_fields if field not in columns]
    if missing:
        errors.append(f"{filename}: missing required GPS columns: {', '.join(missing)}.")
        return inspection.row_count

    speed_column = columns[SemanticField.SOG]
    speed_unit = mapping.unit_overrides.get(speed_column, extract_unit(speed_column))
    try:
        convert_speed_to_knots(1.0, speed_unit)
    except UnitConversionError as error:
        errors.append(f"{filename}: {error}")
        return inspection.row_count

    _add_navigation_metric_definitions(columns, metric_definitions)
    rejected = 0
    for row_number, row in enumerate(inspection.rows, start=2):
        try:
            timestamp = _timestamp(row[columns[SemanticField.TIMESTAMP]])
            latitude = _number(row[columns[SemanticField.LATITUDE]])
            longitude = _number(row[columns[SemanticField.LONGITUDE]])
            speed = convert_speed_to_knots(_number(row[speed_column]), speed_unit)
            if not -90 <= latitude <= 90 or not -180 <= longitude <= 180 or speed < 0:
                raise ValueError("latitude, longitude, or speed is outside its allowed range")
        except (UnitConversionError, ValueError) as error:
            warnings.append(f"{filename} row {row_number}: rejected ({error}).")
            rejected += 1
            continue
        if timestamp in gps_rows:
            errors.append(
                f"{filename} row {row_number}: duplicate GPS timestamp {timestamp.isoformat()}."
            )
            rejected += 1
            continue

        course = _optional_number(row.get(columns.get(SemanticField.COURSE, ""), ""))
        heading = _optional_number(row.get(columns.get(SemanticField.HEADING, ""), ""))
        gps_rows[timestamp] = NormalizedSample(
            timestamp=timestamp,
            latitude_deg=latitude,
            longitude_deg=longitude,
            sog_knots=speed,
            course_deg=course,
            heading_deg=heading,
            estimated_rpm=4 * speed,
            estimated_fuel_tpd=150 * (speed / 15) ** 3,
            metrics={},
        )
    return rejected


def _normalize_motion_rows(
    filename: str,
    inspection: CsvInspection,
    columns: dict[SemanticField, str],
    motion_rows: dict[datetime, dict[str, float]],
    metric_definitions: dict[str, MetricDefinition],
    errors: list[str],
    warnings: list[str],
) -> int:
    timestamp_column = columns.get(SemanticField.TIMESTAMP)
    if timestamp_column is None:
        errors.append(f"{filename}: missing timestamp column.")
        return inspection.row_count

    metric_columns = [header for header in inspection.headers if header != timestamp_column]
    keys = _metric_keys(metric_columns)
    for header, key in keys.items():
        metric_definitions[key] = MetricDefinition(
            key=key,
            display_name=header,
            unit=extract_unit(header) or "unknown",
            origin="measured",
            source_column=header,
        )

    rejected = 0
    for row_number, row in enumerate(inspection.rows, start=2):
        try:
            timestamp = _timestamp(row[timestamp_column])
        except ValueError as error:
            warnings.append(f"{filename} row {row_number}: rejected ({error}).")
            rejected += 1
            continue
        if timestamp in motion_rows:
            errors.append(
                f"{filename} row {row_number}: duplicate motion timestamp {timestamp.isoformat()}."
            )
            rejected += 1
            continue
        values = {
            keys[header]: value
            for header in metric_columns
            if (value := _optional_number(row[header])) is not None
        }
        motion_rows[timestamp] = values
    return rejected


def _timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.strip().replace("Z", "+00:00"))


def _number(value: str) -> float:
    parsed = float(value)
    if parsed != parsed:
        raise ValueError("numeric value cannot be NaN")
    return parsed


def _optional_number(value: str) -> float | None:
    return _number(value) if value.strip() else None


def _metric_keys(headers: list[str]) -> dict[str, str]:
    keys: dict[str, str] = {}
    for header in headers:
        base = re.sub(r"\s+", "_", re.sub(r"[^a-z0-9]+", " ", header.lower())).strip("_")
        key = base or "metric"
        suffix = 2
        while key in keys.values():
            key = f"{base}_{suffix}"
            suffix += 1
        keys[header] = key
    return keys


def _add_navigation_metric_definitions(
    columns: dict[SemanticField, str], metric_definitions: dict[str, MetricDefinition]
) -> None:
    definitions = {
        SemanticField.LATITUDE: ("latitude_deg", "Latitude", "degrees"),
        SemanticField.LONGITUDE: ("longitude_deg", "Longitude", "degrees"),
        SemanticField.SOG: ("sog", "Speed Over Ground", "knots"),
        SemanticField.COURSE: ("course", "Course", "degrees"),
        SemanticField.HEADING: ("heading", "Heading", "degrees"),
    }
    for field, (key, label, unit) in definitions.items():
        if field in columns:
            metric_definitions[key] = MetricDefinition(
                key=key,
                display_name=label,
                unit=unit,
                origin="measured",
                source_column=columns[field],
            )


def _estimated_metric_definitions() -> dict[str, MetricDefinition]:
    return {
        "rpm": MetricDefinition(
            key="rpm",
            display_name="Propeller RPM",
            unit="rpm",
            origin="estimated",
            source_column=None,
            formula="4 × SOG",
            based_on=("sog",),
            warning="Estimated from Speed Over Ground; not measured RPM.",
        ),
        "fuel_tpd": MetricDefinition(
            key="fuel_tpd",
            display_name="Fuel Consumption",
            unit="tonnes/day",
            origin="estimated",
            source_column=None,
            formula="150 × (SOG / 15)^3",
            based_on=("sog",),
            warning="Estimated from Speed Over Ground; not measured fuel consumption.",
        ),
    }
