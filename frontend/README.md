# Fleet Control Center Frontend

The v0.13.0 frontend is a React + TypeScript Vite application for the Marine Fleet Control Center.

It provides typed backend clients and TanStack Query wiring for CSV import, a collapsible fleet roster, telemetry replay, an interactive OSM map, and Apache ECharts time-series analysis. The selected vessel, metric, and date range update map routes, observation-backed vessel points, replay frames, the telemetry table, and chart together. Date inputs are converted to full calendar-day bounds and clamped to the vessel's available API range before requesting data.

## Run locally

Start the FastAPI backend from the repository root:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

In a second terminal, start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Vite serves the frontend on `http://127.0.0.1:5173` and proxies `/api` requests to `http://127.0.0.1:8000`. The API status panel polls `GET /api/health` every 30 seconds without blocking the rest of the interface.

## Structure

- `src/api/client.ts`: typed API entry points. Add backend calls here before consuming them in views.
- `src/components/ApiStatus.tsx`: reusable TanStack Query health indicator for shared shells or future settings views.
- `src/components/FleetManifest.tsx`: selectable vessel roster that determines the active telemetry view.
- `src/components/TelemetryFrames.tsx`: telemetry-frame table with metric provenance details and map-frame selection.
- `src/components/TelemetryChart.tsx`: accessible ECharts line trend with metric unit, measured/estimated provenance, tooltip, data zoom, and loading/error/empty states.
- `src/components/ImportTelemetry.tsx`: browser CSV upload, validation, and commit flow.
- `src/components/VesselMap.tsx`: raster world map with interactive panning, zooming, route, and vessel overlays.
- `src/components/LanguageSwitcher.tsx`: compact accessible EN/FR control; translations are initialized in `src/i18n.ts`.
- `src/components/ErrorBoundary.tsx`: root render-error fallback, mounted in `src/main.tsx`.

## Verify

```bash
npm run test
npm run build
npm run lint
```
