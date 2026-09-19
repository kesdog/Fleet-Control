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

## Visualization API

`GET /api/vessels/{imo}/trajectory?metric=sog&max_points=2000` returns map-ready segments. The server splits International Date Line crossings.

`GET /api/vessels/{imo}/series/rpm?max_points=2000` returns chart-ready timestamp/value points and metric metadata.

The visualization endpoints accept optional `start`, `end`, and `max_points` parameters. `max_points` must be at least two when provided, and downsampling always preserves the first and last point.

## Status Codes

- `200`: successful read, preview, validation, mapping, or commit.
- `201`: import session created.
- `204`: import session deleted.
- `400`: invalid date-window order.
- `404`: unknown vessel, metric, or import session.
- `409`: import commit attempted before validation, or `CREATE` conflicts with an existing IMO.
- `416`: requested telemetry window is outside the available range.
- `422`: invalid request, CSV, mapping, or validation input.
