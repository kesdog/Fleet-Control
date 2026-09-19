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
    metrics: dict[str, float]
    missing_fields: list[str]


class TelemetryResponse(BaseModel):
    imo: str
    start: datetime | None
    end: datetime | None
    records: list[TelemetryRecordResponse]
