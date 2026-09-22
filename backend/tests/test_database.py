import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app.db.connection import create_database_engine, initialize_database


def test_schema_initializes_independently(settings) -> None:
    engine = create_database_engine(settings)
    try:
        initialize_database(engine)
        assert set(inspect(engine).get_table_names()) == {
            "environmental_samples",
            "import_sessions",
            "samples",
            "vessel_metrics",
            "vessels",
        }
    finally:
        engine.dispose()


def test_sqlite_enforces_foreign_keys(settings) -> None:
    engine = create_database_engine(settings)
    try:
        initialize_database(engine)
        with pytest.raises(IntegrityError):
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "INSERT INTO environmental_samples (sample_id, provider) "
                        "VALUES (999, 'open-meteo')"
                    )
                )
    finally:
        engine.dispose()
