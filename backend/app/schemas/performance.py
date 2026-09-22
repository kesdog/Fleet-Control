from datetime import datetime

from pydantic import BaseModel


class WeatherSummaryResponse(BaseModel):
    mean_wave_height_m: float | None
    max_wave_height_m: float | None
    mean_weather_factor: float | None


class WeatherImpactResponse(BaseModel):
    adjusted_fuel_tonnes: float
    adjusted_fuel_cost: float
    wind_percent: float | None
    wave_percent: float | None
    total_percent: float | None
    model: str
    warning: str


class PerformanceResponse(BaseModel):
    imo: str
    start: datetime | None
    end: datetime | None
    distance_nm: float
    fuel_tonnes: float
    fuel_cost: float
    fuel_currency: str
    fuel_efficiency_nm_per_tonne: float | None
    fuel_consumption_t_per_100nm: float | None
    fuel_cost_per_nm: float | None
    weather: WeatherSummaryResponse
    weather_impact: WeatherImpactResponse
    observed_duration_seconds: float
    unobserved_duration_seconds: float
    coverage_percent: float | None


class EnvironmentPointResponse(BaseModel):
    timestamp: datetime
    wind_speed_knots: float | None
    wind_direction_deg: float | None
    wave_height_m: float | None
    wave_direction_deg: float | None
    wave_period_s: float | None
    current_speed_knots: float | None
    current_direction_deg: float | None
    weather_factor: float | None
    missing: bool


class EnvironmentResponse(BaseModel):
    imo: str
    start: datetime | None
    end: datetime | None
    records: list[EnvironmentPointResponse]
