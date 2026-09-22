from collections import Counter
from datetime import UTC, datetime
from typing import Annotated, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.config import Settings
from app.schemas.agents import (
    AgentAppContextResponse,
    AgentDataQualityResponse,
    AgentDocumentationResponse,
    AgentExampleResponse,
    AgentReportResponse,
    AgentVesselReportResponse,
)
from app.schemas.performance import (
    PerformanceResponse,
    WeatherImpactResponse,
    WeatherSummaryResponse,
)
from app.schemas.vessels import MetricResponse
from app.services.agent_rate_limiter import AgentReportRateLimiter
from app.services.fleet_cache import FleetCacheManager, SampleCacheEntry, VesselCacheEntry
from app.services.performance_service import (
    PerformanceSample,
    VoyagePerformance,
    compute_voyage_performance,
)

router = APIRouter(prefix="/agents", tags=["agents"])

APP_CONTEXT = AgentAppContextResponse(
    name="Marine Fleet Control Center",
    purpose="Operational review of imported vessel GPS, motion, and environmental telemetry.",
    data_source="Immutable in-memory fleet cache hydrated from normalized imported telemetry.",
    access="Read-only report summaries; raw telemetry is intentionally excluded.",
)


def get_fleet_cache(request: Request) -> FleetCacheManager:
    return cast(FleetCacheManager, request.app.state.fleet_cache)


def get_runtime_settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


def enforce_agent_report_rate_limit(request: Request) -> None:
    limiter = cast(AgentReportRateLimiter, request.app.state.agent_report_rate_limiter)
    retry_after = limiter.retry_after_seconds()
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Agent report request limit exceeded. Retry after one minute.",
            headers={"Retry-After": str(retry_after)},
        )


@router.get("/docs", response_model=AgentDocumentationResponse)
def get_agent_documentation() -> AgentDocumentationResponse:
    return AgentDocumentationResponse(
        app=APP_CONTEXT,
        discovery_endpoint="GET /api/vessels",
        report_endpoint="GET /api/agents/report",
        openapi_endpoint="GET /openapi.json",
        examples=[
            AgentExampleResponse(
                purpose="Discover current fleet targets before requesting reports.",
                request="GET /api/vessels",
                notes=(
                    "Use each returned imo as a report target; name and available timestamps are "
                    "included."
                ),
            ),
            AgentExampleResponse(
                purpose="Request a complete report for one vessel.",
                request="GET /api/agents/report?imo=IMO1234567",
                notes="Omit start and end to use the vessel's complete available telemetry range.",
            ),
            AgentExampleResponse(
                purpose="Compare two vessels in an explicit UTC window.",
                request=(
                    "GET /api/agents/report?imo=IMO1234567&imo=IMO7654321"
                    "&start=2026-03-01T00:00:00Z&end=2026-03-07T00:00:00Z"
                ),
                notes=(
                    "The report route accepts at most 15 process-wide requests per minute and "
                    "returns "
                    "429 with Retry-After when exceeded."
                ),
            ),
        ],
    )


@router.get("/report", response_model=AgentReportResponse)
def get_agent_report(
    request: Request,
    imos: Annotated[list[str], Query(alias="imo", min_length=1)],
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
    _: Annotated[None, Depends(enforce_agent_report_rate_limit)] = None,
) -> AgentReportResponse:
    cache = get_fleet_cache(request)
    normalized_start = _normalize_timestamp(start)
    normalized_end = _normalize_timestamp(end)
    reports = []
    for imo in imos:
        entry = _require_vessel(cache, imo)
        report_start, report_end = _resolve_range(entry, normalized_start, normalized_end)
        samples = entry.samples_in_range(report_start, report_end)
        performance = compute_voyage_performance(
            get_runtime_settings(request), tuple(_performance_sample(sample) for sample in samples)
        )
        reports.append(
            AgentVesselReportResponse(
                imo=entry.imo,
                name=entry.name,
                available_start=entry.min_timestamp,
                available_end=entry.max_timestamp,
                start=report_start,
                end=report_end,
                sample_count=len(samples),
                metrics=[
                    MetricResponse(
                        key=metric.key,
                        label=metric.display_name,
                        unit=metric.unit,
                        origin=metric.origin,
                        source_column=metric.source_column,
                        formula=metric.formula,
                        based_on=list(metric.based_on),
                        warning=metric.warning,
                    )
                    for metric in entry.metric_definitions
                ],
                data_quality=_data_quality(entry, samples),
                performance=_performance_response(entry, report_start, report_end, performance),
            )
        )
    return AgentReportResponse(
        app=APP_CONTEXT,
        reports=reports,
    )


def _normalize_timestamp(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def _require_vessel(cache: FleetCacheManager, imo: str) -> VesselCacheEntry:
    entry = cache.snapshot.get(imo)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Vessel {imo} was not found."
        )
    return entry


def _resolve_range(
    entry: VesselCacheEntry, start: datetime | None, end: datetime | None
) -> tuple[datetime, datetime]:
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
    report_start = start or entry.min_timestamp
    report_end = end or entry.max_timestamp
    if not (
        entry.min_timestamp <= report_start <= entry.max_timestamp
        and entry.min_timestamp <= report_end <= entry.max_timestamp
    ):
        raise HTTPException(
            status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
            detail="The requested range is outside available telemetry.",
        )
    return report_start, report_end


def _data_quality(
    entry: VesselCacheEntry, samples: tuple[SampleCacheEntry, ...]
) -> AgentDataQualityResponse:
    missing_field_counts = Counter(
        field for sample in samples for field in sample.missing_fields
    )
    records_with_environment = sum(sample.wind_speed_knots is not None for sample in samples)
    return AgentDataQualityResponse(
        missing_field_counts=dict(sorted(missing_field_counts.items())),
        records_with_environment=records_with_environment,
        records_without_environment=len(samples) - records_with_environment,
        measured_metric_count=sum(
            metric.origin == "measured" for metric in entry.metric_definitions
        ),
        estimated_metric_count=sum(
            metric.origin == "estimated" for metric in entry.metric_definitions
        ),
    )


def _performance_sample(sample: SampleCacheEntry) -> PerformanceSample:
    return PerformanceSample(
        timestamp=sample.timestamp,
        latitude_deg=sample.latitude_deg,
        longitude_deg=sample.longitude_deg,
        sog_knots=sample.sog_knots,
        heading_deg=sample.heading_deg,
        current_speed_knots=sample.current_speed_knots,
        current_direction_deg=sample.current_direction_deg,
        wave_height_m=sample.wave_height_m,
        wave_direction_deg=sample.wave_direction_deg,
        wind_speed_knots=sample.wind_speed_knots,
        wind_direction_deg=sample.wind_direction_deg,
        weather_factor=sample.weather_factor,
    )


def _performance_response(
    entry: VesselCacheEntry,
    start: datetime,
    end: datetime,
    performance: VoyagePerformance,
) -> PerformanceResponse:
    return PerformanceResponse(
        imo=entry.imo,
        start=start,
        end=end,
        distance_nm=performance.distance_nm,
        fuel_tonnes=performance.fuel_tonnes,
        fuel_cost=performance.fuel_cost,
        fuel_currency=performance.fuel_currency,
        fuel_efficiency_nm_per_tonne=performance.fuel_efficiency_nm_per_tonne,
        fuel_consumption_t_per_100nm=performance.fuel_consumption_t_per_100nm,
        fuel_cost_per_nm=performance.fuel_cost_per_nm,
        weather=WeatherSummaryResponse(
            mean_wave_height_m=performance.mean_wave_height_m,
            max_wave_height_m=performance.max_wave_height_m,
            mean_weather_factor=performance.mean_weather_factor,
        ),
        weather_impact=WeatherImpactResponse(
            adjusted_fuel_tonnes=performance.weather_adjusted_fuel_tonnes,
            adjusted_fuel_cost=performance.weather_adjusted_fuel_cost,
            wind_percent=performance.wind_impact_percent,
            wave_percent=performance.wave_impact_percent,
            total_percent=performance.weather_impact_percent,
        ),
    )
