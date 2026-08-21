"""DomainError hierarchy + SQL error-number range mapping.

50001-50019 -> 400, 50020-50039 -> 404, 50040-50059 -> 409, else -> 500.
"""

from __future__ import annotations

import pytest

from app.errors import (
    BadRequestError,
    ConflictError,
    InternalError,
    NotFoundError,
    domain_error_from_pyodbc_message,
    error_class_for_sql_number,
    extract_sql_error_number,
)


@pytest.mark.parametrize(
    ("number", "expected_cls"),
    [
        (50001, BadRequestError),
        (50005, BadRequestError),
        (50019, BadRequestError),
        (50020, NotFoundError),
        (50025, NotFoundError),
        (50039, NotFoundError),
        (50040, ConflictError),
        (50045, ConflictError),
        (50059, ConflictError),
        (50060, InternalError),
        (49999, InternalError),
        (99999, InternalError),
    ],
)
def test_error_class_for_sql_number(number: int, expected_cls: type) -> None:
    assert error_class_for_sql_number(number) is expected_cls


def test_bad_request_status_code() -> None:
    assert BadRequestError("bad").status == 400


def test_not_found_status_code() -> None:
    assert NotFoundError("missing").status == 404


def test_conflict_status_code() -> None:
    assert ConflictError("conflict").status == 409


def test_internal_status_code() -> None:
    assert InternalError("boom").status == 500


def test_extract_sql_error_number_from_driver_message() -> None:
    message = (
        "[42000] [Microsoft][ODBC Driver 18 for SQL Server][SQL Server]"
        "Servicio no encontrado (50025) (SQLExecDirectW)"
    )
    assert extract_sql_error_number(message) == 50025


def test_extract_sql_error_number_returns_none_when_absent() -> None:
    message = "[42000] [Microsoft][ODBC Driver 18 for SQL Server][SQL Server]Generic failure"
    assert extract_sql_error_number(message) is None


def test_domain_error_from_pyodbc_message_maps_to_400() -> None:
    message = "Datos invalidos (50005) (SQLExecDirectW)"
    exc = domain_error_from_pyodbc_message(message)
    assert isinstance(exc, BadRequestError)
    assert exc.status == 400
    assert exc.sql_error_number == 50005


def test_domain_error_from_pyodbc_message_maps_to_404() -> None:
    message = "Reservacion no encontrada (50025) (SQLExecDirectW)"
    exc = domain_error_from_pyodbc_message(message)
    assert isinstance(exc, NotFoundError)
    assert exc.status == 404
    assert exc.sql_error_number == 50025


def test_domain_error_from_pyodbc_message_maps_to_409() -> None:
    message = "Bloque ya reservado (50045) (SQLExecDirectW)"
    exc = domain_error_from_pyodbc_message(message)
    assert isinstance(exc, ConflictError)
    assert exc.status == 409
    assert exc.sql_error_number == 50045


def test_domain_error_from_pyodbc_message_unmapped_defaults_to_500() -> None:
    message = "Deadlock victim (1205) (SQLExecDirectW)"
    exc = domain_error_from_pyodbc_message(message)
    assert isinstance(exc, InternalError)
    assert exc.status == 500
    assert exc.sql_error_number is None
