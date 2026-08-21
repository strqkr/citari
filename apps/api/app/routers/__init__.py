"""15 API router modules, all mounted under /api/v1 by app/main.py, plus a
separate health module (GET /health, GET /ready) that needs no auth."""

from __future__ import annotations

from typing import NoReturn

from fastapi import HTTPException


def not_implemented() -> NoReturn:
    """Uniform 501 body for routes not backed by a real implementation."""
    raise HTTPException(status_code=501, detail="Not implemented yet")
