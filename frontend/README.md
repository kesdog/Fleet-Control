# Fleet Control Center Frontend

The v0.15.0 frontend is a React + TypeScript Vite application for the Marine Fleet Control Center.

It provides typed backend clients and TanStack Query wiring for a staged CSV import wizard, a collapsible fleet roster, telemetry replay, an interactive OSM map, and Apache ECharts time-series analysis. Import stages upload, preview detection, column/unit mapping, validation, review, and explicit create/replace commit. Closing an uncommitted wizard removes its staged backend session. The selected vessel, metric, and date range update map routes, observation-backed vessel points, replay frames, the telemetry table, and chart together. Replay frame count is configurable from 2 to 12 per day in Settings; source observations are sampled near evenly spaced slots, maintain the derived minimum spacing, and always finish on the selected range's final telemetry record. The map has native browser fullscreen mode; only in fullscreen does mouse-wheel input zoom the map and prevent document scrolling.

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

Vite serves the frontend on `http://127.0.0.1:5173` and proxies `/api` requests to `http://127.0.0.1:8000`. Settings is a modal screen containing replay speed, km/mi/nm map-scale selection, and the single API health status panel, which polls `GET /api/health` every 30 seconds without blocking the rest of the interface.

## Structure

- `src/api/client.ts`: typed API entry points. Add backend calls here before consuming them in views.
- `src/components/ApiStatus.tsx`: reusable TanStack Query health indicator for shared shells or future settings views.
- `src/components/FleetManifest.tsx`: selectable vessel roster that determines the active telemetry view.
- `src/components/TelemetryFrames.tsx`: telemetry-frame table with metric provenance details and map-frame selection.
- `src/components/TelemetryChart.tsx`: accessible ECharts line trend with metric unit, measured/estimated provenance, tooltip, data zoom, and loading/error/empty states.
- `src/components/ImportTelemetry.tsx`: focused staged CSV upload, preview, mapping, validation, review, cancellation, and explicit replacement flow in English and French.
- `src/components/VesselMap.tsx`: raster world map with interactive panning, zooming, route, and vessel overlays.
- `src/components/LanguageSwitcher.tsx`: compact accessible EN/FR control; translations are initialized in `src/i18n.ts`.
- `src/components/ErrorBoundary.tsx`: root render-error fallback, mounted in `src/main.tsx`.

## Verify

```bash
npm run test
npm run build
npm run lint
```
