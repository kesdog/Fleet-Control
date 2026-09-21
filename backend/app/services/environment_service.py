import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)

KMH_TO_KNOTS = 0.539956803
SPATIAL_GRID_DEGREES = 0.1

WEATHER_VARIABLES = ("wind_speed_10m", "wind_direction_10m")
MARINE_VARIABLES = (
    "wave_height",
    "wave_direction",
    "wave_period",
    "ocean_current_velocity",
    "ocean_current_direction",
)


@dataclass(frozen=True)
class EnvironmentalObservation:
    """Environmental conditions at one vessel position/time in canonical units."""

    timestamp: datetime
    wind_speed_knots: float | None
    wind_direction_deg: float | None
    wave_height_m: float | None
    wave_direction_deg: float | None
    wave_period_s: float | None
    current_speed_knots: float | None
    current_direction_deg: float | None
    weather_factor: float | None


@dataclass(frozen=True)
class _CellData:
    """Provider series for one spatial grid cell over one day."""

    times: tuple[datetime, ...]
    wind_speed_knots: tuple[float | None, ...]
    wind_direction_deg: tuple[float | None, ...]
    wave_height_m: tuple[float | None, ...]
    wave_direction_deg: tuple[float | None, ...]
    wave_period_s: tuple[float | None, ...]
    current_speed_knots: tuple[float | None, ...]
    current_direction_deg: tuple[float | None, ...]


def calculate_weather_factor(wave_height_m: float | None) -> float | None:
    """Return the assessment Weather Factor derived from significant wave height."""
    if wave_height_m is None:
        return None
    return float((max(wave_height_m, 0.0) / 2.0) ** (1.0 / 3.0))


def get_environment(
    latitude: float,
    longitude: float,
    timestamp: datetime,
    settings: Settings,
    client: httpx.Client | None = None,
) -> EnvironmentalObservation:
    """Fetch historical wind, wave, and current data for one vessel sample."""
    active_client = client if client is not None else httpx.Client(timeout=30.0)
    try:
        cells = _fetch_day(
            active_client, settings, timestamp.date(), [(latitude, longitude)]
        )
    finally:
        if client is None:
            active_client.close()
    return _match_observation(cells[0], timestamp)


def fetch_environment_for_samples(
    samples: tuple[Any, ...], settings: Settings, client: httpx.Client | None = None
) -> dict[datetime, EnvironmentalObservation]:
    """Enrich a batch of samples, batching all coordinates of a day into one request."""
    if not settings.environment_enrichment_enabled:
        return {}

    active_client = client if client is not None else httpx.Client(timeout=30.0)

    # Preserve first-seen order so coordinate batches and responses stay aligned.
    by_day: dict[date, dict[tuple[float, float], list[Any]]] = {}
    for sample in samples:
        latitude = getattr(sample, "latitude_deg", None)
        longitude = getattr(sample, "longitude_deg", None)
        timestamp = getattr(sample, "timestamp", None)
        if latitude is None or longitude is None or timestamp is None:
            continue
        coordinate = (_round_coordinate(latitude), _round_coordinate(longitude))
        by_day.setdefault(timestamp.date(), {}).setdefault(coordinate, []).append(sample)

    observations: dict[datetime, EnvironmentalObservation] = {}
    try:
        for day, groups in by_day.items():
            coordinates = list(groups.keys())
            try:
                cells = _fetch_day(active_client, settings, day, coordinates)
            except Exception as error:  # noqa: BLE001 - never fail an import.
                logger.warning("Open-Meteo enrichment failed for %s: %s", day, error)
                cells = [_empty_cell() for _ in coordinates]
            for coordinate, cell in zip(coordinates, cells, strict=True):
                for sample in groups[coordinate]:
                    observations[sample.timestamp] = _match_observation(cell, sample.timestamp)
    finally:
        if client is None:
            active_client.close()

    return observations


def _empty_cell() -> _CellData:
    return _CellData(
        times=(),
        wind_speed_knots=(),
        wind_direction_deg=(),
        wave_height_m=(),
        wave_direction_deg=(),
        wave_period_s=(),
        current_speed_knots=(),
        current_direction_deg=(),
    )


def _round_coordinate(value: float) -> float:
    return round(value / SPATIAL_GRID_DEGREES) * SPATIAL_GRID_DEGREES


def _fetch_day(
    client: httpx.Client,
    settings: Settings,
    day: date,
    coordinates: list[tuple[float, float]],
) -> list[_CellData]:
    """Fetch one day of provider data for many coordinates in two batched requests."""
    latitudes = ",".join(str(latitude) for latitude, _ in coordinates)
    longitudes = ",".join(str(longitude) for _, longitude in coordinates)
    weather = _get_payload(
        client,
        settings.open_meteo_weather_url,
        params={
            "latitude": latitudes,
            "longitude": longitudes,
            "start_date": day.isoformat(),
            "end_date": day.isoformat(),
            "hourly": ",".join(WEATHER_VARIABLES),
            "timezone": "GMT",
        },
    )
    marine = _get_payload(
        client,
        settings.open_meteo_marine_url,
        params={
            "latitude": latitudes,
            "longitude": longitudes,
            "start_date": day.isoformat(),
            "end_date": day.isoformat(),
            "hourly": ",".join(MARINE_VARIABLES),
            "timezone": "GMT",
        },
    )
    weather_list = _as_list(weather)
    marine_list = _as_list(marine)
    return [
        _combine_responses(
            weather_list[index] if index < len(weather_list) else {},
            marine_list[index] if index < len(marine_list) else {},
        )
        for index in range(len(coordinates))
    ]


def _as_list(payload: Any) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        return [payload]
    return []


def _get_payload(client: httpx.Client, url: str, params: dict[str, Any]) -> Any:
    response = client.get(url, params=params)
    response.raise_for_status()
    return response.json()


def _combine_responses(
    weather: dict[str, Any], marine: dict[str, Any]
) -> _CellData:
    weather_hourly = weather.get("hourly") or {}
    marine_hourly = marine.get("hourly") or {}
    times = tuple(
        _parse_time(value)
        for value in (weather_hourly.get("time") or marine_hourly.get("time") or [])
    )
    wind_speed = weather_hourly.get("wind_speed_10m") or []
    wind_direction = weather_hourly.get("wind_direction_10m") or []
    wave_height = marine_hourly.get("wave_height") or []
    wave_direction = marine_hourly.get("wave_direction") or []
    wave_period = marine_hourly.get("wave_period") or []
    current_speed = marine_hourly.get("ocean_current_velocity") or []
    current_direction = marine_hourly.get("ocean_current_direction") or []

    count = len(times)
    return _CellData(
        times=times,
        wind_speed_knots=_convert_speed(wind_speed, count),
        wind_direction_deg=_align(wind_direction, count),
        wave_height_m=_align(wave_height, count),
        wave_direction_deg=_align(wave_direction, count),
        wave_period_s=_align(wave_period, count),
        current_speed_knots=_convert_speed(current_speed, count),
        current_direction_deg=_align(current_direction, count),
    )


def _convert_speed(values: list[Any], count: int) -> tuple[float | None, ...]:
    return tuple(_to_knots(value) for value in _pad(values, count))


def _to_knots(value: Any) -> float | None:
    parsed = _optional_float(value)
    if parsed is None:
        return None
    return parsed * KMH_TO_KNOTS


def _align(values: list[Any], count: int) -> tuple[float | None, ...]:
    return tuple(_optional_float(value) for value in _pad(values, count))


def _pad(values: list[Any], count: int) -> list[Any]:
    padded = list(values)
    while len(padded) < count:
        padded.append(None)
    return padded[:count]


def _optional_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed != parsed:
        return None
    return parsed


def _parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)


def _match_observation(cell: _CellData, timestamp: datetime) -> EnvironmentalObservation:
    if not cell.times:
        return EnvironmentalObservation(
            timestamp=timestamp,
            wind_speed_knots=None,
            wind_direction_deg=None,
            wave_height_m=None,
            wave_direction_deg=None,
            wave_period_s=None,
            current_speed_knots=None,
            current_direction_deg=None,
            weather_factor=None,
        )
    index = _nearest_index(cell.times, timestamp)
    wave_height = cell.wave_height_m[index]
    return EnvironmentalObservation(
        timestamp=timestamp,
        wind_speed_knots=cell.wind_speed_knots[index],
        wind_direction_deg=cell.wind_direction_deg[index],
        wave_height_m=wave_height,
        wave_direction_deg=cell.wave_direction_deg[index],
        wave_period_s=cell.wave_period_s[index],
        current_speed_knots=cell.current_speed_knots[index],
        current_direction_deg=cell.current_direction_deg[index],
        weather_factor=calculate_weather_factor(wave_height),
    )


def _nearest_index(times: tuple[datetime, ...], timestamp: datetime) -> int:
    return min(
        range(len(times)),
        key=lambda index: abs((times[index] - timestamp).total_seconds()),
    )
