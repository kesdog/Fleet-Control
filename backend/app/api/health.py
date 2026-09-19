from fastapi import APIRouter, Request, status
from pydantic import BaseModel

from app.db.connection import check_database_connection

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    database: str
    cache: str


@router.get("/health", response_model=HealthResponse, status_code=status.HTTP_200_OK)
def health(request: Request) -> HealthResponse:
    database_connected = check_database_connection(request.app.state.engine)
    return HealthResponse(
        status="ok" if database_connected else "degraded",
        database="connected" if database_connected else "unavailable",
        cache="initialized" if hasattr(request.app.state, "fleet_cache") else "not_initialized",
    )
