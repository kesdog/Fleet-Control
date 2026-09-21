from datetime import UTC, datetime
from typing import Annotated, cast

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.config import Settings
from app.schemas.performance import (
    EnvironmentPointResponse,
    EnvironmentResponse,
    PerformanceResponse,
    WeatherImpactResponse,
    WeatherSummaryResponse,
)
from app.schemas.telemetry import TelemetryRecordResponse, TelemetryResponse
from app.schemas.vessels import MetricResponse, VesselResponse, VesselSummaryResponse
from app.schemas.visualization import (
    SeriesPointResponse,
    SeriesResponse,
    TrajectoryPointResponse,
    TrajectoryResponse,
)
from app.services.fleet_cache import (
    FleetCacheManager,
    MetricCacheEntry,
    SampleCacheEntry,
    VesselCacheEntry,
)
from app.services.performance_service import (
    PerformanceSample,
    VoyagePerformance,
    compute_voyage_performance,
)

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
                stw_knots=sample.stw_knots,
                stw_source=sample.stw_source,
                current_along_heading_knots=sample.current_along_heading_knots,
                wind_speed_knots=sample.wind_speed_knots,
                wind_direction_deg=sample.wind_direction_deg,
                wave_height_m=sample.wave_height_m,
                wave_direction_deg=sample.wave_direction_deg,
                wave_period_s=sample.wave_period_s,
                current_speed_knots=sample.current_speed_knots,
                current_direction_deg=sample.current_direction_deg,
                weather_factor=sample.weather_factor,
                metrics=dict(sample.metrics),
                missing_fields=sorted(sample.missing_fields),
            )
            for sample in samples
        ],
    )


@router.get("/{imo}/environment", response_model=EnvironmentResponse)
def get_environment(
    imo: str,
    request: Request,
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
    max_points: Annotated[int | None, Query(ge=2)] = None,
) -> EnvironmentResponse:
    entry = _require_vessel(get_fleet_cache(request), imo)
    normalized_start = _normalize_timestamp(start)
    normalized_end = _normalize_timestamp(end)
    _validate_range(entry, normalized_start, normalized_end)
    samples = _downsample(entry.samples_in_range(normalized_start, normalized_end), max_points)
    return EnvironmentResponse(
        imo=entry.imo,
        start=normalized_start,
        end=normalized_end,
        records=[
            EnvironmentPointResponse(
                timestamp=sample.timestamp,
                wind_speed_knots=sample.wind_speed_knots,
                wind_direction_deg=sample.wind_direction_deg,
                wave_height_m=sample.wave_height_m,
                wave_direction_deg=sample.wave_direction_deg,
                wave_period_s=sample.wave_period_s,
                current_speed_knots=sample.current_speed_knots,
                current_direction_deg=sample.current_direction_deg,
                weather_factor=sample.weather_factor,
                missing=sample.wind_speed_knots is None,
            )
            for sample in samples
        ],
    )


@router.get("/{imo}/performance", response_model=PerformanceResponse)
def get_performance(
    imo: str,
    request: Request,
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
) -> PerformanceResponse:
    entry = _require_vessel(get_fleet_cache(request), imo)
    normalized_start = _normalize_timestamp(start)
    normalized_end = _normalize_timestamp(end)
    _validate_range(entry, normalized_start, normalized_end)
    samples = entry.samples_in_range(normalized_start, normalized_end)
    performance = compute_voyage_performance(
        get_runtime_settings(request),
        tuple(_performance_sample(sample) for sample in samples),
    )
    return _performance_response(entry, normalized_start, normalized_end, performance)


@router.get("/{imo}/trajectory", response_model=TrajectoryResponse)
def get_trajectory(
    imo: str,
    request: Request,
    metric: Annotated[str, Query(min_length=1)] = "sog",
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
    max_points: Annotated[int | None, Query(ge=2)] = None,
) -> TrajectoryResponse:
    entry = _require_vessel(get_fleet_cache(request), imo)
    metric_definition = _require_metric(entry, metric)
    normalized_start = _normalize_timestamp(start)
    normalized_end = _normalize_timestamp(end)
    _validate_range(entry, normalized_start, normalized_end)
    samples = _downsample(entry.samples_in_range(normalized_start, normalized_end), max_points)
    segments: list[list[TrajectoryPointResponse]] = [[]]
    previous_longitude: float | None = None
    for sample in samples:
        if previous_longitude is not None and abs(sample.longitude_deg - previous_longitude) > 180:
            # Map libraries must not draw an artificial line across the entire world.
            segments.append([])
        value = _metric_value(sample, metric)
        segments[-1].append(
            TrajectoryPointResponse(
                timestamp=sample.timestamp,
                latitude_deg=sample.latitude_deg,
                longitude_deg=sample.longitude_deg,
                metric_value=value,
                missing=metric in sample.missing_fields,
            )
        )
        previous_longitude = sample.longitude_deg
    return TrajectoryResponse(
        imo=entry.imo,
        metric=_metric_response(metric_definition),
        start=normalized_start,
        end=normalized_end,
        segments=segments if samples else [],
    )


@router.get("/{imo}/series/{metric}", response_model=SeriesResponse)
def get_series(
    imo: str,
    metric: str,
    request: Request,
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
    max_points: Annotated[int | None, Query(ge=2)] = None,
) -> SeriesResponse:
    entry = _require_vessel(get_fleet_cache(request), imo)
    metric_definition = _require_metric(entry, metric)
    normalized_start = _normalize_timestamp(start)
    normalized_end = _normalize_timestamp(end)
    _validate_range(entry, normalized_start, normalized_end)
    samples = _downsample(entry.samples_in_range(normalized_start, normalized_end), max_points)
    return SeriesResponse(
        imo=entry.imo,
        metric=_metric_response(metric_definition),
        start=normalized_start,
        end=normalized_end,
        points=[
            SeriesPointResponse(
                timestamp=sample.timestamp,
                value=_metric_value(sample, metric),
                missing=metric in sample.missing_fields,
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


def _require_metric(entry: VesselCacheEntry, key: str) -> MetricCacheEntry:
    for metric in entry.metric_definitions:
        if metric.key == key:
            return metric
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Metric {key!r} is not available for vessel {entry.imo}.",
    )


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


def _metric_value(sample: SampleCacheEntry, key: str) -> float | None:
    values = {
        "latitude_deg": sample.latitude_deg,
        "longitude_deg": sample.longitude_deg,
        "sog": sample.sog_knots,
        "course": sample.course_deg,
        "heading": sample.heading_deg,
        "rpm": sample.estimated_rpm,
        "fuel_tpd": sample.estimated_fuel_tpd,
        "stw": sample.stw_knots,
        "current_along_heading": sample.current_along_heading_knots,
        "weather_factor": sample.weather_factor,
        "wind_speed": sample.wind_speed_knots,
        "wind_direction": sample.wind_direction_deg,
        "wave_height": sample.wave_height_m,
        "wave_direction": sample.wave_direction_deg,
        "wave_period": sample.wave_period_s,
        "current_speed": sample.current_speed_knots,
        "current_direction": sample.current_direction_deg,
    }
    return values.get(key, sample.metrics.get(key))


def _downsample(
    samples: tuple[SampleCacheEntry, ...], max_points: int | None
) -> tuple[SampleCacheEntry, ...]:
    if max_points is None or len(samples) <= max_points:
        return samples
    indexes = {round(index * (len(samples) - 1) / (max_points - 1)) for index in range(max_points)}
    return tuple(samples[index] for index in sorted(indexes))


def get_runtime_settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


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
    start: datetime | None,
    end: datetime | None,
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
