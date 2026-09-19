from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.health import router as health_router
from app.api.imports import router as imports_router
from app.api.vessels import router as vessels_router
from app.config import get_settings
from app.db.connection import create_database_engine, create_session_factory, initialize_database
from app.services.fleet_cache import FleetCacheManager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    engine = create_database_engine(app.state.settings)
    initialize_database(engine)
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)
    app.state.fleet_cache = FleetCacheManager()
    app.state.fleet_cache.hydrate(app.state.session_factory)
    yield
    engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Marine Fleet Control Center",
        version="0.7.0",
        lifespan=lifespan,
    )
    app.state.settings = get_settings()
    app.include_router(health_router, prefix="/api")
    app.include_router(imports_router, prefix="/api")
    app.include_router(vessels_router, prefix="/api")
    return app


app = create_app()
