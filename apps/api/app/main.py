"""FastAPI app factory: CORS, logging, request-id middleware, exception
handlers (RFC 7807 envelope), and router registration under /api/v1.
"""

from __future__ import annotations

import json
import logging
from http import HTTPStatus

import pyodbc
from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler as _default_http_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.db import ConnectionFactory
from app.errors import DomainError, ProblemDetail, domain_error_from_pyodbc_message
from app.logging_config import request_id_var, setup_logging
from app.middleware import RequestContextMiddleware

logger = logging.getLogger(__name__)

API_PREFIX = "/api/v1"


def _problem_response(status_code: int, title: str, detail: str) -> JSONResponse:
    problem = ProblemDetail(
        type="about:blank",
        title=title,
        status=status_code,
        detail=detail,
        trace_id=request_id_var.get(),
    )
    return JSONResponse(status_code=status_code, content=problem.to_dict())


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.log_format)

    app = FastAPI(title="Citari API", version="0.1.0")

    app.state.db_factory = ConnectionFactory(settings)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestContextMiddleware)

    @app.exception_handler(DomainError)
    async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
        return _problem_response(exc.status, exc.title, exc.detail)

    @app.exception_handler(pyodbc.Error)
    async def pyodbc_error_handler(request: Request, exc: pyodbc.Error) -> JSONResponse:
        message = str(exc.args[1]) if len(exc.args) > 1 else str(exc)
        domain_exc = domain_error_from_pyodbc_message(message)
        logger.error("database error", extra={"sql_error_number": domain_exc.sql_error_number})
        return _problem_response(domain_exc.status, domain_exc.title, domain_exc.detail)

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        if isinstance(exc.detail, dict):
            return await _default_http_exception_handler(request, exc)
        try:
            title = HTTPStatus(exc.status_code).phrase
        except ValueError:
            title = "Error"
        return _problem_response(exc.status_code, title, str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # `str(exc.errors())` is a Python repr (single-quoted, tuples for
        # `loc`) - not valid JSON, inconsistent with the RFC 7807 envelope
        # used everywhere else. `default=str` guards against any
        # non-serializable value a custom validator's `ctx` might carry.
        detail = json.dumps(exc.errors(), default=str)
        return _problem_response(422, "Unprocessable Entity", detail)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled exception")
        return _problem_response(500, "Internal Server Error", "An unexpected error occurred")

    _register_routers(app)
    return app


def _register_routers(app: FastAPI) -> None:
    from app.routers import (
        admin,
        audit_logs,
        auth,
        availability_blocks,
        bookings,
        business_hours,
        business_types,
        customers,
        health,
        locations,
        public,
        reports,
        service_categories,
        services,
        tenant,
        track,
    )

    app.include_router(health.router)
    app.include_router(auth.router, prefix=API_PREFIX)
    app.include_router(admin.router, prefix=API_PREFIX)
    app.include_router(tenant.router, prefix=API_PREFIX)
    app.include_router(business_types.router, prefix=API_PREFIX)
    app.include_router(service_categories.router, prefix=API_PREFIX)
    app.include_router(services.router, prefix=API_PREFIX)
    app.include_router(locations.router, prefix=API_PREFIX)
    app.include_router(business_hours.router, prefix=API_PREFIX)
    app.include_router(availability_blocks.router, prefix=API_PREFIX)
    app.include_router(customers.router, prefix=API_PREFIX)
    app.include_router(bookings.router, prefix=API_PREFIX)
    app.include_router(reports.router, prefix=API_PREFIX)
    app.include_router(audit_logs.router, prefix=API_PREFIX)
    app.include_router(public.router, prefix=API_PREFIX)
    app.include_router(track.router, prefix=API_PREFIX)


app = create_app()
