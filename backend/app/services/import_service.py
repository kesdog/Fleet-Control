from collections.abc import Iterable
from datetime import datetime
from pathlib import Path
from shutil import rmtree
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.db.models import ImportSession
from app.importers.csv_reader import CsvInspection, CsvReadError, inspect_csv
from app.schemas.imports import (
    ColumnPreview,
    FilePreview,
    ImportPreviewResponse,
    ImportStatus,
    StartImportResponse,
    UpdateMappingRequest,
    UpdateMappingResponse,
    UploadedFileSummary,
)


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
