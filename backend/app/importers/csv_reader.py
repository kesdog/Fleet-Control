import csv
from dataclasses import dataclass
from pathlib import Path

from app.importers.column_detector import DetectedColumn, SemanticField, detect_columns


@dataclass(frozen=True)
class CsvInspection:
    delimiter: str
    headers: tuple[str, ...]
    rows: tuple[dict[str, str], ...]
    columns: tuple[DetectedColumn, ...]
    numeric_columns: tuple[str, ...]
    timestamp_columns: tuple[str, ...]

    @property
    def row_count(self) -> int:
        return len(self.rows)


class CsvReadError(ValueError):
    """Raised when a source cannot be read as a headered CSV file."""


def inspect_csv(path: Path) -> CsvInspection:
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        sample = source.read(8192)
        source.seek(0)
        # Inspect a small prefix so semicolon and tab exports work without caller configuration.
        delimiter = detect_delimiter(sample)
        reader = csv.DictReader(source, delimiter=delimiter)
        if reader.fieldnames is None or not all(reader.fieldnames):
            raise CsvReadError("CSV input must include a complete header row.")

        headers = tuple(reader.fieldnames)
        rows = tuple(
            {key: value or "" for key, value in row.items() if key is not None} for row in reader
        )

    columns = detect_columns(headers)
    return CsvInspection(
        delimiter=delimiter,
        headers=headers,
        rows=rows,
        columns=columns,
        numeric_columns=_numeric_columns(headers, rows),
        timestamp_columns=tuple(
            column.source_column
            for column in columns
            if column.semantic_field is SemanticField.TIMESTAMP
        ),
    )


def detect_delimiter(sample: str) -> str:
    if not sample.strip():
        raise CsvReadError("CSV input is empty.")
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        return ","


def _numeric_columns(headers: tuple[str, ...], rows: tuple[dict[str, str], ...]) -> tuple[str, ...]:
    numeric: list[str] = []
    for header in headers:
        values = [row[header].strip() for row in rows if row[header].strip()]
        # A column is numeric only when every populated value can be parsed as a float.
        if values and all(_is_float(value) for value in values):
            numeric.append(header)
    return tuple(numeric)


def _is_float(value: str) -> bool:
    try:
        float(value)
    except ValueError:
        return False
    return True
