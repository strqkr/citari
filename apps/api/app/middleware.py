"""Request-scoped context: generates/propagates X-Request-ID and emits the
one-line access log for every request via app.logging_config.log_access."""

from __future__ import annotations

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.logging_config import log_access, request_id_var

logger = logging.getLogger("app.access")

REQUEST_ID_HEADER = "X-Request-ID"


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        incoming = request.headers.get(REQUEST_ID_HEADER)
        req_id = incoming if incoming else uuid.uuid4().hex[:12]
        token = request_id_var.set(req_id)
        request.state.request_id = req_id
        request.state.sp = "-"

        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = int((time.perf_counter() - start) * 1000)
            log_access(
                logger,
                method=request.method,
                path=request.url.path,
                sp=getattr(request.state, "sp", "-"),
                duration_ms=duration_ms,
                status=500,
            )
            request_id_var.reset(token)
            raise

        duration_ms = int((time.perf_counter() - start) * 1000)
        response.headers[REQUEST_ID_HEADER] = req_id
        log_access(
            logger,
            method=request.method,
            path=request.url.path,
            sp=getattr(request.state, "sp", "-"),
            duration_ms=duration_ms,
            status=response.status_code,
        )
        request_id_var.reset(token)
        return response
