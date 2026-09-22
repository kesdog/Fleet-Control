# Waypoint Editing Proposal

## Scope

Waypoint editing creates a user-managed planned trajectory. It never changes imported GPS telemetry, environmental observations, derived estimates, or the read-only historical trajectory API. Recorded and planned routes are rendered as distinct layers.

## Data Model

Add a `planned_routes` table with `id`, `vessel_id`, `name`, `revision`, `created_at`, and `updated_at`. A route belongs to a vessel but is independent of an import generation, so users can compare a plan with later observed journeys.

Add a `route_waypoints` table with `id`, `route_id`, `position`, `latitude_deg`, `longitude_deg`, optional `eta`, and timestamps. `position` is an integer ordering key with a unique `(route_id, position)` constraint. Coordinates are validated to legal latitude/longitude ranges and the route must contain at least two waypoints.

Every save increments `planned_routes.revision`. The response returns the new revision and the recomputed adjacent legs, including great-circle distance and optional ETA/duration values. The revision makes conflicts explicit without duplicating a full route on every drag; an audit/history table can be introduced later if durable undo is required.

## Backend Contract

Provide `GET /api/vessels/{imo}/planned-routes`, `POST /api/vessels/{imo}/planned-routes`, `GET /api/planned-routes/{route_id}`, and `DELETE /api/planned-routes/{route_id}` for route lifecycle management.

Use `PATCH /api/planned-routes/{route_id}/waypoints/{waypoint_id}` for a drag commit. Its payload contains latitude, longitude, and the client's expected `revision`. The service updates only the selected waypoint, validates it, recomputes the previous-to-current and current-to-next legs, increments the revision, and returns the route. A stale revision returns `409 route_revision_conflict` with the current route so the client can reload rather than silently overwrite another edit.

An optional batch endpoint can reorder, insert, or delete waypoints in one revision-checked operation. All mutations run in one transaction and refresh only the planned-route cache entry if the application later caches plans.

## Frontend Interaction

Render imported trajectory data as the existing read-only route layer. Render a selected planned route as a visually distinct dashed line with numbered waypoint handles. Pointer drag updates only local preview state and redraws the two affected legs immediately; the backend mutation occurs on drop, not on every pointer move.

On a successful save, replace local preview state with the server route and revision. On failure, restore the last confirmed route and announce the error. For a `409`, show a reload-and-review action rather than retrying against an unknown plan.

Each handle has an accessible name such as `Waypoint 3`, keyboard focus, and an alternative edit form with latitude/longitude inputs and move-before/move-after actions. Provide save/cancel controls, a clear unsaved-changes indicator, and a legend explaining that planned waypoints are not recorded vessel positions. Dragging must remain usable on touch devices through a sufficiently large handle and no reliance on hover-only controls.

## Recalculation And Provenance

Changing a waypoint recalculates only the adjacent planned legs for immediate feedback. Whole-route totals are then summed from stored legs. If a future scenario calculation uses weather or fuel estimates, it must be labelled as a forecast using planned coordinates and times, not as imported telemetry or observed environmental data.
