"""GET /health and GET /ready - both exempt from auth (see app/main.py)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request, Response, status

from app.db import ConnectionFactory

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """Process liveness only - never touches the database."""
    return {"status": "ok"}


@router.get("/ready")
def ready(request: Request, response: Response) -> dict[str, str]:
    """Readiness: runs SELECT 1 against SQL Server. 503 if it fails."""
    factory: ConnectionFactory = request.app.state.db_factory
    try:
        factory.ping()
    except Exception:
        logger.warning("readiness check failed")
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "unavailable"}
    return {"status": "ok"}
