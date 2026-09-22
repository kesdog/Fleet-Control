# Marine Fleet Control Center

A progressive fleet-control prototype for importing vessel telemetry, storing normalized data in SQLite, and serving it through an API.

## Version 0.21.1

This patch release keeps the v0.21.0 enrichment, voyage-performance, and agent-report capabilities and adds a deployable Docker image. A multi-stage `Dockerfile` builds the React frontend and packages it with the FastAPI backend into a single production image, `compose.yaml` runs the full application with a persistent `fleet-data` volume, a runtime-only backend requirements set keeps the image lean, and FastAPI serves the built SPA with history fallback while leaving `/api` routes untouched:

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
- Deeper-zoom raster sub-tile fetching so the basemap stays sharp instead of blurring as the camera zooms in.
- Zoom-gated overlay of 400 major commercial ports with hover tooltips for geographic context.
- Browser-based CSV upload, validation, and commit flow for telemetry data.
- Point-only vessel mapping: vessel positions come from returned telemetry observations, while server-provided trajectory segments remain the route source.
- Date-filtered telemetry replay linked to the map and telemetry-frame table.
- Apache ECharts telemetry trends with metric unit, measured/estimated provenance, tooltips, and a zoomable time range.
- A collapsible fleet manifest to keep the map workspace focused during review.
- Synchronized replay cursors in every chart, a current-frame navigation readout, and a metric picker that adds charts below the final trend.
- Modal workspace settings with map-scale units and the single backend API status display.
- Focused staged import view covering upload, detection preview, column/unit mapping, validation, review, cancellation, and explicit vessel replacement.
- Native map-only fullscreen with fullscreen-only wheel zoom lock and application success/error notifications.
- Configurable 2-12 replay frames per day with cadence-aware sampling and a guaranteed final telemetry frame.
- Complete English/French interface with persisted language selection and no untranslated user-facing strings.
- Keyboard-accessible vessel, date, metric, language, and replay playback controls with visible focus states and clear empty/loading/error messaging.
- Open-Meteo historical weather and marine enrichment attached to each vessel sample at commit time.
- A separate `environmental_samples` table storing wind, wave, ocean-current, and Weather Factor values with `environmental` provenance.
- Current-corrected Speed Through Water (`SOG − current along heading`) with an explicit `sog_fallback` provenance when current data is unavailable.
- STW-aware RPM (`4 × STW`) and fuel rate (`150 × (STW / 15)³ tonnes/day`) calculations moved into `performance_service.py`.
- Voyage fuel, cost, distance, and efficiency aggregation via `GET /api/vessels/{imo}/performance`.
- Gap-aware fuel integration with observed/unobserved duration and coverage reporting.
- Per-sample environmental series via `GET /api/vessels/{imo}/environment`.
- A compact Voyage Performance panel and environmental metrics in the telemetry-frame table.
- Focused dashboard hooks for fleet selection, telemetry queries, replay, and notifications.
- Separated raster, route, control, replay, and legend map components with metric-shaded routes.
- Distinct upload, detection, mapping, validation, and review import-stage components.
- Read-only `GET /api/agents/docs` agent documentation and `GET /api/agents/report` per-vessel reports backed by the immutable fleet cache, with a process-wide 15-requests-per-minute limit.
- Frontend component tests for vessel details, import telemetry, and fleet selection, plus an accessible label on the CSV upload input.
- Standardized `{code, message}` API error envelope for operational and request-validation failures, with a centralized frontend `api/errors.ts` converter and translated error messages.
- Metadata-only import audit logging plus temporary-upload cleanup after successful commits and cancellations.
- A documented, non-implemented waypoint-editing proposal in `docs/waypoint-editing.md`.
- A single deployable Docker image that bundles the built React frontend with the FastAPI backend and serves it with a persistent `fleet-data` Docker volume.

## Run with Docker

Build the single production image and start the full application:

```bash
docker compose up --build
```

Open `http://127.0.0.1:8000`. The container serves the React application and proxies no browser requests: its relative `/api` calls are handled by the bundled FastAPI server. SQLite data, staged imports, and logs persist in the `fleet-data` Docker volume.

To build the image separately, run:

```bash
docker build -t marine-fleet-control-center .
docker compose up
```

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
- `frontend/src/components/map/`: raster map lifecycle, route rendering, controls, replay controls, and legends.
- `frontend/src/components/import/`: presentation components for each import wizard stage.
- `frontend/src/hooks/`: dashboard selection, query, replay, and notification state.
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
.venv/bin/pytest
.venv/bin/ruff check .
.venv/bin/mypy app
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

RPM and fuel consumption are estimated from Speed Through Water. When ocean-current data is available, the backend projects the current onto the vessel heading and derives `stw = SOG − current along heading`; otherwise STW falls back to SOG and the metric provenance records the fallback. The estimates are `estimated_rpm = 4 × STW` and `estimated_fuel_tpd = 150 × (STW / 15)³`; neither value is presented as measured telemetry. Fuel cost uses a configurable `FUEL_PRICE_PER_TONNE` and `FUEL_CURRENCY` (default `1000` `EUR`).

## Read API

The cache-backed read API provides `GET /api/vessels`, `GET /api/vessels/{imo}`, `GET /api/vessels/{imo}/metrics`, and `GET /api/vessels/{imo}/telemetry`. Telemetry accepts optional ISO 8601 `start` and `end` query parameters. Read responses perform no SQLite queries and expose `missing_fields` independently from estimated metrics.

Visualization clients can use `GET /api/vessels/{imo}/trajectory` and `GET /api/vessels/{imo}/series/{metric}`. Both accept `start`, `end`, and optional `max_points` parameters. Trajectories split automatically at International Date Line crossings, while series and trajectory downsampling deterministically preserve first and last points.

Environmental enrichment uses `GET /api/vessels/{imo}/environment` for per-sample wind, wave, and current values and `GET /api/vessels/{imo}/performance` for aggregated voyage distance, fuel, cost, efficiency, and telemetry coverage. Enrichment is fetched from Open-Meteo at import commit time and never fails the import: when the provider is unavailable, environmental fields stay null and fuel falls back to the SOG-based estimate. A 0.1-degree batching grid retains useful ocean-current resolution while controlling request volume. Configure the endpoints and fuel assumptions through environment variables:

```bash
OPEN_METEO_WEATHER_URL=https://archive-api.open-meteo.com/v1/archive
OPEN_METEO_MARINE_URL=https://marine-api.open-meteo.com/v1/marine
FUEL_REFERENCE_SPEED_KNOTS=15
FUEL_REFERENCE_RATE_TPD=150
FUEL_PRICE_PER_TONNE=1000
FUEL_CURRENCY=EUR
ENVIRONMENT_SPATIAL_GRID_DEGREES=0.1
FUEL_INTEGRATION_MAX_GAP_MINUTES=60
```

## Documentation

- [Architecture](docs/architecture.md)
- [Assumptions](docs/assumptions.md)
- [API reference and curl examples](docs/api.md)
