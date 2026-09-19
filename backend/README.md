# Backend

The v0.3.0 FastAPI backend initializes its SQLite schema during application startup and includes a reusable CSV inspection layer. Source speed units are always explicit and normalize to knots; missing or unsupported units fail validation. The staged import API accepts temporary multi-file CSV uploads and supports preview, mapping updates, and cancellation without writing vessel telemetry.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

`GET /api/health` confirms the application and database are available.

Run checks with `pytest`, `ruff check .`, and `mypy app`.
