from collections.abc import Iterator
from typing import Annotated, cast

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile, status
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.schemas.imports import (
    CommitImportRequest,
    CommitImportResponse,
    ImportPreviewResponse,
    ImportProgressResponse,
    ImportValidationResponse,
    StartImportResponse,
    UpdateMappingRequest,
    UpdateMappingResponse,
)
from app.services.fleet_cache import FleetCacheManager
from app.services.import_service import (
    cancel_import_session,
    commit_import_session,
    create_import_session,
    import_progress,
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


def get_fleet_cache(request: Request) -> FleetCacheManager:
    return cast(FleetCacheManager, request.app.state.fleet_cache)


def get_session_factory(request: Request) -> sessionmaker[Session]:
    return cast(sessionmaker[Session], request.app.state.session_factory)


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
    fleet_cache: Annotated[FleetCacheManager, Depends(get_fleet_cache)],
    session_factory: Annotated[sessionmaker[Session], Depends(get_session_factory)],
) -> CommitImportResponse:
    return commit_import_session(
        session,
        settings.imports_directory,
        session_id,
        payload,
        fleet_cache,
        settings,
        session_factory,
    )


@router.get("/{session_id}/progress", response_model=ImportProgressResponse)
def get_import_progress(
    session_id: str,
    session: Annotated[Session, Depends(get_database_session)],
) -> ImportProgressResponse:
    return import_progress(session, session_id)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_import(
    session_id: str,
    session: Annotated[Session, Depends(get_database_session)],
    settings: Annotated[Settings, Depends(get_runtime_settings)],
) -> Response:
    cancel_import_session(session, settings.imports_directory, session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
