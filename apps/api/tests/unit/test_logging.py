"""Logging formatter tests: dev pipe-delimited line vs. JSON-per-line, both
carrying request_id, and the dev access-log line carrying `sp=`."""

from __future__ import annotations

import io
import json
import logging
from collections.abc import Callable

from app.logging_config import log_access


def test_dev_format_access_line_contains_request_id_and_sp(
    make_test_logger: Callable[[str], tuple[logging.Logger, io.StringIO]],
) -> None:
    logger, stream = make_test_logger("dev")

    log_access(
        logger,
        method="POST",
        path="/api/v1/bookings",
        sp="sp_crear_reservacion",
        duration_ms=42,
        status=201,
    )

    line = stream.getvalue().strip()
    assert "request_id=af31" in line
    assert "sp=sp_crear_reservacion" in line
    assert "POST /api/v1/bookings" in line
    assert "42ms" in line
    assert "201" in line


def test_dev_format_plain_message_line() -> None:
    from app.logging_config import DevFormatter

    record = logging.LogRecord(
        name="app.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="something happened",
        args=(),
        exc_info=None,
    )
    record.request_id = "af31"

    formatted = DevFormatter().format(record)

    assert "request_id=af31" in formatted
    assert "something happened" in formatted
    assert " | INFO | " in formatted


def test_json_format_is_parseable_and_has_expected_keys(
    make_test_logger: Callable[[str], tuple[logging.Logger, io.StringIO]],
) -> None:
    logger, stream = make_test_logger("json")

    log_access(
        logger,
        method="GET",
        path="/api/v1/services",
        sp="-",
        duration_ms=7,
        status=200,
    )

    line = stream.getvalue().strip()
    payload = json.loads(line)

    assert payload["level"] == "INFO"
    assert payload["request_id"] == "af31"
    assert payload["method"] == "GET"
    assert payload["path"] == "/api/v1/services"
    assert payload["sp"] == "-"
    assert payload["duration_ms"] == 7
    assert payload["status"] == 200
    assert "timestamp" in payload


def test_json_format_plain_message_has_no_access_fields(
    make_test_logger: Callable[[str], tuple[logging.Logger, io.StringIO]],
) -> None:
    logger, stream = make_test_logger("json")

    logger.info("plain message, no request context")

    payload = json.loads(stream.getvalue().strip())

    assert payload["message"] == "plain message, no request context"
    assert "method" not in payload
    assert "sp" not in payload
