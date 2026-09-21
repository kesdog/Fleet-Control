# Architecture

## Overview

Marine Fleet Control Center is a local-first telemetry import and read API prototype. Its processing path is:

```text
CSV upload -> inspection -> mapping -> validation -> normalization -> SQLite transaction -> cache refresh
```

The FastAPI routes are intentionally thin. CSV processing lives in `backend/app/importers`, import orchestration lives in `backend/app/services/import_service.py`, and request handlers read normalized telemetry from `FleetCache` snapshots.

## Persistence

SQLite is the persistent source of truth. It is appropriate for this prototype because the workload is local, small, deterministic, and easy to inspect in a repository. The core tables are:

- `vessels`: one row per IMO.
- `samples`: normalized timestamped GPS/telemetry samples.
- `environmental_samples`: one row per sample holding externally sourced wind, wave, ocean-current, Weather Factor, and derived current-projection/STW values.
- `vessel_metrics`: measured, estimated, and environmental metric definitions.
- `import_sessions`: temporary staged-import metadata.

The database schema initializes automatically. The current lightweight upgrade adds the `based_on` metadata column without introducing Alembic; a production deployment should replace this with managed migrations.

## Import Boundary

CSV files remain temporary until an import session validates successfully. The importer:

1. Detects headers, delimiter, navigation semantics, and source units.
2. Requires explicit confirmation for ambiguous speed units.
3. Converts speed to knots.
4. Merges GPS and motion files by timestamp, never row position.
5. Enriches each sample with Open-Meteo historical wind, wave, and ocean-current data (grouped by day and a 0.1° grid, matched to the nearest hour).
6. Derives Speed Through Water, RPM, and fuel estimates from SOG plus the current projection.
7. Writes vessel data, samples, environmental samples, metric definitions, and import status in one SQLite transaction.

Failed commits roll back database changes. A cache update happens only after the transaction succeeds.

Enrichment runs outside the write transaction so provider latency never holds the SQLite lock. A provider failure leaves environmental fields null and STW falls back to SOG; the telemetry import always succeeds. Environmental data is distinguished from vessel telemetry by its own table and its `environmental` metric origin.

## Cache Read Model

`FleetCacheManager` hydrates an immutable fleet snapshot at application startup. Each vessel entry contains ordered sample timestamps, immutable records, metric definitions, and a binary-search range index.

SQLite remains authoritative. Normal GET routes use the cache and execute no SQLite reads. A successful import refreshes only the committed vessel's cache entry; other immutable entries retain their object identity. Redis is unnecessary for this single-process prototype because the cache is local, derived, and fast to rebuild from SQLite.

## Missing And Estimated Data

Missing source telemetry is represented by each cache sample's `missing_fields` collection. It is not interpolated or converted into an estimate. Estimated RPM and fuel are separate values with `origin`, `formula`, `based_on`, and `warning` metadata. Environmental metrics carry an `environmental` origin and remain null when Open-Meteo data is unavailable.

## Future Scale Path

If workload or retention requirements grow, migrate persistence to PostgreSQL with TimescaleDB for time-series storage and PostGIS for geographic queries. Keep the importer normalization boundary and immutable API DTO layer; only the repository/cache hydration implementation should need replacement.
