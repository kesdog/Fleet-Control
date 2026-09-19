from datetime import datetime

from pydantic import BaseModel

from app.schemas.vessels import MetricResponse


class TrajectoryPointResponse(BaseModel):
    timestamp: datetime
    latitude_deg: float
    longitude_deg: float
    metric_value: float | None
    missing: bool


class TrajectoryResponse(BaseModel):
    imo: str
    metric: MetricResponse
    start: datetime | None
    end: datetime | None
    segments: list[list[TrajectoryPointResponse]]


class SeriesPointResponse(BaseModel):
    timestamp: datetime
    value: float | None
    missing: bool


class SeriesResponse(BaseModel):
    imo: str
    metric: MetricResponse
    start: datetime | None
    end: datetime | None
    points: list[SeriesPointResponse]
