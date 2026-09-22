# Backend

The v0.8.0 FastAPI backend initializes its SQLite schema during application startup and includes a reusable CSV inspection layer. Source speed units are always explicit and normalize to knots; missing or unsupported units fail validation. The staged import API supports preview, mapping updates, validation, and transactional vessel commits. GPS and motion files are joined by timestamp, and derived RPM/fuel values are stored as estimated metrics. SQLite data is hydrated into immutable cache snapshots; each sample lists source telemetry that was missing instead of treating it as estimated data. Cache-backed vessel, metric, telemetry, trajectory, and series endpoints expose frontend-ready normalized contracts without SQLite reads. Trajectories split at dateline crossings and visualization responses support endpoint-preserving downsampling.

`GET /api/agents/docs` provides machine-readable agent documentation and request examples. `GET /api/agents/report` serves compact, read-only, cache-backed reports for one or more repeated `imo` query parameters. It returns app context, vessel performance, metric availability, and aggregate data quality without raw telemetry records. The unauthenticated endpoint is process-wide limited to 15 requests per minute; per-user bucket limiting is planned once authentication exists.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

`GET /api/health` confirms the application and database are available.

Run checks with `.venv/bin/pytest`, `.venv/bin/ruff check .`, and `.venv/bin/mypy app`.

Project-level architecture, assumptions, and endpoint documentation live in `../docs/`.
