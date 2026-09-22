"""Durable, metadata-only audit records for import lifecycle operations."""

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock

_logger = logging.getLogger(__name__)
_write_lock = Lock()
_LOG_NAME = "import-audit.jsonl"


def log_import_event(
    logs_directory: Path,
    event: str,
    *,
    session_id: str | None = None,
    status: str | None = None,
    code: str | None = None,
) -> None:
    """Append a non-sensitive lifecycle record; logging failures never break imports."""
    record = {
        "timestamp": datetime.now(UTC).isoformat(),
        "event": event,
        **({"session_id": session_id} if session_id else {}),
        **({"status": status} if status else {}),
        **({"code": code} if code else {}),
    }
    try:
        logs_directory.mkdir(parents=True, exist_ok=True)
        with _write_lock, (logs_directory / _LOG_NAME).open("a", encoding="utf-8") as log_file:
            log_file.write(json.dumps(record, separators=(",", ":")) + "\n")
        _logger.debug("import audit event=%s session_id=%s", event, session_id)
    except OSError:
        _logger.error("Unable to persist import audit event=%s", event, exc_info=True)


def log_import_error(
    logs_directory: Path, operation: str, error: Exception, session_id: str | None = None
) -> None:
    """Record operational failures without exception text, rows, filenames, or payloads."""
    log_import_event(logs_directory, "operational_error", session_id=session_id, code=operation)
    _logger.error(
        "Import operation failed operation=%s session_id=%s type=%s",
        operation,
        session_id,
        type(error).__name__,
    )
