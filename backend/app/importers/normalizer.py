import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from app.importers.column_detector import SemanticField, extract_unit
from app.importers.csv_reader import CsvInspection, CsvReadError, inspect_csv
from app.importers.unit_converter import convert_speed_to_knots
from app.importers.validator import (
    IssueSeverity,
    ValidationIssue,
    resolve_columns,
    validate_inspections,
)
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
    issues: tuple[ValidationIssue, ...]
    normalized_columns: dict[str, list[str]]
    rows_rejected: int


def normalize_import(
    files: list[tuple[str, Path]], mappings: dict[str, FileMapping]
) -> NormalizedImport:
    """Validate staged files, then normalize GPS rows and merge optional metrics by timestamp."""
    inspections: list[tuple[str, CsvInspection]] = []
    read_issues: list[ValidationIssue] = []
    for filename, path in files:
        try:
            inspections.append((filename, inspect_csv(path)))
        except CsvReadError as error:
            read_issues.append(
                ValidationIssue(IssueSeverity.ERROR, "csv_read_error", str(error), file=filename)
            )

    validation = validate_inspections(inspections, mappings, read_issues)
    if not validation.is_valid:
        return NormalizedImport(
            samples=(),
            metric_definitions=(),
            issues=validation.issues,
            normalized_columns=validation.normalized_columns,
            rows_rejected=validation.rows_rejected,
        )

    issues = list(validation.issues)
    gps_rows: dict[datetime, NormalizedSample] = {}
    motion_rows: dict[datetime, dict[str, float]] = {}
    metric_definitions: dict[str, MetricDefinition] = {}

    for filename, inspection in inspections:
        columns, _ = resolve_columns(inspection, mappings.get(filename, FileMapping()))
        is_gps = (
            SemanticField.LATITUDE in columns or SemanticField.LONGITUDE in columns
        )
        if is_gps:
            _normalize_gps_rows(
                filename,
                inspection,
                columns,
                mappings.get(filename, FileMapping()),
                gps_rows,
                metric_definitions,
                issues,
            )
        else:
            _normalize_motion_rows(
                filename,
                inspection,
                columns,
                motion_rows,
                metric_definitions,
                issues,
            )

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
        issues.append(
            ValidationIssue(
                IssueSeverity.WARNING,
                "gps_without_matching_motion",
                f"{missing_motion_rows} GPS rows have no matching motion timestamp.",
            )
        )
    if unmatched_motion_rows:
        issues.append(
            ValidationIssue(
                IssueSeverity.WARNING,
                "motion_without_matching_gps",
                f"{unmatched_motion_rows} motion rows have no matching GPS timestamp.",
            )
        )

    metric_definitions.update(_estimated_metric_definitions())
    metric_definitions.update(_environmental_metric_definitions())
    issues.append(
        ValidationIssue(
            IssueSeverity.INFORMATION,
            "estimated_metrics_generated",
            "Estimated metrics will be generated: rpm, fuel_tpd.",
        )
    )
    return NormalizedImport(
        samples=tuple(samples),
        metric_definitions=tuple(metric_definitions.values()),
        issues=tuple(issues),
        normalized_columns=validation.normalized_columns,
        rows_rejected=validation.rows_rejected,
    )


def _normalize_gps_rows(
    filename: str,
    inspection: CsvInspection,
    columns: dict[SemanticField, str],
    mapping: FileMapping,
    gps_rows: dict[datetime, NormalizedSample],
    metric_definitions: dict[str, MetricDefinition],
    issues: list[ValidationIssue],
) -> None:
    # Validation has already confirmed required columns, units, ranges, and uniqueness.
    speed_column = columns[SemanticField.SOG]
    speed_unit = mapping.unit_overrides.get(speed_column, extract_unit(speed_column))
    _add_navigation_metric_definitions(columns, metric_definitions)

    for row_number, row in enumerate(inspection.rows, start=2):
        try:
            timestamp = _timestamp(row[columns[SemanticField.TIMESTAMP]])
            latitude = _number(row[columns[SemanticField.LATITUDE]])
            longitude = _number(row[columns[SemanticField.LONGITUDE]])
            speed = convert_speed_to_knots(_number(row[speed_column]), speed_unit)
        except ValueError as error:
            # Defensive only: validated rows should always parse.
            issues.append(
                ValidationIssue(
                    IssueSeverity.WARNING,
                    "row_skipped",
                    f"{filename} row {row_number}: skipped ({error}).",
                    file=filename,
                    row_number=row_number,
                )
            )
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


def _normalize_motion_rows(
    filename: str,
    inspection: CsvInspection,
    columns: dict[SemanticField, str],
    motion_rows: dict[datetime, dict[str, float]],
    metric_definitions: dict[str, MetricDefinition],
    issues: list[ValidationIssue],
) -> None:
    timestamp_column = columns.get(SemanticField.TIMESTAMP)
    if timestamp_column is None:
        return

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

    for row_number, row in enumerate(inspection.rows, start=2):
        try:
            timestamp = _timestamp(row[timestamp_column])
        except ValueError:
            continue
        values: dict[str, float] = {}
        for header in metric_columns:
            value = _optional_number(row[header])
            if value is not None:
                values[keys[header]] = value
        motion_rows[timestamp] = values


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
            formula="4 × STW",
            based_on=("stw",),
            warning="Estimated from Speed Through Water; not measured RPM.",
        ),
        "fuel_tpd": MetricDefinition(
            key="fuel_tpd",
            display_name="Fuel Consumption",
            unit="tonnes/day",
            origin="estimated",
            source_column=None,
            formula="150 × (STW / 15)^3",
            based_on=("stw",),
            warning="Estimated from Speed Through Water; not measured fuel consumption.",
        ),
        "stw": MetricDefinition(
            key="stw",
            display_name="Speed Through Water",
            unit="knots",
            origin="estimated",
            source_column=None,
            formula="SOG − current along heading",
            based_on=("sog", "current"),
            warning=(
                "Estimated from SOG and the ocean-current projection; "
                "falls back to SOG without current data."
            ),
        ),
        "current_along_heading": MetricDefinition(
            key="current_along_heading",
            display_name="Current Along Heading",
            unit="knots",
            origin="estimated",
            source_column=None,
            formula="current × cos(direction − heading)",
            based_on=("current", "heading"),
        ),
        "weather_factor": MetricDefinition(
            key="weather_factor",
            display_name="Weather Factor",
            unit="",
            origin="estimated",
            source_column=None,
            formula="∛(Hs / 2)",
            based_on=("wave_height",),
            warning=(
                "Environmental indicator derived from significant wave height; "
                "not applied to fuel consumption."
            ),
        ),
    }


def _environmental_metric_definitions() -> dict[str, MetricDefinition]:
    return {
        "wind_speed": MetricDefinition(
            key="wind_speed",
            display_name="Wind Speed",
            unit="knots",
            origin="environmental",
            source_column=None,
            warning="External historical model data, not an onboard sensor measurement.",
        ),
        "wind_direction": MetricDefinition(
            key="wind_direction",
            display_name="Wind Direction",
            unit="degrees",
            origin="environmental",
            source_column=None,
            warning="External historical model data, not an onboard sensor measurement.",
        ),
        "wave_height": MetricDefinition(
            key="wave_height",
            display_name="Wave Height",
            unit="metres",
            origin="environmental",
            source_column=None,
            warning="External historical model data, not an onboard sensor measurement.",
        ),
        "wave_direction": MetricDefinition(
            key="wave_direction",
            display_name="Wave Direction",
            unit="degrees",
            origin="environmental",
            source_column=None,
            warning="External historical model data, not an onboard sensor measurement.",
        ),
        "wave_period": MetricDefinition(
            key="wave_period",
            display_name="Wave Period",
            unit="seconds",
            origin="environmental",
            source_column=None,
            warning="External historical model data, not an onboard sensor measurement.",
        ),
        "current_speed": MetricDefinition(
            key="current_speed",
            display_name="Ocean Current Speed",
            unit="knots",
            origin="environmental",
            source_column=None,
            warning="External historical model data, not an onboard sensor measurement.",
        ),
        "current_direction": MetricDefinition(
            key="current_direction",
            display_name="Ocean Current Direction",
            unit="degrees",
            origin="environmental",
            source_column=None,
            warning="External historical model data, not an onboard sensor measurement.",
        ),
    }
