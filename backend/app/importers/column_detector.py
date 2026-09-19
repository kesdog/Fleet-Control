import re
from dataclasses import dataclass
from enum import StrEnum


class SemanticField(StrEnum):
    TIMESTAMP = "timestamp"
    LATITUDE = "latitude"
    LONGITUDE = "longitude"
    SOG = "sog"
    COURSE = "course"
    HEADING = "heading"


@dataclass(frozen=True)
class DetectedColumn:
    source_column: str
    semantic_field: SemanticField | None
    detected_unit: str | None
    requires_unit_mapping: bool


_UNIT_PATTERN = re.compile(r"\[([^\]]+)\]")


def extract_unit(column_name: str) -> str | None:
    match = _UNIT_PATTERN.search(column_name)
    return match.group(1).strip() if match else None


def detect_columns(headers: tuple[str, ...]) -> tuple[DetectedColumn, ...]:
    return tuple(detect_column(header) for header in headers)


def detect_column(header: str) -> DetectedColumn:
    normalized = _normalized_header(header)
    semantic_field = _detect_semantic_field(normalized)
    unit = extract_unit(header)
    return DetectedColumn(
        source_column=header,
        semantic_field=semantic_field,
        detected_unit=unit,
        requires_unit_mapping=semantic_field is SemanticField.SOG and unit is None,
    )


def _normalized_header(header: str) -> str:
    without_metadata = re.sub(r"\[[^\]]*\]|\([^)]*\)", "", header.lower())
    return re.sub(r"[^a-z0-9]+", " ", without_metadata).strip()


def _detect_semantic_field(header: str) -> SemanticField | None:
    words = set(header.split())
    if "timestamp" in words or {"date", "time"}.issubset(words):
        return SemanticField.TIMESTAMP
    if "latitude" in words or "lat" in words:
        return SemanticField.LATITUDE
    if "longitude" in words or "lon" in words or "lng" in words:
        return SemanticField.LONGITUDE
    if "sog" in words or "speed" in words:
        return SemanticField.SOG
    if "course" in words or "cog" in words:
        return SemanticField.COURSE
    if "heading" in words or "hdg" in words:
        return SemanticField.HEADING
    return None
