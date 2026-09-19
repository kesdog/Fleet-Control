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
- `vessel_metrics`: measured and estimated metric definitions.
- `import_sessions`: temporary staged-import metadata.

The database schema initializes automatically. The current lightweight upgrade adds the `based_on` metadata column without introducing Alembic; a production deployment should replace this with managed migrations.

## Import Boundary

CSV files remain temporary until an import session validates successfully. The importer:

1. Detects headers, delimiter, navigation semantics, and source units.
2. Requires explicit confirmation for ambiguous speed units.
3. Converts speed to knots.
4. Merges GPS and motion files by timestamp, never row position.
5. Calculates RPM and fuel estimates from measured SOG.
6. Writes vessel data, samples, metric definitions, and import status in one SQLite transaction.

Failed commits roll back database changes. A cache update happens only after the transaction succeeds.

## Cache Read Model

`FleetCacheManager` hydrates an immutable fleet snapshot at application startup. Each vessel entry contains ordered sample timestamps, immutable records, metric definitions, and a binary-search range index.

SQLite remains authoritative. Normal GET routes use the cache and execute no SQLite reads. A successful import refreshes only the committed vessel's cache entry; other immutable entries retain their object identity. Redis is unnecessary for this single-process prototype because the cache is local, derived, and fast to rebuild from SQLite.

## Missing And Estimated Data

Missing source telemetry is represented by each cache sample's `missing_fields` collection. It is not interpolated or converted into an estimate. Estimated RPM and fuel are separate values with `origin`, `formula`, `based_on`, and `warning` metadata.

## Future Scale Path

If workload or retention requirements grow, migrate persistence to PostgreSQL with TimescaleDB for time-series storage and PostGIS for geographic queries. Keep the importer normalization boundary and immutable API DTO layer; only the repository/cache hydration implementation should need replacement.
