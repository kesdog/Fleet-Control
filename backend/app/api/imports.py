from collections.abc import Iterator
from typing import Annotated, cast

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.config import Settings
from app.schemas.imports import (
    CommitImportRequest,
    CommitImportResponse,
    ImportPreviewResponse,
    ImportValidationResponse,
    StartImportResponse,
    UpdateMappingRequest,
    UpdateMappingResponse,
)
from app.services.import_service import (
    cancel_import_session,
    commit_import_session,
    create_import_session,
    preview_import_session,
    update_mapping,
    validate_import_session,
)

router = APIRouter(prefix="/imports", tags=["imports"])


def get_database_session(request: Request) -> Iterator[Session]:
    # Dependencies create a short-lived session for each HTTP request.
    with request.app.state.session_factory() as session:
        yield session


def get_runtime_settings(request: Request) -> Settings:
    # Read settings from app state so test applications can use isolated directories.
    return cast(Settings, request.app.state.settings)


@router.post("", response_model=StartImportResponse, status_code=status.HTTP_201_CREATED)
async def start_import(
    files: Annotated[list[UploadFile], File(description="One or more CSV telemetry files.")],
    session: Annotated[Session, Depends(get_database_session)],
    settings: Annotated[Settings, Depends(get_runtime_settings)],
) -> StartImportResponse:
    settings.ensure_imports_directory()
    return await create_import_session(session, settings.imports_directory, files)


@router.get("/{session_id}/preview", response_model=ImportPreviewResponse)
def preview_import(
    session_id: str,
    session: Annotated[Session, Depends(get_database_session)],
    settings: Annotated[Settings, Depends(get_runtime_settings)],
) -> ImportPreviewResponse:
    return preview_import_session(session, settings.imports_directory, session_id)


@router.put("/{session_id}/mapping", response_model=UpdateMappingResponse)
def set_mapping(
    session_id: str,
    payload: UpdateMappingRequest,
    session: Annotated[Session, Depends(get_database_session)],
) -> UpdateMappingResponse:
    return update_mapping(session, session_id, payload)


@router.post("/{session_id}/validate", response_model=ImportValidationResponse)
def validate_import(
    session_id: str,
    session: Annotated[Session, Depends(get_database_session)],
    settings: Annotated[Settings, Depends(get_runtime_settings)],
) -> ImportValidationResponse:
    return validate_import_session(session, settings.imports_directory, session_id)


@router.post("/{session_id}/commit", response_model=CommitImportResponse)
def commit_import(
    session_id: str,
    payload: CommitImportRequest,
    session: Annotated[Session, Depends(get_database_session)],
    settings: Annotated[Settings, Depends(get_runtime_settings)],
) -> CommitImportResponse:
    return commit_import_session(session, settings.imports_directory, session_id, payload)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_import(
    session_id: str,
    session: Annotated[Session, Depends(get_database_session)],
    settings: Annotated[Settings, Depends(get_runtime_settings)],
) -> Response:
    cancel_import_session(session, settings.imports_directory, session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
