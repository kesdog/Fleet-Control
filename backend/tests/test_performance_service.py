from datetime import datetime, timedelta

import pytest

from app.config import Settings
from app.services.environment_service import calculate_weather_factor
from app.services.performance_service import (
    PerformanceSample,
    calculate_fuel_rate_tpd,
    calculate_rpm,
    calculate_segment_fuel_tonnes,
    calculate_stw,
    compute_voyage_performance,
    derive_stw,
)


def test_following_current_produces_stw_below_sog() -> None:
    stw = calculate_stw(
        sog_knots=12.0, heading_deg=90, current_speed_knots=2.0, current_direction_deg=90
    )
    assert stw < 12.0
    assert stw == pytest.approx(10.0)


def test_opposing_current_produces_stw_above_sog() -> None:
    stw = calculate_stw(
        sog_knots=12.0, heading_deg=90, current_speed_knots=2.0, current_direction_deg=270
    )
    assert stw > 12.0
    assert stw == pytest.approx(14.0)


def test_perpendicular_current_leaves_stw_approximately_equal_to_sog() -> None:
    stw = calculate_stw(
        sog_knots=12.0, heading_deg=90, current_speed_knots=3.0, current_direction_deg=0
    )
    assert stw == pytest.approx(12.0)


def test_missing_current_falls_back_to_sog() -> None:
    estimate = derive_stw(12.0, 90, None, None)
    assert estimate.stw_knots == 12.0
    assert estimate.source == "sog_fallback"
    assert estimate.current_along_heading_knots is None


def test_current_corrected_source_is_recorded() -> None:
    estimate = derive_stw(12.0, 90, 2.0, 90)
    assert estimate.source == "current_corrected"
    assert estimate.current_along_heading_knots == pytest.approx(2.0)


def test_fuel_rate_at_reference_speed_is_150_tpd() -> None:
    assert calculate_fuel_rate_tpd(15.0) == pytest.approx(150.0)


def test_fuel_rate_at_zero_speed_is_zero() -> None:
    assert calculate_fuel_rate_tpd(0.0) == 0.0


def test_fuel_rate_scales_cubically_with_stw() -> None:
    assert calculate_fuel_rate_tpd(30.0) == pytest.approx(150.0 * 8.0)


def test_rpm_equals_four_times_stw() -> None:
    assert calculate_rpm(11.25) == pytest.approx(45.0)


def test_weather_factor_matches_cube_root_formula() -> None:
    assert calculate_weather_factor(2.0) == pytest.approx(1.0)
    assert calculate_weather_factor(16.0) == pytest.approx(2.0)


def test_null_wave_height_produces_null_weather_factor() -> None:
    assert calculate_weather_factor(None) is None


def test_segment_integration_uses_trapezoidal_average() -> None:
    # Average of 10 and 20 t/day over 1 day equals 15 tonnes.
    assert calculate_segment_fuel_tonnes(10.0, 20.0, 86400.0) == pytest.approx(15.0)


def test_segment_integration_rejects_non_positive_intervals() -> None:
    assert calculate_segment_fuel_tonnes(10.0, 20.0, 0.0) == 0.0
    assert calculate_segment_fuel_tonnes(10.0, 20.0, -60.0) == 0.0


def _sample(
    timestamp: datetime,
    latitude: float,
    longitude: float,
    sog: float,
    heading: float | None = None,
    current_speed: float | None = None,
    current_direction: float | None = None,
    wave_height: float | None = None,
    wave_direction: float | None = None,
    wind_speed: float | None = None,
    wind_direction: float | None = None,
) -> PerformanceSample:
    return PerformanceSample(
        timestamp=timestamp,
        latitude_deg=latitude,
        longitude_deg=longitude,
        sog_knots=sog,
        heading_deg=heading,
        current_speed_knots=current_speed,
        current_direction_deg=current_direction,
        wave_height_m=wave_height,
        wave_direction_deg=wave_direction,
        wind_speed_knots=wind_speed,
        wind_direction_deg=wind_direction,
        weather_factor=calculate_weather_factor(wave_height),
    )


def test_voyage_cost_respects_configured_price() -> None:
    settings = Settings(
        fuel_price_per_tonne=500.0,
        fuel_currency="USD",
        fuel_integration_max_gap_minutes=24 * 60,
    )
    start = datetime(2026, 3, 1, 0, 0)
    samples = (
        _sample(start, 0.0, 0.0, 15.0),
        _sample(start + timedelta(days=1), 0.0, 1.0, 15.0),
    )
    performance = compute_voyage_performance(settings, samples)

    assert performance.fuel_tonnes == pytest.approx(150.0)
    assert performance.fuel_cost == pytest.approx(75000.0)
    assert performance.fuel_currency == "USD"


def test_voyage_with_irregular_intervals_integrates_correctly() -> None:
    settings = Settings()
    start = datetime(2026, 3, 1, 0, 0)
    samples = (
        _sample(start, 0.0, 0.0, 15.0),
        _sample(start + timedelta(hours=1), 0.0, 1.0, 15.0),
    )
    performance = compute_voyage_performance(settings, samples)

    # One hour at 150 t/day equals 6.25 tonnes.
    assert performance.fuel_tonnes == pytest.approx(150.0 / 24.0)


def test_voyage_gap_is_excluded_and_reported_as_unobserved() -> None:
    settings = Settings()
    start = datetime(2026, 3, 1, 0, 0)
    samples = (
        _sample(start, 0.0, 0.0, 15.0),
        _sample(start + timedelta(minutes=15), 0.0, 0.1, 15.0),
        _sample(start + timedelta(hours=12), 0.0, 10.0, 15.0),
    )
    performance = compute_voyage_performance(settings, samples)

    assert performance.fuel_tonnes == pytest.approx(150.0 / 96.0)
    assert performance.observed_duration_seconds == pytest.approx(15 * 60)
    assert performance.unobserved_duration_seconds == pytest.approx(11.75 * 3600)
    assert performance.coverage_percent == pytest.approx(15 / (15 + 705) * 100)


def test_zero_distance_does_not_divide_by_zero() -> None:
    settings = Settings()
    start = datetime(2026, 3, 1, 0, 0)
    samples = (
        _sample(start, 10.0, 10.0, 15.0),
        _sample(start + timedelta(hours=1), 10.0, 10.0, 15.0),
    )
    performance = compute_voyage_performance(settings, samples)

    assert performance.distance_nm == 0.0
    assert performance.fuel_consumption_t_per_100nm is None
    assert performance.fuel_cost_per_nm is None


def test_weather_summary_aggregates_available_wave_heights() -> None:
    settings = Settings()
    start = datetime(2026, 3, 1, 0, 0)
    samples = (
        _sample(start, 0.0, 0.0, 15.0, wave_height=2.0),
        _sample(start + timedelta(hours=1), 0.0, 1.0, 15.0, wave_height=4.0),
        _sample(start + timedelta(hours=2), 0.0, 2.0, 15.0, wave_height=None),
    )
    performance = compute_voyage_performance(settings, samples)

    assert performance.mean_wave_height_m == pytest.approx(3.0)
    assert performance.max_wave_height_m == pytest.approx(4.0)


def test_headwind_increases_fuel_and_tailwind_reduces_it() -> None:
    settings = Settings()
    start = datetime(2026, 3, 1, 0, 0)

    headwind = compute_voyage_performance(
        settings,
        (
            _sample(start, 0, 0, 15.0, heading=90, wind_speed=20.0, wind_direction=90),
            _sample(
                start + timedelta(hours=1), 0, 1, 15.0,
                heading=90, wind_speed=20.0, wind_direction=90,
            ),
        ),
    )
    tailwind = compute_voyage_performance(
        settings,
        (
            _sample(start, 0, 0, 15.0, heading=90, wind_speed=20.0, wind_direction=270),
            _sample(
                start + timedelta(hours=1), 0, 1, 15.0,
                heading=90, wind_speed=20.0, wind_direction=270,
            ),
        ),
    )

    # Wind FROM 90 (east) opposes an eastward heading -> headwind (more fuel).
    # Wind FROM 270 (west) follows the eastward heading -> tailwind (less fuel).
    assert headwind.weather_impact_percent is not None
    assert tailwind.weather_impact_percent is not None
    assert headwind.weather_impact_percent > 0
    assert tailwind.weather_impact_percent < 0
    assert headwind.weather_adjusted_fuel_tonnes > headwind.fuel_tonnes
    assert tailwind.weather_adjusted_fuel_tonnes < tailwind.fuel_tonnes


def test_head_sea_increases_fuel() -> None:
    settings = Settings()
    start = datetime(2026, 3, 1, 0, 0)
    samples = (
        _sample(start, 0, 0, 15.0, heading=90, wave_height=2.0, wave_direction=90),
        _sample(
            start + timedelta(hours=1), 0, 1, 15.0,
            heading=90, wave_height=2.0, wave_direction=90,
        ),
    )
    performance = compute_voyage_performance(settings, samples)

    # Waves from 90 (toward 270) oppose heading 90 -> head sea -> more fuel.
    assert performance.wave_impact_percent is not None
    assert performance.wave_impact_percent > 0
    assert performance.weather_adjusted_fuel_tonnes > performance.fuel_tonnes


def test_missing_weather_produces_null_impact() -> None:
    settings = Settings()
    start = datetime(2026, 3, 1, 0, 0)
    samples = (
        _sample(start, 0, 0, 15.0),
        _sample(start + timedelta(hours=1), 0, 1, 15.0),
    )
    performance = compute_voyage_performance(settings, samples)

    assert performance.wind_impact_percent is None
    assert performance.wave_impact_percent is None
    assert performance.weather_impact_percent is None
    assert performance.weather_adjusted_fuel_tonnes == pytest.approx(performance.fuel_tonnes)
