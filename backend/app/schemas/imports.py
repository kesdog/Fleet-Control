from enum import StrEnum

from pydantic import BaseModel, Field


class ImportStatus(StrEnum):
    UPLOADED = "UPLOADED"
    INSPECTED = "INSPECTED"
    MAPPED = "MAPPED"
    VALIDATED = "VALIDATED"
    ENRICHING = "ENRICHING"
    COMMITTED = "COMMITTED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class UploadedFileSummary(BaseModel):
    filename: str
    headers: list[str]
    delimiter: str
    row_count: int
    warnings: list[str]


class StartImportResponse(BaseModel):
    session_id: str
    status: ImportStatus
    files: list[UploadedFileSummary]


class ColumnPreview(BaseModel):
    source_column: str
    semantic_field: str | None
    detected_unit: str | None
    requires_unit_mapping: bool


class FilePreview(BaseModel):
    filename: str
    source_columns: list[str]
    columns: list[ColumnPreview]
    row_count: int
    timestamp_range: tuple[str, str] | None
    null_counts: dict[str, int]
    sample_rows: list[dict[str, str]]
    warnings: list[str]
    fields_requiring_confirmation: list[str]


class ImportPreviewResponse(BaseModel):
    session_id: str
    status: ImportStatus
    files: list[FilePreview]


class FileMapping(BaseModel):
    semantic_fields: dict[str, str] = Field(default_factory=dict)
    unit_overrides: dict[str, str] = Field(default_factory=dict)


class UpdateMappingRequest(BaseModel):
    files: dict[str, FileMapping]



class UpdateMappingResponse(BaseModel):
    session_id: str
    status: ImportStatus
    mapping: dict[str, FileMapping]


class ValidationIssueResponse(BaseModel):
    severity: str
    code: str
    message: str
    file: str | None = None
    column: str | None = None
    row_number: int | None = None


class ImportValidationResponse(BaseModel):
    session_id: str
    status: ImportStatus
    issues: list[ValidationIssueResponse]
    normalized_columns: dict[str, list[str]]
    estimated_metrics: list[str]
    rows_accepted: int
    rows_rejected: int


class CommitMode(StrEnum):
    CREATE = "CREATE"
    REPLACE = "REPLACE"


class CommitImportRequest(BaseModel):
    imo: str = Field(min_length=1, max_length=32)
    name: str | None = Field(default=None, max_length=255)
    mode: CommitMode


class CommitImportResponse(BaseModel):
    session_id: str
    status: ImportStatus
    imo: str
    samples_imported: int


class ImportProgressResponse(BaseModel):
    session_id: str
    status: ImportStatus
    imo: str | None
    enrichment_days_completed: int
    enrichment_days_total: int
