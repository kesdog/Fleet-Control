# API Reference

Base URL: `http://127.0.0.1:8000`

All application errors use a `detail` response field. Validation errors use FastAPI's standard list of field-level details.

The default allowed browser origin is `http://localhost:5173` for the planned Vite frontend. Configure another JSON origin list with `CORS_ORIGINS` for other environments.

## Health

`GET /api/health`

```json
{"status":"ok","database":"connected","cache":"initialized"}
```

## Import Workflow

`POST /api/imports` accepts one or more multipart form fields named `files`.

```bash
curl -F "files=@../input_data/IMO1_GPS.csv" -F "files=@../input_data/IMO1_MOTIONS.csv" \
  http://127.0.0.1:8000/api/imports
```

The response includes `session_id`, header/delimiter inspection, row counts, and warnings.

`GET /api/imports/{session_id}/preview` returns source columns, inferred mapping, units, sample rows, null counts, timestamp range, and fields needing confirmation.

`PUT /api/imports/{session_id}/mapping` stores source overrides:

```json
{
  "files": {
    "gps.csv": {
      "semantic_fields": {"Speed": "sog"},
      "unit_overrides": {"Speed": "kn"}
    }
  }
}
```

`POST /api/imports/{session_id}/validate` returns errors, warnings, accepted/rejected counts, normalized fields, and estimated metrics. It does not write telemetry.

`POST /api/imports/{session_id}/commit` writes a validated session:

```json
{"imo":"IMO1234567","name":"Example Vessel","mode":"CREATE"}
```

Use `mode: "REPLACE"` only to explicitly replace an existing vessel. `DELETE /api/imports/{session_id}` removes an unneeded staged session and files.

## Fleet Read API

`GET /api/vessels` lists imported vessels, sample counts, ranges, and metric keys.

`GET /api/vessels/{imo}` returns one vessel with full metric metadata.

`GET /api/vessels/{imo}/metrics` returns metric metadata. Estimated metrics include `origin: "estimated"`, `formula`, `based_on`, and `warning`.

`GET /api/vessels/{imo}/telemetry?start=2026-03-01T00:15:00&end=2026-03-02T00:15:00` returns normalized records. Each record includes `missing_fields`, separate from estimated fields.

## Agent Report API

`GET /api/agents/docs` returns JSON documentation for agent clients, including fleet-discovery and report examples. Use `GET /api/vessels` to discover current vessel IMOs and names before requesting a report. The repository's root `llms.txt` is a concise LLM-oriented guide that links to this endpoint and the OpenAPI contract.

`GET /api/agents/report?imo=IMO1&imo=IMO2&start=2026-03-01T00:15:00&end=2026-03-07T00:15:00` returns cache-backed, read-only vessel report summaries for AI agents. Repeat `imo` to request multiple vessels. At least one `imo` is required; omitted `start` or `end` defaults to that vessel's available telemetry boundary.

Each response includes an application description and one report per requested vessel. Reports contain metric metadata, selected-range sample counts, aggregate data-quality counts, and voyage-performance and weather totals. Raw telemetry records are intentionally excluded.

The endpoint has a process-wide limit of 15 requests per minute and returns `429` with a `Retry-After` header when exceeded. It will move to per-user bucket limiting when authentication is introduced.

## Visualization API

`GET /api/vessels/{imo}/trajectory?metric=sog&max_points=2000` returns map-ready segments. The server splits International Date Line crossings.

`GET /api/vessels/{imo}/series/rpm?max_points=2000` returns chart-ready timestamp/value points and metric metadata.

The visualization endpoints accept optional `start`, `end`, and `max_points` parameters. `max_points` must be at least two when provided, and downsampling always preserves the first and last point.

## Environmental And Performance API

`GET /api/vessels/{imo}/environment?start=2026-03-01T00:15:00&end=2026-03-02T00:15:00` returns per-sample wind, wave, and ocean-current values with a `missing` flag when weather data is unavailable.

`GET /api/vessels/{imo}/performance?start=2026-03-01T00:15:00&end=2026-03-07T00:15:00` returns aggregated voyage metrics:

```json
{
  "imo": "IMO1",
  "start": "2026-01-01T00:00:00Z",
  "end": "2026-01-07T00:00:00Z",
  "distance_nm": 1418.4,
  "fuel_tonnes": 482.8,
  "fuel_cost": 482800.0,
  "fuel_currency": "EUR",
  "fuel_efficiency_nm_per_tonne": 2.94,
  "fuel_consumption_t_per_100nm": 34.04,
  "fuel_cost_per_nm": 340.38,
  "observed_duration_seconds": 603900,
  "unobserved_duration_seconds": 7200,
  "coverage_percent": 98.82,
  "weather": {
    "mean_wave_height_m": 2.1,
    "max_wave_height_m": 4.7,
    "mean_weather_factor": 1.01
  },
  "weather_impact": {
    "adjusted_fuel_tonnes": 493.2,
    "adjusted_fuel_cost": 493200.0,
    "wind_percent": 1.4,
    "wave_percent": 0.8,
    "total_percent": 2.2,
    "model": "experimental_heuristic",
    "warning": "Experimental project heuristic: wind and wave penalties are not supplied by AI Universal and are not a validated vessel-resistance model."
  }
}
```

`fuel_tonnes` and `distance_nm` exclude telemetry intervals longer than the configured 60-minute maximum. `coverage_percent` is the integrated duration divided by all consecutive durations in the selected range. `weather_impact` is opt-in frontend output; its coefficients are explicitly experimental project assumptions, not an AI Universal supplied formula.

Environmental metrics (`stw`, `wind_speed`, `wave_height`, `wave_period`, `current_speed`, `weather_factor`, `fuel_tpd`, and others) are also available through the standard `/metrics`, `/series/{metric}`, and `/trajectory` endpoints.

## Status Codes

- `200`: successful read, preview, validation, mapping, or commit.
- `201`: import session created.
- `204`: import session deleted.
- `400`: invalid date-window order.
- `404`: unknown vessel, metric, or import session.
- `409`: import commit attempted before validation, or `CREATE` conflicts with an existing IMO.
- `416`: requested telemetry window is outside the available range.
- `422`: invalid request, CSV, mapping, or validation input.
- `429`: agent report rate limit exceeded.
