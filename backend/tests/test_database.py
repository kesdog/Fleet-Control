from sqlalchemy import inspect

from app.db.connection import create_database_engine, initialize_database


def test_schema_initializes_independently(settings) -> None:
    engine = create_database_engine(settings)
    try:
        initialize_database(engine)
        assert set(inspect(engine).get_table_names()) == {
            "import_sessions",
            "samples",
            "vessel_metrics",
            "vessels",
        }
    finally:
        engine.dispose()
