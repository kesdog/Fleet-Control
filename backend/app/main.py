from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.agents import router as agents_router
from app.api.health import router as health_router
from app.api.imports import router as imports_router
from app.api.vessels import router as vessels_router
from app.config import get_settings
from app.db.connection import create_database_engine, create_session_factory, initialize_database
from app.errors import http_exception_handler, request_validation_exception_handler
from app.services.agent_rate_limiter import AgentReportRateLimiter
from app.services.fleet_cache import FleetCacheManager

OPENAPI_TAGS = [
    {"name": "health", "description": "Application, SQLite, and cache status."},
    {"name": "agents", "description": "Read-only cache-backed vessel reports for AI agents."},
    {"name": "imports", "description": "Staged CSV inspection, validation, and commit workflow."},
    {"name": "vessels", "description": "Cache-backed fleet, telemetry, and visualization reads."},
]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.settings.ensure_logs_directory()
    engine = create_database_engine(app.state.settings)
    initialize_database(engine)
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)
    app.state.fleet_cache = FleetCacheManager()
    app.state.fleet_cache.hydrate(app.state.session_factory)
    app.state.agent_report_rate_limiter = AgentReportRateLimiter()
    yield
    engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Marine Fleet Control Center",
        version="0.21.0",
        description=(
            "Import normalized vessel telemetry and serve immutable cache-backed fleet data."
        ),
        openapi_tags=OPENAPI_TAGS,
        lifespan=lifespan,
    )
    app.state.settings = get_settings()
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, request_validation_exception_handler)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=app.state.settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type"],
    )
    app.include_router(health_router, prefix="/api")
    app.include_router(agents_router, prefix="/api")
    app.include_router(imports_router, prefix="/api")
    app.include_router(vessels_router, prefix="/api")
    return app


app = create_app()
