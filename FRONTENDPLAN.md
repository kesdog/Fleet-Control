# Marine Fleet Control Center — Frontend Implementation Plan

## Goal

Build a desktop-first React + TypeScript frontend for the Marine Fleet Control Center prototype.

The frontend should make the existing backend easy to inspect and use without duplicating backend responsibilities.

Primary priorities:

- Functional before decorative.
- Clear desktop layout.
- Simple, predictable interactions.
- Strong separation between data fetching, visualization, and UI state.
- English and French support from the beginning.
- MapLibre for geographic context.
- deck.gl for vessel paths and movement rendering.
- Apache ECharts for telemetry charts.
- shadcn/ui + Tailwind CSS for interface controls.
- No light/dark theme work during the initial frontend milestones.
- Mobile support is deferred to a final usability pass.

The frontend roadmap continues the repository version sequence:

```text
v0.9.0 → v0.16.0
```

Each milestone should be runnable and suitable for a Git tag / GitHub release.

---

## Frontend Stack

### Core

- React
- TypeScript
- Vite
- React Router
- TanStack Query
- react-i18next
- Tailwind CSS
- shadcn/ui

### Visualization

- MapLibre GL JS
- deck.gl
- Apache ECharts

### Testing

- Vitest
- React Testing Library
- Playwright for final interaction tests if time permits

---

## Frontend Responsibilities

The frontend should:

- Fetch normalized vessel data from the backend.
- Display available vessels and metrics.
- Render historical vessel trajectories.
- Render current/replayed vessel positions.
- Display telemetry charts.
- Drive time-range and playback controls.
- Present estimated-value metadata clearly.
- Provide the import wizard UI.
- Allow switching between English and French.

The frontend should not:

- Parse CSV files directly.
- Convert source units.
- Calculate RPM.
- Calculate fuel consumption.
- Decide whether a metric is estimated.
- Merge GPS and motion data.
- Query SQLite.
- Duplicate validation logic already owned by the backend.

---

## Initial Application Views

### Main Dashboard

Initial entry point:

```text
/
```

Purpose:

- Vessel selection.
- Date-range selection.
- Metric selection.
- Map rendering.
- Playback controls.
- Telemetry visualization.
- Vessel details and metric metadata.

### Import Wizard Focus View

The import wizard should use a focused full-page experience rather than a small modal.

Initial implementation can use internal application state to switch to the focused import view.

Later TODO:

```text
/import
```

This future route should be documented in the final project README.

### Future Route TODOs

These routes are intentionally not required for the first frontend implementation:

```text
/
/import
/about
```

Potential future route responsibilities:

```text
/       Fleet dashboard
/import Focused vessel import wizard
/about  Architecture / assumptions / project explanation
```

Route separation should be added only if it improves clarity and does not complicate the prototype.

---

## Internationalization

Use:

```text
react-i18next
```

Supported languages:

```text
English
French
```

Default:

```text
English
```

Persist language choice in:

```text
localStorage
```

Use simple flag buttons in the header:

```text
🇬🇧 English
🇫🇷 Français
```

The visual control should remain compact.

Recommended behavior:

```text
[🇬🇧] [🇫🇷]
```

Only the active language needs a subtle selected state.

Do not introduce locale-based URLs during the prototype.

Future TODO:

```text
/en/
/fr/
```

can be mentioned as a possible future improvement but should not be implemented unless required.

Translation namespaces should remain simple:

```text
common
dashboard
import
metrics
errors
```

Example structure:

```text
src/
└── i18n/
    ├── en/
    │   ├── common.json
    │   ├── dashboard.json
    │   └── import.json
    └── fr/
        ├── common.json
        ├── dashboard.json
        └── import.json
```

Avoid hard-coded user-facing strings inside components.

---

## State Management

Use the lightest viable approach.

Recommended:

```text
TanStack Query  → server state
React state     → local UI state
Context         → only for truly shared UI concerns
```

Do not introduce Redux unless a concrete need appears.

Examples:

TanStack Query:

```text
vessels
metrics
trajectory
telemetry series
import session status
```

React state:

```text
selected vessel
selected metric
selected time range
current replay timestamp
play/pause state
import wizard step
```

---

## Data Flow

Main dashboard:

```text
FastAPI
  ↓
TanStack Query
  ↓
typed API client
  ↓
view models
  ↓
┌──────────────┬──────────────┬──────────────┐
│ MapLibre     │ deck.gl      │ ECharts      │
│ basemap      │ paths/ships  │ telemetry    │
└──────────────┴──────────────┴──────────────┘
```

Import wizard:

```text
file upload
    ↓
POST /api/imports
    ↓
preview
    ↓
mapping correction
    ↓
validation
    ↓
commit
    ↓
refresh vessel list
```

---

## Desktop-First Layout

Initial target viewport:

```text
1280px and wider
```

The application should remain usable at laptop resolutions around:

```text
1366 × 768
```

Primary dashboard layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Header                                                       │
│ Fleet Control Center                     [🇬🇧] [🇫🇷] [Import] │
├──────────────────────────────────────────────────────────────┤
│ Controls                                                     │
│ Vessel | Date Range | Metric | Playback                      │
├───────────────────────────────────────┬──────────────────────┤
│                                       │                      │
│              MAP                      │   METRIC SUMMARY     │
│                                       │                      │
│                                       │   Vessel details     │
│                                       │   Current values     │
│                                       │   Metric metadata    │
│                                       │                      │
├───────────────────────────────────────┴──────────────────────┤
│ TELEMETRY CHART                                              │
└──────────────────────────────────────────────────────────────┘
```

The map should remain the visual focus.

Recommended approximate desktop allocation:

```text
Map area:            65–75% horizontal width
Information panel:   25–35%
Telemetry chart:     full width beneath map
```

---

## Vessel Visualization

### MapLibre

Responsibilities:

- Basemap.
- Zoom.
- Pan.
- Geographic context.
- Labels.
- Camera position.

Do not overload MapLibre with vessel animation logic if deck.gl handles it more cleanly.

### deck.gl

Responsibilities:

- Vessel trajectories.
- Per-metric path coloring.
- Animated/current vessel markers.
- Historical movement playback.

Likely layers:

```text
PathLayer
TripsLayer
IconLayer
```

Trajectory responses should use backend-provided dateline segmentation.

The frontend should not repair International Date Line crossings itself.

---

## Vessel Assets

Use simple SVG vessel assets.

Requirements:

- Top-down silhouette.
- Transparent background.
- Easy to recolor.
- Clear direction of travel.
- Rotatable according to vessel heading/course.
- Legible at small map sizes.

Initial vessel differentiation can use three visually distinct colors.

Avoid detailed ship illustrations in the first pass.

The purpose is readability, not realism.

---

## Metric Visualization

The selected metric affects:

- Trajectory color.
- Metric summary.
- Chart data.
- Tooltip values.

Examples:

```text
SOG
Estimated RPM
Estimated Fuel Consumption
Roll
Pitch
Yaw
```

Measured and estimated metrics must look different.

Example:

```text
RPM
58.4 rpm
[Estimated]
Based on SOG
```

The frontend should use backend metadata such as:

```text
origin
formula
based_on
warning
```

Do not infer estimated status from metric names.

---

## Playback

Playback should operate entirely against already-fetched trajectory data when possible.

Controls:

```text
Play / Pause
Timeline slider
Current timestamp
Playback speed
```

Initial playback speeds:

```text
1×
2×
4×
```

Possible later extension:

```text
8×
```

The selected replay time should synchronize:

- vessel marker position
- map tooltip/current values
- telemetry chart cursor
- summary panel

Playback does not need continuous server requests.

---

## Import Wizard UX

The import wizard should be a focused view.

Suggested stages:

```text
1. Upload
2. Detect
3. Map Columns
4. Validate
5. Review
6. Import
```

Progress display:

```text
Upload → Mapping → Validation → Review → Complete
```

The UI should clearly distinguish:

```text
errors
warnings
information
```

Examples:

Error:

```text
Speed unit is required.
```

Warning:

```text
Several speed values appear unusually high for knots.
```

Information:

```text
RPM will be estimated from SOG.
```

The user must explicitly confirm ambiguous unit mappings.

Estimated fields should be previewed before import.

---

## Error Handling

Global API errors should be human-readable.

Avoid exposing raw backend traces.

Examples:

```text
Unable to load vessel data.
The selected time range contains no records.
The import could not be validated.
```

Provide technical detail in expandable sections only where helpful.

The import wizard should preserve validation details from the backend.

---

## Loading States

Use simple loading placeholders.

Recommended:

- Skeleton for side panels.
- Small spinner for control actions.
- Map loading overlay.
- Disabled playback until data exists.

Avoid full-screen loaders after initial application startup.

---

# Version Roadmap

## v0.9.0 — Frontend Foundation

### Goal

Create the React + TypeScript application and connect it to the backend.

### Scope

Implement:

- Vite.
- React.
- TypeScript.
- Tailwind.
- shadcn/ui.
- TanStack Query.
- react-i18next.
- typed API client.
- global layout.
- basic error boundary.
- English/French switch with flag buttons.
- language persistence in localStorage.

Initial components:

```text
AppShell
Header
LanguageSwitcher
ApiStatus
```

### Acceptance

- Frontend starts from clean clone.
- Backend health endpoint can be queried.
- EN/FR switching works.
- Language persists after reload.
- No hard-coded main UI strings.

### GitHub tag

```text
v0.9.0
```

---

## v0.10.0 — Fleet Selection and Data Controls

### Goal

Expose fleet data through functional desktop controls.

### Scope

Implement:

- vessel selector
- metric selector
- date-range controls
- vessel metadata panel
- available metric metadata
- estimated-value badges
- loading/error states

Backend endpoints used:

```text
GET /api/vessels
GET /api/vessels/{imo}
GET /api/vessels/{imo}/metrics
```

### Acceptance

- All imported vessels can be selected.
- Available date range is shown.
- Metrics populate dynamically.
- Estimated metrics show their source and warning.
- Controls work in EN and FR.

### GitHub tag

```text
v0.10.0
```

---

## v0.11.0 — MapLibre Basemap

### Goal

Introduce the geographic view.

### Scope

Implement:

- MapLibre.
- Open map style.
- sensible initial world view.
- fit map to selected vessel trajectory bounds.
- map loading state.
- basic map controls.

Backend endpoint:

```text
GET /api/vessels/{imo}/trajectory
```

At this stage a basic route line may be shown before deck.gl takes over advanced trajectory rendering.

### Acceptance

- Selected vessel trajectory appears geographically correctly.
- Map bounds adjust to selected data.
- Dateline-split backend segments render correctly.
- Map remains usable on common desktop resolutions.

### GitHub tag

```text
v0.11.0
```

---

## v0.12.0 — deck.gl Trajectories and Vessel Assets

### Goal

Render polished vessel movement data over MapLibre.

### Scope

Implement:

- deck.gl integration.
- PathLayer / TripsLayer.
- SVG vessel icons.
- vessel heading/course rotation.
- multi-vessel support.
- metric-based trajectory coloring.
- trajectory tooltips.

Each vessel should remain visually distinguishable.

### Acceptance

- IMO1/IMO2/IMO3 can be displayed.
- Vessel marker direction changes correctly.
- Trajectory colors respond to selected metric.
- International Date Line trajectories do not draw across the globe.
- Interaction remains smooth.

### GitHub tag

```text
v0.12.0
```

---

## v0.13.0 — Telemetry Charts

### Goal

Add synchronized time-series analysis.

### Scope

Implement ECharts:

- metric chart.
- timestamp X-axis.
- selected metric Y-axis.
- tooltip.
- zoom/range handling where useful.
- measured/estimated indication.
- chart loading state.

Backend endpoint:

```text
GET /api/vessels/{imo}/series/{metric}
```

### Acceptance

- Chart updates when vessel changes.
- Chart updates when metric changes.
- Chart respects selected time range.
- Units are shown.
- Estimated metrics are explicitly identified.

### GitHub tag

```text
v0.13.0
```

---

## v0.14.0 — Historical Replay

### Goal

Allow the user to replay vessel movement over time.

### Scope

Implement:

- timeline slider.
- play/pause.
- 1× / 2× / 4× speed.
- current timestamp.
- synchronized vessel position.
- synchronized chart cursor.
- synchronized current-value panel.

Playback should use already-loaded data rather than repeatedly requesting the backend.

### Acceptance

- Playback moves vessels chronologically.
- Pause/resume works.
- Manual scrubbing works.
- Map and chart remain synchronized.
- Current data values correspond to replay timestamp.

### GitHub tag

```text
v0.14.0
```

---

## v0.15.0 — Import Wizard Focus View

### Goal

Expose the backend import workflow through a clear frontend process.

### Scope

Implement focused import view:

```text
Upload
Detect
Map Columns
Validate
Review
Commit
```

Backend endpoints:

```text
POST   /api/imports
GET    /api/imports/{id}/preview
PUT    /api/imports/{id}/mapping
POST   /api/imports/{id}/validate
POST   /api/imports/{id}/commit
DELETE /api/imports/{id}
```

Features:

- drag/drop or file picker.
- detected field preview.
- unit mapping.
- errors.
- warnings.
- estimated metric preview.
- final confirmation.
- success state.
- refresh fleet list after import.

### Acceptance

- A tester can add another compatible vessel without touching code.
- Ambiguous units require confirmation.
- Validation warnings are understandable.
- Successful import appears in fleet selector.
- Wizard works in English and French.

### GitHub tag

```text
v0.15.0
```

---

## v0.16.0 — Frontend Release Candidate

### Goal

Make the complete prototype presentable and robust enough for assessment.

### Scope

Functional polish:

- improve spacing.
- improve loading states.
- improve empty states.
- improve error messaging.
- keyboard accessibility basics.
- consistent tooltips.
- responsive desktop layout.
- first mobile usability pass.
- verify translations.
- remove development artifacts.
- fresh-clone test.
- production build test.

Mobile scope is limited to:

```text
usable
readable
presentable
```

It does not need feature parity with an intentionally redesigned mobile experience.

### Documentation

Update:

```text
README.md
docs/
```

Document:

- frontend stack.
- MapLibre role.
- deck.gl role.
- ECharts role.
- i18n behavior.
- import workflow.
- estimated-value presentation.
- playback behavior.

Add TODOs for future routing:

```text
/
/import
/about
```

Potential future localization routing:

```text
/en/
/fr/
```

Do not implement those solely for the assessment.

### Acceptance

- Dashboard is usable at common laptop/desktop resolutions.
- EN/FR UI is complete.
- Map, vessel movement, telemetry and playback work together.
- Import wizard works.
- No important user-facing strings remain untranslated.
- Mobile view is usable enough for demonstration.
- `npm run build` succeeds.
- Project can be run from clean documented setup.
- Git history clearly shows progression from backend through frontend.

### GitHub tag

```text
v0.16.0
```

This is the full prototype release candidate.

---

## Frontend Definition of Done

Frontend work is complete when:

- React + TypeScript application starts cleanly.
- Backend connectivity is handled through a typed API client.
- Fleet controls are functional.
- MapLibre displays geographic context.
- deck.gl displays vessel trajectories and movement.
- SVG vessels clearly show position and direction.
- ECharts displays telemetry.
- Replay synchronizes map and chart state.
- Estimated metrics are visibly identified.
- English and French are complete.
- Language switch uses clear flag controls.
- Language persists between sessions.
- Import wizard can add another vessel.
- Desktop layout is clean and practical.
- Final mobile pass makes the application usable at smaller widths.
- GitHub releases show the implementation progression.
- `v0.16.0` is suitable for interviewer review.
