from collections.abc import Iterator
from typing import Any

from sqlalchemy import Engine, create_engine, event, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.db.models import Base


def create_database_engine(settings: Settings) -> Engine:
    """Create an engine and apply SQLite-only connection safety settings."""
    settings.ensure_database_directory()
    connect_args = (
        {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
    )
    engine = create_engine(
        settings.database_url,
        connect_args=connect_args,
    )
    if settings.database_url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _enable_sqlite_foreign_keys(
            dbapi_connection: Any, _connection_record: Any
        ) -> None:
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("PRAGMA foreign_keys=ON")
            finally:
                cursor.close()
    return engine


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def initialize_database(engine: Engine) -> None:
    """Create the schema and apply lightweight upgrades for existing local databases."""
    Base.metadata.create_all(bind=engine)
    # v0.5 adds estimate dependencies without requiring a full migration framework yet.
    metric_columns = {column["name"] for column in inspect(engine).get_columns("vessel_metrics")}
    if "based_on" not in metric_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE vessel_metrics ADD COLUMN based_on JSON"))
    import_columns = {column["name"] for column in inspect(engine).get_columns("import_sessions")}
    missing_columns = {
        "import_imo": "VARCHAR(32)",
        "enrichment_days_completed": "INTEGER NOT NULL DEFAULT 0",
        "enrichment_days_total": "INTEGER NOT NULL DEFAULT 0",
    }
    with engine.begin() as connection:
        for name, definition in missing_columns.items():
            if name not in import_columns:
                connection.execute(
                    text(f"ALTER TABLE import_sessions ADD COLUMN {name} {definition}")
                )
    vessel_columns = {column["name"] for column in inspect(engine).get_columns("vessels")}
    if "enrichment_generation" not in vessel_columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE vessels ADD COLUMN enrichment_generation VARCHAR(36)")
            )


def check_database_connection(engine: Engine) -> bool:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        return False
    return True


def get_session(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    with session_factory() as session:
        yield session
