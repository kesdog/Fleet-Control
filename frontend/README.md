# Fleet Control Center Frontend

The v0.12.0 frontend is a React + TypeScript Vite application for the Marine Fleet Control Center.

It provides the shared desktop shell, typed backend clients, TanStack Query server-state wiring, browser CSV import and validation, fleet and telemetry-frame views, and an interactive OSM world map with date-filtered routes and vessel-position rendering.

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
