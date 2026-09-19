# Backend

The v0.6.0 FastAPI backend initializes its SQLite schema during application startup and includes a reusable CSV inspection layer. Source speed units are always explicit and normalize to knots; missing or unsupported units fail validation. The staged import API supports preview, mapping updates, validation, and transactional vessel commits. GPS and motion files are joined by timestamp, and derived RPM/fuel values are stored as estimated metrics. SQLite data is hydrated into immutable cache snapshots; each sample lists source telemetry that was missing instead of treating it as estimated data. Cache-backed vessel, metric, and telemetry endpoints expose frontend-ready normalized contracts without SQLite reads.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

`GET /api/health` confirms the application and database are available.

Run checks with `pytest`, `ruff check .`, and `mypy app`.
