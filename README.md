# Marine Fleet Control Center

A progressive fleet-control prototype for importing vessel telemetry, storing normalized data in SQLite, and serving it through an API.

## Version 0.14.0

This milestone provides the Python backend, deterministic CSV inspection, and an operations frontend for map, replay, and chart telemetry review:

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
- Vessel, metric, and available date-range controls backed by cache-read APIs.
- Vessel metadata and measured/estimated metric details with backend-provided provenance.
- Lightweight OpenStreetMap raster basemap with selected-vessel telemetry rendering and reset/zoom controls.
- Browser-based CSV upload, validation, and commit flow for telemetry data.
- Point-only vessel mapping: vessel positions come from returned telemetry observations, while server-provided trajectory segments remain the route source.
- Date-filtered telemetry replay linked to the map and telemetry-frame table.
- Apache ECharts telemetry trends with metric unit, measured/estimated provenance, tooltips, and a zoomable time range.
- A collapsible fleet manifest to keep the map workspace focused during review.
- Synchronized replay cursors in every chart, a current-frame navigation readout, and a metric picker that adds charts below the final trend.
- Modal workspace settings with map-scale units and the single backend API status display.

## Run the frontend

Start the backend first, then in another terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://127.0.0.1:5173` and proxies `/api` requests to the FastAPI server at `http://127.0.0.1:8000`.

The frontend uses native OpenStreetMap raster tiles with a canvas telemetry layer for responsive cartography without a second hidden rendering engine. It sends the selected vessel, metric, and a clamped date range to the telemetry endpoints, renders observation-backed vessel points, and preserves the map's authoritative camera and pan behavior. The same vessel, metric, and range drive the ECharts series endpoint and telemetry replay.

Frontend structure:

- `frontend/src/api/client.ts`: typed API entry points.
- `frontend/src/components/FleetControls.tsx`: shared vessel, date, and metric filters.
- `frontend/src/components/VesselMap.tsx`: raster map lifecycle, canvas telemetry rendering, and map controls.
- `frontend/src/components/TelemetryChart.tsx`: ECharts time-series view with provenance, range controls, and the shared replay mark line.
- `frontend/src/components/VesselDetails.tsx`: backend-provided vessel and metric provenance.
- `frontend/src/i18n.ts`: English/French resources and persisted language selection.

In v0.14, replay always selects recorded frames (never generated positions). The active-vessel frame summary reports its recorded position, SOG, heading/course, backend-provided estimated RPM, and fuel rate. The map camera/grid/pan implementation remains independent of replay and is preserved while frames advance.

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

```bash
cd frontend
npm run test
npm run build
npm run lint
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
