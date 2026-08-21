"""Synchronous pyodbc access layer.

Design: one pyodbc connection per request (see get_db dependency in deps.py),
relying on pyodbc's own connection pooling (pyodbc.pooling = True) plus
FastAPI's threadpool for sync endpoints/dependencies. No ORM, no async
DB drivers.

exec_sp / query_view both return list[dict[str, Any]] built from
cursor.description, so callers (repositories) never touch pyodbc row objects
directly.

Every call emits one "sql call" log line (request_id is picked up
automatically by RequestIdFilter/the request_id contextvar) carrying `sp`
(procedure/view label) and `duration_ms`, via `_log_call`.

`exec_sp_output` exists because some SPs (sp_create_booking,
sp_create_availability_block, ...) do not do a final SELECT - they only
set a single `OUTPUT` parameter (e.g. `@reserva_id INT OUTPUT`). Plain
`exec_sp` has no way to read that back (cursor.description is None with no
result set), so this issues the EXEC plus a trailing `SELECT` of a
batch-local variable in one round trip.

`query_view` takes an optional `label` kwarg purely for logging (it never
calls a stored procedure, so there is no `name` to log otherwise).
"""

from __future__ import annotations

import logging
import time
from collections.abc import Generator, Mapping, Sequence
from typing import Any

import pyodbc

from app.config import Settings

pyodbc.pooling = True

logger = logging.getLogger("app.db")


class ConnectionFactory:
    """Builds pyodbc connections from Settings. One instance is created at
    app startup and handed to the get_db dependency."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def new_connection(self) -> pyodbc.Connection:
        return pyodbc.connect(self._settings.connection_string, autocommit=False)

    def ping(self) -> bool:
        """Used by GET /ready. Returns True if SELECT 1 succeeds."""
        conn = self.new_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            return True
        finally:
            conn.close()


def get_connection(factory: ConnectionFactory) -> Generator[pyodbc.Connection, None, None]:
    """Context-managed connection lifecycle for a single request."""
    conn = factory.new_connection()
    try:
        yield conn
    finally:
        conn.close()


def _rows_to_dicts(cursor: pyodbc.Cursor) -> list[dict[str, Any]]:
    if cursor.description is None:
        return []
    columns = [col[0] for col in cursor.description]
    return [dict(zip(columns, row, strict=True)) for row in cursor.fetchall()]


def exec_sp(
    conn: pyodbc.Connection,
    name: str,
    params: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Executes a stored procedure by name with named parameters and returns
    its result set (if any) as a list of dicts. Commits on success.

    `name` must always be a fixed string literal from the SP catalog -
    never build it from user input.
    """
    params = params or {}
    cursor = conn.cursor()
    started = time.perf_counter()
    try:
        placeholders = ", ".join(f"@{key}=?" for key in params)
        sql = f"EXEC {name} {placeholders}".strip()
        cursor.execute(sql, list(params.values()))
        rows = _rows_to_dicts(cursor)
        conn.commit()
        _log_call(name, started, status="ok")
        return rows
    except Exception:
        conn.rollback()
        _log_call(name, started, status="error")
        raise
    finally:
        cursor.close()


def exec_sp_output(
    conn: pyodbc.Connection,
    name: str,
    params: Mapping[str, Any],
    *,
    output_param: str,
    output_sql_type: str = "INT",
) -> Any:
    """Executes a stored procedure that reports its result through a single
    `OUTPUT` parameter (e.g. `sp_create_booking`'s `@reserva_id INT
    OUTPUT`) and returns that scalar value. Commits on success.

    pyodbc's `cursor.execute("EXEC sp @p=?", ...)` has no native way to bind
    and read back a T-SQL OUTPUT parameter, so this builds a small anonymous
    batch that declares a local variable, runs the EXEC against it, and
    selects it back - all in one statement/round trip:

        DECLARE @out INT;
        EXEC sp_x @p1=?, ..., @output_param=@out OUTPUT;
        SELECT @out AS output_param;

    `name` must always be a fixed string literal from the SP catalog - never
    build it from user input.
    """
    cursor = conn.cursor()
    started = time.perf_counter()
    try:
        input_placeholders = ", ".join(f"@{key}=?" for key in params)
        output_assignment = f"@{output_param}=@out OUTPUT"
        exec_args = ", ".join(part for part in (input_placeholders, output_assignment) if part)
        sql = (
            f"DECLARE @out {output_sql_type}; "
            f"EXEC {name} {exec_args}; "
            f"SELECT @out AS {output_param};"
        )
        cursor.execute(sql, list(params.values()))
        rows = _rows_to_dicts(cursor)
        conn.commit()
        _log_call(name, started, status="ok")
        return rows[0][output_param] if rows else None
    except Exception:
        conn.rollback()
        _log_call(name, started, status="error")
        raise
    finally:
        cursor.close()


def query_view(
    conn: pyodbc.Connection,
    sql: str,
    params: Sequence[Any] | None = None,
    *,
    label: str | None = None,
) -> list[dict[str, Any]]:
    """Executes a read-only parameterized SELECT (typically against one of
    the vw_* views) and returns the result set as a list of dicts.

    `label` identifies the view/table being queried purely for the "sql
    call" log line (this path never calls a stored procedure, so there is no
    `name` to log otherwise); it defaults to a generic tag when omitted.
    """
    cursor = conn.cursor()
    started = time.perf_counter()
    tag = label or "query_view"
    try:
        cursor.execute(sql, list(params) if params else [])
        rows = _rows_to_dicts(cursor)
        _log_call(tag, started, status="ok")
        return rows
    except Exception:
        _log_call(tag, started, status="error")
        raise
    finally:
        cursor.close()


def _log_call(sp: str, started: float, *, status: str) -> None:
    duration_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "sql call",
        extra={"sp": sp, "duration_ms": duration_ms, "status": status},
    )
