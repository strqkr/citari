"""Shared fixtures for the unit test suite. No database access anywhere here
(unit tests are pure/in-process only)."""

from __future__ import annotations

import io
import logging
from collections.abc import Callable, Iterator

import pytest

from app.logging_config import DevFormatter, JsonFormatter, RequestIdFilter, request_id_var


@pytest.fixture(autouse=True)
def _reset_request_id() -> Iterator[None]:
    token = request_id_var.set("af31")
    yield
    request_id_var.reset(token)


@pytest.fixture
def make_test_logger() -> Callable[[str], tuple[logging.Logger, io.StringIO]]:
    """Builds an isolated logger (not the root logger, so it can't collide
    with other tests) wired to the real Dev/Json formatter + RequestIdFilter,
    writing to an in-memory buffer we can assert against."""

    created: list[logging.Logger] = []

    def _factory(log_format: str) -> tuple[logging.Logger, io.StringIO]:
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        handler.addFilter(RequestIdFilter())
        handler.setFormatter(DevFormatter() if log_format == "dev" else JsonFormatter())

        logger = logging.getLogger(f"test.logging.{log_format}.{id(stream)}")
        logger.setLevel(logging.INFO)
        logger.propagate = False
        logger.handlers = [handler]
        created.append(logger)
        return logger, stream

    yield _factory

    for logger in created:
        logger.handlers.clear()


@pytest.fixture
def jwt_secret() -> str:
    return "unit-test-secret-please-do-not-use-in-prod-32bytes"
