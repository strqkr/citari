"""Single logging setup point for the whole app. Nobody in app/ should call
print(); every module gets its logger via logging.getLogger(__name__) after
setup_logging() has run once (called from the app factory in main.py).

Two formats, selected by settings.log_format:

  dev  -> "2026-07-11 14:32:05 | INFO | request_id=af31 | POST /api/v1/bookings | sp=sp_create_booking | 42ms | 201"
  json (default) -> one JSON object per line with timestamp, level, request_id,
                     method, path, sp, duration_ms, status.

request_id is propagated via a contextvar set by the request-id middleware
(app/middleware.py) so every log line emitted while handling a request carries
it automatically, and it is reused as the "traceId" of RFC 7807 error bodies.

PROHIBITED: never log passwords, password hashes, tokens, or request/response
bodies that may contain PII. Only IDs.
"""

from __future__ import annotations

import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

_ACCESS_LOG_FIELDS = ("method", "path", "sp", "duration_ms", "status")


class RequestIdFilter(logging.Filter):
    """Stamps every log record with the current request id (or "-")."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = request_id_var.get()
        return True


class DevFormatter(logging.Formatter):
    """Human-readable pipe-delimited line for local development."""

    def format(self, record: logging.LogRecord) -> str:
        timestamp = datetime.fromtimestamp(record.created, tz=UTC).strftime("%Y-%m-%d %H:%M:%S")
        request_id = getattr(record, "request_id", "-")
        parts = [timestamp, record.levelname, f"request_id={request_id}"]

        is_access_log = any(hasattr(record, field) for field in _ACCESS_LOG_FIELDS)
        if is_access_log:
            method = getattr(record, "method", "-")
            path = getattr(record, "path", "-")
            sp = getattr(record, "sp", "-")
            duration_ms = getattr(record, "duration_ms", "-")
            status = getattr(record, "status", "-")
            parts.append(f"{method} {path}")
            parts.append(f"sp={sp}")
            parts.append(f"{duration_ms}ms")
            parts.append(str(status))
        else:
            parts.append(record.getMessage())

        return " | ".join(parts)


class JsonFormatter(logging.Formatter):
    """One JSON object per line, for production log aggregation."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "request_id": getattr(record, "request_id", "-"),
            "message": record.getMessage(),
        }
        for field in _ACCESS_LOG_FIELDS:
            if hasattr(record, field):
                payload[field] = getattr(record, field)
        return json.dumps(payload, ensure_ascii=False)


def setup_logging(log_format: str) -> None:
    """Configures the root logger exactly once. Safe to call multiple times
    (e.g. in tests): it replaces any handlers it previously installed."""
    root = logging.getLogger()
    root.setLevel(logging.INFO)

    for handler in list(root.handlers):
        if getattr(handler, "_citari_handler", False):
            root.removeHandler(handler)

    handler = logging.StreamHandler(stream=sys.stdout)
    handler._citari_handler = True  # type: ignore[attr-defined]
    handler.addFilter(RequestIdFilter())

    if log_format == "dev":
        handler.setFormatter(DevFormatter())
    else:
        handler.setFormatter(JsonFormatter())

    root.addHandler(handler)


def log_access(
    logger: logging.Logger,
    *,
    method: str,
    path: str,
    sp: str,
    duration_ms: int,
    status: int,
) -> None:
    """Emits the one-line-per-request access log entry."""
    logger.info(
        "request completed",
        extra={
            "method": method,
            "path": path,
            "sp": sp,
            "duration_ms": duration_ms,
            "status": status,
        },
    )
