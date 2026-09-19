# Marine Fleet Control Center

A progressive fleet-control prototype for importing vessel telemetry, storing normalized data in SQLite, and serving it through an API.

## Version 0.9.0

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
- Cache-backed vessel, telemetry, trajectory, and series visualization APIs.
- Release documentation in [architecture](docs/architecture.md), [assumptions](docs/assumptions.md), and [API reference](docs/api.md).
- Tests, Ruff linting, and mypy configuration.
- React + TypeScript frontend foundation in `frontend/`.
- Typed API health client, TanStack Query setup, and non-blocking API status display.
- English/French UI switching persisted in localStorage.
- Vite development proxy for the backend API and a desktop-first operations shell.

## Run the frontend

Start the backend first, then in another terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://127.0.0.1:5173` and proxies `/api` requests to the FastAPI server at `http://127.0.0.1:8000`. Run `npm run build` from `frontend/` to verify the production build.

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

The backend permits the planned Vite development origin, `http://localhost:5173`. Override the JSON list through `CORS_ORIGINS` when deploying another frontend origin.

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

## Read API

The cache-backed read API provides `GET /api/vessels`, `GET /api/vessels/{imo}`, `GET /api/vessels/{imo}/metrics`, and `GET /api/vessels/{imo}/telemetry`. Telemetry accepts optional ISO 8601 `start` and `end` query parameters. Read responses perform no SQLite queries and expose `missing_fields` independently from estimated metrics.

Visualization clients can use `GET /api/vessels/{imo}/trajectory` and `GET /api/vessels/{imo}/series/{metric}`. Both accept `start`, `end`, and optional `max_points` parameters. Trajectories split automatically at International Date Line crossings, while series and trajectory downsampling deterministically preserve first and last points.

## Documentation

- [Architecture](docs/architecture.md)
- [Assumptions](docs/assumptions.md)
- [API reference and curl examples](docs/api.md)
