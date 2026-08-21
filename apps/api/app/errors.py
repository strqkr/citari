"""Domain error hierarchy and SQL-error-number mapping.

The stored procedures raise THROW with a numeric error code in a fixed range:

    50001-50019 -> 400 Bad Request   (validation / bad input)
    50020-50039 -> 404 Not Found     (missing aggregate)
    50040-50059 -> 409 Conflict      (business rule / state conflict)
    anything else (or a plain pyodbc.Error we cannot parse) -> 500

The HTTP error body follows RFC 7807 (application/problem+json):

    {"type": "...", "title": "...", "status": 404, "detail": "...", "traceId": "..."}
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_SQL_ERROR_NUMBER_RE = re.compile(r"\((\d{5})\)")
# Leading ODBC driver preamble, e.g. "[42000] [Microsoft][ODBC Driver 18 for
# SQL Server][SQL Server]" prefixing the actual THROW message: strips it so
# `detail` carries only the business message, not driver internals.
_ODBC_PREAMBLE_RE = re.compile(r"^(?:\[[^\]]*\]\s*)+")

BAD_REQUEST_RANGE = range(50001, 50020)
NOT_FOUND_RANGE = range(50020, 50040)
CONFLICT_RANGE = range(50040, 50060)


class DomainError(Exception):
    """Base class for all errors that carry an HTTP status + RFC 7807 fields."""

    status: int = 500
    title: str = "Internal Server Error"
    type_: str = "about:blank"

    def __init__(self, detail: str, *, sql_error_number: int | None = None) -> None:
        super().__init__(detail)
        self.detail = detail
        self.sql_error_number = sql_error_number


class BadRequestError(DomainError):
    status = 400
    title = "Bad Request"


class NotFoundError(DomainError):
    status = 404
    title = "Not Found"


class ConflictError(DomainError):
    status = 409
    title = "Conflict"


class InternalError(DomainError):
    status = 500
    title = "Internal Server Error"


@dataclass(frozen=True)
class ProblemDetail:
    type: str
    title: str
    status: int
    detail: str
    trace_id: str

    def to_dict(self) -> dict[str, object]:
        return {
            "type": self.type,
            "title": self.title,
            "status": self.status,
            "detail": self.detail,
            "traceId": self.trace_id,
        }


def error_class_for_sql_number(number: int) -> type[DomainError]:
    """Maps a SQL Server THROW error number to a DomainError subclass."""
    if number in BAD_REQUEST_RANGE:
        return BadRequestError
    if number in NOT_FOUND_RANGE:
        return NotFoundError
    if number in CONFLICT_RANGE:
        return ConflictError
    return InternalError


def extract_sql_error_number(message: str) -> int | None:
    """Extracts a 5-digit custom error number (e.g. 50005) embedded in a
    pyodbc/ODBC driver error message such as:

        "[42000] [Microsoft][ODBC Driver 18 for SQL Server][SQL Server]
         Service not found (50025) (SQLExecDirectW)"

    Returns None if no such number is present (i.e. not one of our custom
    THROW codes -> caller should treat it as an unmapped 500).
    """
    match = _SQL_ERROR_NUMBER_RE.search(message)
    if match is None:
        return None
    number = int(match.group(1))
    if number < 50000 or number > 59999:
        return None
    return number


def domain_error_from_pyodbc_message(message: str) -> DomainError:
    """Builds the right DomainError subclass from a raw pyodbc error message."""
    number = extract_sql_error_number(message)
    detail = _ODBC_PREAMBLE_RE.sub("", message).strip() or message
    if number is None:
        return InternalError(detail)
    error_cls = error_class_for_sql_number(number)
    return error_cls(detail, sql_error_number=number)
