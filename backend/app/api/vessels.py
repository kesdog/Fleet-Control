from datetime import UTC, datetime
from typing import Annotated, cast

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.schemas.telemetry import TelemetryRecordResponse, TelemetryResponse
from app.schemas.vessels import MetricResponse, VesselResponse, VesselSummaryResponse
from app.services.fleet_cache import FleetCacheManager, MetricCacheEntry, VesselCacheEntry

router = APIRouter(prefix="/vessels", tags=["vessels"])


def get_fleet_cache(request: Request) -> FleetCacheManager:
    return cast(FleetCacheManager, request.app.state.fleet_cache)


@router.get("", response_model=list[VesselSummaryResponse])
def list_vessels(request: Request) -> list[VesselSummaryResponse]:
    snapshot = get_fleet_cache(request).snapshot
    return [_vessel_summary(entry) for _, entry in sorted(snapshot.entries.items())]


@router.get("/{imo}", response_model=VesselResponse)
def get_vessel(imo: str, request: Request) -> VesselResponse:
    entry = _require_vessel(get_fleet_cache(request), imo)
    return VesselResponse(
        **_vessel_summary(entry).model_dump(),
        metrics=[_metric_response(metric) for metric in entry.metric_definitions],
    )


@router.get("/{imo}/metrics", response_model=list[MetricResponse])
def get_metrics(imo: str, request: Request) -> list[MetricResponse]:
    entry = _require_vessel(get_fleet_cache(request), imo)
    return [_metric_response(metric) for metric in entry.metric_definitions]


@router.get("/{imo}/telemetry", response_model=TelemetryResponse)
def get_telemetry(
    imo: str,
    request: Request,
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
) -> TelemetryResponse:
    entry = _require_vessel(get_fleet_cache(request), imo)
    normalized_start = _normalize_timestamp(start)
    normalized_end = _normalize_timestamp(end)
    _validate_range(entry, normalized_start, normalized_end)
    samples = entry.samples_in_range(normalized_start, normalized_end)
    return TelemetryResponse(
        imo=entry.imo,
        start=normalized_start,
        end=normalized_end,
        records=[
            TelemetryRecordResponse(
                timestamp=sample.timestamp,
                latitude_deg=sample.latitude_deg,
                longitude_deg=sample.longitude_deg,
                sog_knots=sample.sog_knots,
                course_deg=sample.course_deg,
                heading_deg=sample.heading_deg,
                estimated_rpm=sample.estimated_rpm,
                estimated_fuel_tpd=sample.estimated_fuel_tpd,
                metrics=dict(sample.metrics),
                missing_fields=sorted(sample.missing_fields),
            )
            for sample in samples
        ],
    )


def _require_vessel(cache: FleetCacheManager, imo: str) -> VesselCacheEntry:
    entry = cache.snapshot.get(imo)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Vessel {imo} was not found."
        )
    return entry


def _validate_range(
    entry: VesselCacheEntry, start: datetime | None, end: datetime | None
) -> None:
    if start is not None and end is not None and end < start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The end timestamp must not be before the start timestamp.",
        )
    if entry.min_timestamp is None or entry.max_timestamp is None:
        raise HTTPException(
            status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
            detail="The vessel has no telemetry available.",
        )
    if (start is not None and not entry.min_timestamp <= start <= entry.max_timestamp) or (
        end is not None and not entry.min_timestamp <= end <= entry.max_timestamp
    ):
        raise HTTPException(
            status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
            detail="The requested range is outside available telemetry.",
        )


def _normalize_timestamp(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is None:
        return value
    # Source timestamps omit an offset, so cache timestamps use UTC-naive datetimes.
    return value.astimezone(UTC).replace(tzinfo=None)


def _vessel_summary(entry: VesselCacheEntry) -> VesselSummaryResponse:
    return VesselSummaryResponse(
        imo=entry.imo,
        name=entry.name,
        start=entry.min_timestamp,
        end=entry.max_timestamp,
        sample_count=len(entry.samples),
        available_metrics=[metric.key for metric in entry.metric_definitions],
    )


def _metric_response(metric: MetricCacheEntry) -> MetricResponse:
    return MetricResponse(
        key=metric.key,
        label=metric.display_name,
        unit=metric.unit,
        origin=metric.origin,
        source_column=metric.source_column,
        formula=metric.formula,
        based_on=list(metric.based_on),
        warning=metric.warning,
    )
