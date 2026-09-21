import math
from dataclasses import dataclass
from datetime import datetime

from app.config import Settings

EARTH_RADIUS_NM = 3440.065


@dataclass(frozen=True)
class StwEstimate:
    stw_knots: float
    source: str
    current_along_heading_knots: float | None


@dataclass(frozen=True)
class PerformanceSample:
    timestamp: datetime
    latitude_deg: float
    longitude_deg: float
    sog_knots: float
    heading_deg: float | None
    current_speed_knots: float | None
    current_direction_deg: float | None
    wave_height_m: float | None
    wave_direction_deg: float | None
    wind_speed_knots: float | None
    wind_direction_deg: float | None
    weather_factor: float | None


@dataclass(frozen=True)
class VoyagePerformance:
    distance_nm: float
    fuel_tonnes: float
    fuel_cost: float
    fuel_currency: str
    fuel_efficiency_nm_per_tonne: float | None
    fuel_consumption_t_per_100nm: float | None
    fuel_cost_per_nm: float | None
    mean_wave_height_m: float | None
    max_wave_height_m: float | None
    mean_weather_factor: float | None
    weather_adjusted_fuel_tonnes: float
    weather_adjusted_fuel_cost: float
    wind_impact_percent: float | None
    wave_impact_percent: float | None
    weather_impact_percent: float | None


def calculate_current_along_heading(
    current_speed_knots: float | None,
    current_direction_deg: float | None,
    heading_deg: float | None,
) -> float | None:
    """Project the current vector onto the vessel heading."""
    if (
        current_speed_knots is None
        or current_direction_deg is None
        or heading_deg is None
    ):
        return None
    relative_angle_rad = math.radians(current_direction_deg - heading_deg)
    return current_speed_knots * math.cos(relative_angle_rad)


def calculate_stw(
    sog_knots: float,
    heading_deg: float | None,
    current_speed_knots: float | None,
    current_direction_deg: float | None,
) -> float:
    """Estimate Speed Through Water from SOG and the along-track current."""
    return derive_stw(
        sog_knots, heading_deg, current_speed_knots, current_direction_deg
    ).stw_knots


def derive_stw(
    sog_knots: float,
    heading_deg: float | None,
    current_speed_knots: float | None,
    current_direction_deg: float | None,
) -> StwEstimate:
    current_along_heading = calculate_current_along_heading(
        current_speed_knots, current_direction_deg, heading_deg
    )
    if current_along_heading is None:
        return StwEstimate(
            stw_knots=max(0.0, sog_knots),
            source="sog_fallback",
            current_along_heading_knots=None,
        )
    return StwEstimate(
        stw_knots=max(0.0, sog_knots - current_along_heading),
        source="current_corrected",
        current_along_heading_knots=current_along_heading,
    )


def calculate_rpm(stw_knots: float) -> float:
    """Assessment approximation: RPM = 4 × STW."""
    return 4.0 * stw_knots


def calculate_fuel_rate_tpd(
    stw_knots: float,
    reference_speed_knots: float = 15.0,
    reference_rate_tpd: float = 150.0,
) -> float:
    """Calculate tonnes/day using the cubic assessment model."""
    return reference_rate_tpd * (stw_knots / reference_speed_knots) ** 3


def calculate_segment_fuel_tonnes(
    previous_rate_tpd: float,
    current_rate_tpd: float,
    elapsed_seconds: float,
) -> float:
    """Integrate fuel rate across one telemetry interval using trapezoids."""
    if elapsed_seconds <= 0:
        return 0.0
    average_rate_tpd = (previous_rate_tpd + current_rate_tpd) / 2.0
    elapsed_days = elapsed_seconds / 86400.0
    return average_rate_tpd * elapsed_days


def haversine_nm(
    latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float
) -> float:
    """Return the great-circle distance between two points in nautical miles."""
    lat_a = math.radians(latitude_a)
    lat_b = math.radians(latitude_b)
    delta_lat = lat_b - lat_a
    delta_lon = math.radians(
        ((longitude_b - longitude_a + 540) % 360) - 180
    )
    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat_a) * math.cos(lat_b) * math.sin(delta_lon / 2) ** 2
    )
    return EARTH_RADIUS_NM * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def compute_voyage_performance(
    settings: Settings, samples: tuple[PerformanceSample, ...]
) -> VoyagePerformance:
    """Aggregate fuel, distance, cost, and weather across a voyage trajectory."""
    total_fuel_tonnes = 0.0
    wind_fuel_tonnes = 0.0
    wave_fuel_tonnes = 0.0
    adjusted_fuel_tonnes = 0.0
    total_distance_nm = 0.0
    previous: PerformanceSample | None = None
    previous_rates = (0.0, 0.0, 0.0, 0.0)
    has_wind = False
    has_wave = False

    wave_heights = [sample.wave_height_m for sample in samples if sample.wave_height_m is not None]
    weather_factors = [
        sample.weather_factor for sample in samples if sample.weather_factor is not None
    ]

    for sample in samples:
        rate_tpd = calculate_fuel_rate_tpd(
            calculate_stw(
                sample.sog_knots,
                sample.heading_deg,
                sample.current_speed_knots,
                sample.current_direction_deg,
            ),
            settings.fuel_reference_speed_knots,
            settings.fuel_reference_rate_tpd,
        )
        wind_penalty, wave_penalty = _weather_penalties(sample, settings)
        wind_rate = rate_tpd * _clamp_factor(1.0 + (wind_penalty or 0.0), settings)
        wave_rate = rate_tpd * _clamp_factor(1.0 + (wave_penalty or 0.0), settings)
        adjusted_rate = rate_tpd * _clamp_factor(
            1.0 + (wind_penalty or 0.0) + (wave_penalty or 0.0), settings
        )
        if wind_penalty is not None:
            has_wind = True
        if wave_penalty is not None:
            has_wave = True

        if previous is not None:
            elapsed_seconds = (sample.timestamp - previous.timestamp).total_seconds()
            total_fuel_tonnes += calculate_segment_fuel_tonnes(
                previous_rates[0], rate_tpd, elapsed_seconds
            )
            wind_fuel_tonnes += calculate_segment_fuel_tonnes(
                previous_rates[1], wind_rate, elapsed_seconds
            )
            wave_fuel_tonnes += calculate_segment_fuel_tonnes(
                previous_rates[2], wave_rate, elapsed_seconds
            )
            adjusted_fuel_tonnes += calculate_segment_fuel_tonnes(
                previous_rates[3], adjusted_rate, elapsed_seconds
            )
            total_distance_nm += haversine_nm(
                previous.latitude_deg,
                previous.longitude_deg,
                sample.latitude_deg,
                sample.longitude_deg,
            )
        previous = sample
        previous_rates = (rate_tpd, wind_rate, wave_rate, adjusted_rate)

    fuel_cost = total_fuel_tonnes * settings.fuel_price_per_tonne
    return VoyagePerformance(
        distance_nm=total_distance_nm,
        fuel_tonnes=total_fuel_tonnes,
        fuel_cost=fuel_cost,
        fuel_currency=settings.fuel_currency,
        fuel_efficiency_nm_per_tonne=(
            total_distance_nm / total_fuel_tonnes if total_fuel_tonnes > 0 else None
        ),
        fuel_consumption_t_per_100nm=(
            (total_fuel_tonnes / total_distance_nm) * 100.0
            if total_distance_nm > 0
            else None
        ),
        fuel_cost_per_nm=(
            fuel_cost / total_distance_nm if total_distance_nm > 0 else None
        ),
        mean_wave_height_m=_mean(wave_heights),
        max_wave_height_m=max(wave_heights) if wave_heights else None,
        mean_weather_factor=_mean(weather_factors),
        weather_adjusted_fuel_tonnes=adjusted_fuel_tonnes,
        weather_adjusted_fuel_cost=adjusted_fuel_tonnes * settings.fuel_price_per_tonne,
        wind_impact_percent=(
            _impact_percent(wind_fuel_tonnes, total_fuel_tonnes) if has_wind else None
        ),
        wave_impact_percent=(
            _impact_percent(wave_fuel_tonnes, total_fuel_tonnes) if has_wave else None
        ),
        weather_impact_percent=(
            _impact_percent(adjusted_fuel_tonnes, total_fuel_tonnes)
            if (has_wind or has_wave)
            else None
        ),
    )


def _weather_penalties(
    sample: PerformanceSample, settings: Settings
) -> tuple[float | None, float | None]:
    """Return additive fuel-rate penalties from wind and waves along the heading.

    A positive penalty (headwind or head sea) increases fuel; a negative penalty
    (following wind or sea) reduces it. Provider directions report where the
    field comes FROM, so the along-heading component is negated accordingly.
    """
    wind_along = _along_heading(
        sample.wind_speed_knots, sample.wind_direction_deg, sample.heading_deg
    )
    wave_along = _along_heading(
        sample.wave_height_m, sample.wave_direction_deg, sample.heading_deg
    )
    wind_penalty = (
        None if wind_along is None else -wind_along * settings.weather_impact_wind_per_knot
    )
    wave_penalty = (
        None if wave_along is None else -wave_along * settings.weather_impact_wave_per_metre
    )
    return wind_penalty, wave_penalty


def _along_heading(
    magnitude: float | None, direction_from_deg: float | None, heading_deg: float | None
) -> float | None:
    """Project a provider vector (reported as direction FROM) onto the heading.

    Positive means the vector pushes along the heading (following); negative means
    it opposes the heading (head-on).
    """
    if magnitude is None or direction_from_deg is None or heading_deg is None:
        return None
    blowing_toward_rad = math.radians(direction_from_deg + 180.0)
    heading_rad = math.radians(heading_deg)
    return magnitude * math.cos(blowing_toward_rad - heading_rad)


def _clamp_factor(factor: float, settings: Settings) -> float:
    return max(
        settings.weather_impact_min_factor,
        min(settings.weather_impact_max_factor, factor),
    )


def _impact_percent(adjusted: float, base: float) -> float | None:
    if base <= 0:
        return None
    return (adjusted - base) / base * 100.0


def _mean(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)
