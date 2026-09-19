from datetime import datetime

from pydantic import BaseModel


class MetricResponse(BaseModel):
    key: str
    label: str
    unit: str
    origin: str
    source_column: str | None
    formula: str | None
    based_on: list[str]
    warning: str | None


class VesselSummaryResponse(BaseModel):
    imo: str
    name: str | None
    start: datetime | None
    end: datetime | None
    sample_count: int
    available_metrics: list[str]


class VesselResponse(VesselSummaryResponse):
    metrics: list[MetricResponse]
