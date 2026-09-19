# Marine Fleet Control Center

A progressive fleet-control prototype for importing vessel telemetry, storing normalized data in SQLite, and serving it through an API.

## Version 0.5.0

This milestone provides the Python backend foundation plus deterministic CSV inspection:

- FastAPI application with a health endpoint.
- SQLite database initialized automatically at startup.
- SQLAlchemy models for vessels, samples, vessel metrics, and import sessions.
- CSV header, delimiter, numeric, timestamp, and navigation-field detection.
- Conversion of explicitly identified `knots`, `km/h`, `mph`, and `m/s` speeds to knots.
- Validation that rejects missing or unsupported speed units without guessing.
- Staged, temporary multi-file CSV uploads with preview, mapping, and cancellation APIs.
- Validation and transactional `CREATE`/`REPLACE` commits that join GPS and motion rows by timestamp.
- Immutable startup-hydrated cache with per-sample missing-telemetry markers.
- Tests, Ruff linting, and mypy configuration.

## Run the backend

Requirements: Python 3.12 or newer.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for the interactive API documentation.

## Verify

```bash
cd backend
pytest
ruff check .
mypy app
```

The development database defaults to `backend/data/fleet.db`. Set `DATABASE_URL` to use another SQLite database, for example:

```bash
DATABASE_URL=sqlite:///./data/local-fleet.db uvicorn app.main:app
```

## Import API

`POST /api/imports` accepts one or more multipart `files` fields. Use the returned session ID to call `GET /api/imports/{session_id}/preview`, update mappings with `PUT /api/imports/{session_id}/mapping`, or delete the staged upload with `DELETE /api/imports/{session_id}`. These endpoints do not write vessel telemetry data.

After preview and mapping, call `POST /api/imports/{session_id}/validate`. A successful validation enables `POST /api/imports/{session_id}/commit` with an `imo`, optional `name`, and explicit `CREATE` or `REPLACE` mode. Commit writes the vessel, normalized samples, and measured/estimated metric definitions in one SQLite transaction.

At startup, vessel data is hydrated into an immutable in-memory read cache. Each cached sample includes `missing_fields`, which identifies source telemetry not supplied for that timestamp. This is distinct from estimated metrics, whose definitions include `origin`, `formula`, `based_on`, and `warning` metadata.

RPM and fuel consumption are estimated only when a measured Speed Over Ground (SOG) value is available. The backend calculates `estimated_rpm = 4 * SOG_knots` and `estimated_fuel_tpd = 150 * (SOG_knots / 15)^3`; neither value is presented as measured telemetry.
