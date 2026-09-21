from dataclasses import dataclass
from datetime import datetime

import httpx
import pytest

from app.config import Settings
from app.services.environment_service import (
    calculate_weather_factor,
    fetch_environment_for_samples,
    get_environment,
)


@dataclass(frozen=True)
class _SampleLike:
    timestamp: datetime
    latitude_deg: float
    longitude_deg: float


WEATHER_PAYLOAD = {
    "hourly": {
        "time": ["2026-03-01T00:00", "2026-03-01T01:00"],
        "wind_speed_10m": [36.0, 72.0],
        "wind_direction_10m": [180.0, 90.0],
    }
}
MARINE_PAYLOAD = {
    "hourly": {
        "time": ["2026-03-01T00:00", "2026-03-01T01:00"],
        "wave_height": [2.0, 3.0],
        "wave_direction": [270.0, 0.0],
        "wave_period": [8.0, 9.0],
        "ocean_current_velocity": [1.852, 3.704],
        "ocean_current_direction": [90.0, 180.0],
    }
}


def _mock_client() -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        payload = MARINE_PAYLOAD if "marine" in request.url.host else WEATHER_PAYLOAD
        return httpx.Response(200, json=payload)

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_weather_factor_formula() -> None:
    assert calculate_weather_factor(2.0) == pytest.approx(1.0)
    assert calculate_weather_factor(None) is None


def test_environment_units_are_normalized_to_canonical() -> None:
    observation = get_environment(
        32.5, -79.4, datetime(2026, 3, 1, 0, 40), Settings(), _mock_client()
    )

    # Nearest hour is 01:00 (wind 72 km/h -> knots, wave 3.0 m, current 3.704 km/h -> knots).
    assert observation.wind_speed_knots == pytest.approx(72.0 * 0.539956803)
    assert observation.wind_direction_deg == pytest.approx(90.0)
    assert observation.wave_height_m == pytest.approx(3.0)
    assert observation.wave_period_s == pytest.approx(9.0)
    assert observation.current_speed_knots == pytest.approx(3.704 * 0.539956803)
    assert observation.current_direction_deg == pytest.approx(180.0)
    assert observation.weather_factor == pytest.approx((3.0 / 2.0) ** (1.0 / 3.0))


def test_fetch_batches_and_matches_nearest_hour() -> None:
    samples = (
        _SampleLike(datetime(2026, 3, 1, 0, 10), 32.51, -79.41),
        _SampleLike(datetime(2026, 3, 1, 0, 20), 32.52, -79.42),
    )
    observations = fetch_environment_for_samples(samples, Settings(), _mock_client())

    assert set(observations) == {sample.timestamp for sample in samples}
    # Both samples round to the same grid cell and day, so one provider call serves both.
    assert observations[samples[0].timestamp].wind_speed_knots == pytest.approx(36.0 * 0.539956803)


def test_fetch_reports_completed_calendar_days() -> None:
    samples = (
        _SampleLike(datetime(2026, 3, 1, 0, 10), 32.51, -79.41),
        _SampleLike(datetime(2026, 3, 2, 0, 10), 32.52, -79.42),
    )
    progress: list[tuple[int, int]] = []

    fetch_environment_for_samples(
        samples,
        Settings(),
        _mock_client(),
        on_progress=lambda completed, total: progress.append((completed, total)),
    )

    assert progress == [(0, 2), (1, 2), (2, 2)]


def test_disabled_enrichment_returns_no_observations() -> None:
    settings = Settings(environment_enrichment_enabled=False)
    samples = (_SampleLike(datetime(2026, 3, 1, 0, 10), 32.5, -79.4),)
    assert fetch_environment_for_samples(samples, settings) == {}


def test_provider_failure_degrades_to_null_observation() -> None:
    def failing_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("provider unavailable", request=request)

    client = httpx.Client(transport=httpx.MockTransport(failing_handler))
    samples = (_SampleLike(datetime(2026, 3, 1, 0, 10), 32.5, -79.4),)

    observations = fetch_environment_for_samples(samples, Settings(), client)

    observation = observations[samples[0].timestamp]
    assert observation.wind_speed_knots is None
    assert observation.weather_factor is None
