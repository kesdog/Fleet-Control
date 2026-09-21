from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from shutil import rmtree
from threading import Thread
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.db.models import EnvironmentalSample, ImportSession, Sample, Vessel, VesselMetric
from app.importers.csv_reader import CsvInspection, CsvReadError, inspect_csv
from app.importers.normalizer import NormalizedImport, NormalizedSample, normalize_import
from app.importers.validator import IssueSeverity, ValidationIssue
from app.schemas.imports import (
    ColumnPreview,
    CommitImportRequest,
    CommitImportResponse,
    FileMapping,
    FilePreview,
    ImportPreviewResponse,
    ImportProgressResponse,
    ImportStatus,
    ImportValidationResponse,
    StartImportResponse,
    UpdateMappingRequest,
    UpdateMappingResponse,
    UploadedFileSummary,
    ValidationIssueResponse,
)
from app.services.environment_service import (
    EnvironmentalObservation,
    fetch_environment_for_samples,
)
from app.services.fleet_cache import FleetCacheManager
from app.services.performance_service import calculate_fuel_rate_tpd, calculate_rpm, derive_stw


async def create_import_session(
    session: Session, imports_directory: Path, files: Iterable[UploadFile]
) -> StartImportResponse:
    uploaded_files = list(files)
    if not uploaded_files:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="At least one CSV is required.",
        )
    filenames = [_validated_filename(upload) for upload in uploaded_files]
    if len(filenames) != len(set(filenames)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Uploaded CSV filenames must be unique within an import session.",
        )

    session_id = str(uuid4())
    # Files never share a directory, preventing one session from seeing another's uploads.
    session_directory = imports_directory / session_id
    session_directory.mkdir(parents=True)
    stored_files: list[dict[str, str]] = []
    inspections: list[tuple[str, CsvInspection]] = []

    try:
        for upload, filename in zip(uploaded_files, filenames, strict=True):
            stored_name = f"{uuid4()}-{filename}"
            destination = session_directory / stored_name
            await _write_upload(upload, destination)
            # Reject unreadable CSVs before a session record is persisted.
            inspection = inspect_csv(destination)
            stored_files.append({"filename": filename, "stored_name": stored_name})
            inspections.append((filename, inspection))
    except (CsvReadError, HTTPException) as error:
        rmtree(session_directory, ignore_errors=True)
        if isinstance(error, HTTPException):
            raise error
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error

    # This milestone stores only import metadata; vessel and sample tables remain untouched.
    import_session = ImportSession(
        id=session_id,
        status=ImportStatus.UPLOADED.value,
        source_files={"files": stored_files},
        detected_mapping={"files": {}},
        validation_result=None,
    )
    session.add(import_session)
    session.commit()

    summaries = [
        UploadedFileSummary(
            filename=filename,
            headers=list(inspection.headers),
            delimiter=inspection.delimiter,
            row_count=inspection.row_count,
            warnings=_inspection_warnings(inspection),
        )
        for filename, inspection in inspections
    ]
    return StartImportResponse(session_id=session_id, status=ImportStatus.UPLOADED, files=summaries)


def preview_import_session(
    session: Session, imports_directory: Path, session_id: str
) -> ImportPreviewResponse:
    import_session = _get_active_session(session, session_id)
    # Re-read staged source files so preview stays derived from the uploaded data, not client input.
    file_previews = [
        _preview_file(imports_directory / session_id / file["stored_name"], file["filename"])
        for file in _source_files(import_session)
    ]
    import_session.status = ImportStatus.INSPECTED.value
    session.commit()
    return ImportPreviewResponse(
        session_id=session_id, status=ImportStatus.INSPECTED, files=file_previews
    )


def update_mapping(
    session: Session, session_id: str, payload: UpdateMappingRequest
) -> UpdateMappingResponse:
    import_session = _get_active_session(session, session_id)
    filenames = {file["filename"] for file in _source_files(import_session)}
    unknown_files = set(payload.files) - filenames
    if unknown_files:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Mapping references unknown files: {', '.join(sorted(unknown_files))}.",
        )

    # Persist caller choices as JSON for validation and commit steps in later milestones.
    mapping = {
        filename: file_mapping.model_dump() for filename, file_mapping in payload.files.items()
    }
    import_session.detected_mapping = {"files": mapping}
    import_session.status = ImportStatus.MAPPED.value
    session.commit()
    return UpdateMappingResponse(
        session_id=session_id,
        status=ImportStatus.MAPPED,
        mapping=payload.files,
    )


def validate_import_session(
    session: Session, imports_directory: Path, session_id: str
) -> ImportValidationResponse:
    import_session = _get_active_session(session, session_id)
    normalized = _normalize_session(import_session, imports_directory)
    response = _validation_response(session_id, normalized)
    import_session.validation_result = response.model_dump(mode="json")
    import_session.status = (
        ImportStatus.VALIDATED.value
        if not _has_blocking_errors(normalized)
        else ImportStatus.FAILED.value
    )
    session.commit()
    return response


def commit_import_session(
    session: Session,
    imports_directory: Path,
    session_id: str,
    request: CommitImportRequest,
    fleet_cache: FleetCacheManager,
    settings: Settings,
    session_factory: sessionmaker[Session],
) -> CommitImportResponse:
    import_session = _get_active_session(session, session_id)
    if import_session.status != ImportStatus.VALIDATED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Import session must pass validation before commit.",
        )
    normalized = _normalize_session(import_session, imports_directory)
    if _has_blocking_errors(normalized):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="; ".join(
                issue.message
                for issue in normalized.issues
                if issue.severity is IssueSeverity.ERROR
            ),
        )

    existing_vessel = session.scalar(select(Vessel).where(Vessel.imo == request.imo))
    if existing_vessel is not None and request.mode.value == "CREATE":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Vessel {request.imo} already exists; use REPLACE to overwrite it.",
        )

    # Commit telemetry first; environmental data arrives asynchronously in production.
    import_session.status = (
        ImportStatus.ENRICHING.value
        if settings.environment_enrichment_enabled
        else ImportStatus.COMMITTED.value
    )
    import_session.import_imo = request.imo
    import_session.enrichment_days_completed = 0
    import_session.enrichment_days_total = 0
    session.commit()

    if settings.environment_enrichment_enabled:
        enriched = [_enrich_sample(sample, None, settings) for sample in normalized.samples]
    else:
        try:
            observations = fetch_environment_for_samples(normalized.samples, settings)
        except Exception:  # noqa: BLE001 - enrichment must never fail a telemetry import.
            observations = {}
        enriched = [
            _enrich_sample(sample, observations.get(sample.timestamp), settings)
            for sample in normalized.samples
        ]

    # End the read transaction before opening the explicit all-or-nothing write transaction.
    session.commit()
    with session.begin():
        existing_vessel = session.scalar(select(Vessel).where(Vessel.imo == request.imo))
        if existing_vessel is not None:
            # Remove dependent records first so replacement works with SQLite foreign keys enabled.
            sample_ids = session.scalars(
                select(Sample.id).where(Sample.vessel_id == existing_vessel.id)
            ).all()
            session.execute(
                delete(EnvironmentalSample).where(
                    EnvironmentalSample.sample_id.in_(sample_ids)
                )
            )
            session.execute(delete(Sample).where(Sample.vessel_id == existing_vessel.id))
            session.execute(
                delete(VesselMetric).where(VesselMetric.vessel_id == existing_vessel.id)
            )
            session.delete(existing_vessel)
            session.flush()

        vessel = Vessel(imo=request.imo, name=request.name)
        session.add(vessel)
        session.flush()
        samples = [
            Sample(
                vessel_id=vessel.id,
                timestamp=sample.timestamp,
                latitude_deg=sample.latitude_deg,
                longitude_deg=sample.longitude_deg,
                sog_knots=sample.sog_knots,
                course_deg=sample.course_deg,
                heading_deg=sample.heading_deg,
                estimated_rpm=enriched.rpm,
                estimated_fuel_tpd=enriched.fuel_tpd,
                metrics_json=sample.metrics or None,
            )
            for sample, enriched in zip(normalized.samples, enriched, strict=True)
        ]
        session.add_all(samples)
        session.flush()
        session.add_all(
            _environmental_sample(sample, enriched)
            for sample, enriched in zip(samples, enriched, strict=True)
        )
        session.add_all(
            [
                VesselMetric(
                    vessel_id=vessel.id,
                    key=metric.key,
                    display_name=metric.display_name,
                    unit=metric.unit,
                    origin=metric.origin,
                    source_column=metric.source_column,
                    formula=metric.formula,
                    based_on=list(metric.based_on) if metric.based_on is not None else None,
                    warning=metric.warning,
                )
                for metric in normalized.metric_definitions
            ]
        )
        committed_session = session.get(ImportSession, session_id)
        if committed_session is None:
            raise RuntimeError("Import session disappeared during commit.")
        committed_session.status = import_session.status

    # Cache replacement happens strictly after SQLite commits, so failed writes cannot affect reads.
    fleet_cache.refresh_vessel(session, request.imo)
    if settings.environment_enrichment_enabled:
        Thread(
            target=_enrich_committed_vessel,
            args=(
                session_factory,
                session_id,
                request.imo,
                normalized.samples,
                settings,
                fleet_cache,
            ),
            daemon=True,
        ).start()
    return CommitImportResponse(
        session_id=session_id,
        status=ImportStatus(import_session.status),
        imo=request.imo,
        samples_imported=len(normalized.samples),
    )


def _enrich_committed_vessel(
    session_factory: sessionmaker[Session],
    session_id: str,
    imo: str,
    normalized_samples: tuple[NormalizedSample, ...],
    settings: Settings,
    fleet_cache: FleetCacheManager,
) -> None:
    def update_progress(completed_days: int, total_days: int) -> None:
        with session_factory() as progress_session:
            import_session = progress_session.get(ImportSession, session_id)
            if import_session is not None:
                import_session.enrichment_days_completed = completed_days
                import_session.enrichment_days_total = total_days
                progress_session.commit()

    try:
        observations = fetch_environment_for_samples(
            normalized_samples, settings, on_progress=update_progress
        )
    except Exception:  # noqa: BLE001 - telemetry remains available when enrichment fails.
        observations = {}
    enriched_by_timestamp = {
        sample.timestamp: _enrich_sample(sample, observations.get(sample.timestamp), settings)
        for sample in normalized_samples
    }
    with session_factory() as session:
        vessel = session.scalar(select(Vessel).where(Vessel.imo == imo))
        if vessel is None:
            return
        rows = session.execute(
            select(Sample, EnvironmentalSample)
            .join(EnvironmentalSample, EnvironmentalSample.sample_id == Sample.id)
            .where(Sample.vessel_id == vessel.id)
        ).all()
        for sample, environmental in rows:
            enriched = enriched_by_timestamp.get(sample.timestamp)
            if enriched is None:
                continue
            sample.estimated_rpm = enriched.rpm
            sample.estimated_fuel_tpd = enriched.fuel_tpd
            replacement = _environmental_sample(sample, enriched)
            for field in (
                "wind_speed_knots", "wind_direction_deg", "wave_height_m", "wave_direction_deg",
                "wave_period_s", "current_speed_knots", "current_direction_deg", "weather_factor",
                "current_along_heading_knots", "stw_knots", "stw_source",
            ):
                setattr(environmental, field, getattr(replacement, field))
        import_session = session.get(ImportSession, session_id)
        if import_session is not None:
            import_session.status = ImportStatus.COMMITTED.value
        session.commit()
        fleet_cache.refresh_vessel(session, imo)


def import_progress(session: Session, session_id: str) -> ImportProgressResponse:
    import_session = _get_active_session(session, session_id)
    return ImportProgressResponse(
        session_id=import_session.id,
        status=ImportStatus(import_session.status),
        imo=import_session.import_imo,
        enrichment_days_completed=import_session.enrichment_days_completed,
        enrichment_days_total=import_session.enrichment_days_total,
    )


def cancel_import_session(session: Session, imports_directory: Path, session_id: str) -> None:
    import_session = _get_active_session(session, session_id)
    session.delete(import_session)
    session.commit()
    # Delete disk artifacts only after the database no longer exposes the session.
    rmtree(imports_directory / session_id, ignore_errors=True)


def _get_active_session(session: Session, session_id: str) -> ImportSession:
    import_session = session.get(ImportSession, session_id)
    if import_session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Import session not found."
        )
    return import_session


def _source_files(import_session: ImportSession) -> list[dict[str, str]]:
    source_files = import_session.source_files or {"files": []}
    return list(source_files["files"])


def _normalize_session(import_session: ImportSession, imports_directory: Path) -> NormalizedImport:
    raw_mappings = (import_session.detected_mapping or {"files": {}}).get("files", {})
    mappings = {
        filename: FileMapping.model_validate(mapping)
        for filename, mapping in raw_mappings.items()
    }
    files = [
        (file["filename"], imports_directory / import_session.id / file["stored_name"])
        for file in _source_files(import_session)
    ]
    return normalize_import(files, mappings)


def _validation_response(session_id: str, normalized: NormalizedImport) -> ImportValidationResponse:
    return ImportValidationResponse(
        session_id=session_id,
        status=(
            ImportStatus.VALIDATED if not _has_blocking_errors(normalized) else ImportStatus.FAILED
        ),
        issues=[_issue_response(issue) for issue in normalized.issues],
        normalized_columns=normalized.normalized_columns,
        estimated_metrics=_estimated_metrics(normalized),
        rows_accepted=len(normalized.samples),
        rows_rejected=normalized.rows_rejected,
    )


def _has_blocking_errors(normalized: NormalizedImport) -> bool:
    return any(issue.severity is IssueSeverity.ERROR for issue in normalized.issues)


def _issue_response(issue: ValidationIssue) -> ValidationIssueResponse:
    return ValidationIssueResponse(
        severity=issue.severity.value,
        code=issue.code,
        message=issue.message,
        file=issue.file,
        column=issue.column,
        row_number=issue.row_number,
    )


def _estimated_metrics(normalized: NormalizedImport) -> list[str]:
    estimated = [
        metric.key for metric in normalized.metric_definitions if metric.origin == "estimated"
    ]
    return estimated or ["rpm", "fuel_tpd"]


@dataclass(frozen=True)
class _EnrichedSample:
    rpm: float
    fuel_tpd: float
    stw_knots: float
    stw_source: str
    current_along_heading_knots: float | None
    observation: EnvironmentalObservation | None


def _enrich_sample(
    sample: NormalizedSample,
    observation: EnvironmentalObservation | None,
    settings: Settings,
) -> _EnrichedSample:
    current_speed = observation.current_speed_knots if observation else None
    current_direction = observation.current_direction_deg if observation else None
    stw = derive_stw(
        sample.sog_knots, sample.heading_deg, current_speed, current_direction
    )
    return _EnrichedSample(
        rpm=calculate_rpm(stw.stw_knots),
        fuel_tpd=calculate_fuel_rate_tpd(
            stw.stw_knots,
            settings.fuel_reference_speed_knots,
            settings.fuel_reference_rate_tpd,
        ),
        stw_knots=stw.stw_knots,
        stw_source=stw.source,
        current_along_heading_knots=stw.current_along_heading_knots,
        observation=observation,
    )


def _environmental_sample(
    sample: Sample, enriched: _EnrichedSample
) -> EnvironmentalSample:
    observation = enriched.observation
    return EnvironmentalSample(
        sample_id=sample.id,
        wind_speed_knots=observation.wind_speed_knots if observation else None,
        wind_direction_deg=observation.wind_direction_deg if observation else None,
        wave_height_m=observation.wave_height_m if observation else None,
        wave_direction_deg=observation.wave_direction_deg if observation else None,
        wave_period_s=observation.wave_period_s if observation else None,
        current_speed_knots=observation.current_speed_knots if observation else None,
        current_direction_deg=observation.current_direction_deg if observation else None,
        weather_factor=observation.weather_factor if observation else None,
        current_along_heading_knots=enriched.current_along_heading_knots,
        stw_knots=enriched.stw_knots,
        stw_source=enriched.stw_source,
    )


def _validated_filename(upload: UploadFile) -> str:
    # Discard any client-supplied path components before building a filesystem path.
    filename = Path(upload.filename or "").name
    if not filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Only .csv files are supported.",
        )
    return filename


async def _write_upload(upload: UploadFile, destination: Path) -> None:
    try:
        with destination.open("wb") as target:
            # Stream uploads in bounded chunks instead of loading the full file into memory.
            while chunk := await upload.read(1024 * 1024):
                target.write(chunk)
    finally:
        await upload.close()


def _preview_file(path: Path, filename: str) -> FilePreview:
    try:
        inspection = inspect_csv(path)
    except CsvReadError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error

    warnings = _inspection_warnings(inspection)
    confirmation_fields = [
        column.source_column for column in inspection.columns if column.requires_unit_mapping
    ]
    return FilePreview(
        filename=filename,
        source_columns=list(inspection.headers),
        columns=[
            ColumnPreview(
                source_column=column.source_column,
                semantic_field=column.semantic_field,
                detected_unit=column.detected_unit,
                requires_unit_mapping=column.requires_unit_mapping,
            )
            for column in inspection.columns
        ],
        row_count=inspection.row_count,
        timestamp_range=_timestamp_range(inspection),
        null_counts={
            header: sum(not row[header].strip() for row in inspection.rows)
            for header in inspection.headers
        },
        sample_rows=[dict(row) for row in inspection.rows[:5]],
        warnings=warnings,
        fields_requiring_confirmation=confirmation_fields,
    )


def _inspection_warnings(inspection: CsvInspection) -> list[str]:
    warnings = []
    unknown_columns = [
        column.source_column for column in inspection.columns if column.semantic_field is None
    ]
    if unknown_columns:
        warnings.append(
            f"{len(unknown_columns)} unrecognized columns will be preserved as optional metrics."
        )
    if not inspection.timestamp_columns:
        warnings.append("No timestamp column was detected.")
    return warnings


def _timestamp_range(inspection: CsvInspection) -> tuple[str, str] | None:
    if not inspection.timestamp_columns:
        return None
    timestamp_column = inspection.timestamp_columns[0]
    timestamps = []
    for row in inspection.rows:
        try:
            timestamps.append(datetime.fromisoformat(row[timestamp_column].replace("Z", "+00:00")))
        except ValueError:
            # Preview returns useful bounds while validation reports malformed timestamps.
            continue
    if not timestamps:
        return None
    return min(timestamps).isoformat(), max(timestamps).isoformat()
