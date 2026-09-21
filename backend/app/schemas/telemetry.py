from datetime import datetime

from pydantic import BaseModel


class TelemetryRecordResponse(BaseModel):
    timestamp: datetime
    latitude_deg: float
    longitude_deg: float
    sog_knots: float
    course_deg: float | None
    heading_deg: float | None
    estimated_rpm: float
    estimated_fuel_tpd: float
    stw_knots: float | None = None
    stw_source: str | None = None
    current_along_heading_knots: float | None = None
    wind_speed_knots: float | None = None
    wind_direction_deg: float | None = None
    wave_height_m: float | None = None
    wave_direction_deg: float | None = None
    wave_period_s: float | None = None
    current_speed_knots: float | None = None
    current_direction_deg: float | None = None
    weather_factor: float | None = None
    metrics: dict[str, float]
    missing_fields: list[str]


class TelemetryResponse(BaseModel):
    imo: str
    start: datetime | None
    end: datetime | None
    records: list[TelemetryRecordResponse]
