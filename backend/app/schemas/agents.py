from datetime import datetime

from pydantic import BaseModel

from app.schemas.performance import PerformanceResponse
from app.schemas.vessels import MetricResponse


class AgentAppContextResponse(BaseModel):
    name: str
    purpose: str
    data_source: str
    access: str


class AgentDataQualityResponse(BaseModel):
    missing_field_counts: dict[str, int]
    records_with_environment: int
    records_without_environment: int
    measured_metric_count: int
    estimated_metric_count: int


class AgentVesselReportResponse(BaseModel):
    imo: str
    name: str | None
    available_start: datetime
    available_end: datetime
    start: datetime
    end: datetime
    sample_count: int
    metrics: list[MetricResponse]
    data_quality: AgentDataQualityResponse
    performance: PerformanceResponse


class AgentReportResponse(BaseModel):
    app: AgentAppContextResponse
    reports: list[AgentVesselReportResponse]


class AgentExampleResponse(BaseModel):
    purpose: str
    request: str
    notes: str


class AgentDocumentationResponse(BaseModel):
    app: AgentAppContextResponse
    discovery_endpoint: str
    report_endpoint: str
    openapi_endpoint: str
    examples: list[AgentExampleResponse]
