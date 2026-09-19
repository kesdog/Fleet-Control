# Fleet Control Center Frontend

The v0.10.0 frontend is a React + TypeScript Vite application for the Marine Fleet Control Center.

It provides the shared desktop shell, typed backend clients, TanStack Query server-state wiring, vessel and metric controls, metadata provenance, a root error boundary, Tailwind CSS setup, and English/French UI selection persisted in browser storage.

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
- `src/components/FleetControls.tsx`: controlled vessel, date-range, and metric inputs. Pass its values to later map and chart views.
- `src/components/VesselDetails.tsx`: backend-provided vessel and metric provenance display, including estimated-value metadata.
- `src/components/LanguageSwitcher.tsx`: compact accessible EN/FR control; translations are initialized in `src/i18n.ts`.
- `src/components/ErrorBoundary.tsx`: root render-error fallback, mounted in `src/main.tsx`.

## Verify

```bash
npm run build
npm run lint
```
