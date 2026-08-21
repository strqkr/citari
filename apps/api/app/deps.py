"""Shared FastAPI dependencies: DB connection-per-request and JWT auth guards.

CurrentOwner / CurrentSuperadmin / CurrentUser are Annotated dependency
aliases (the "Annotated[..., Depends(...)]" pattern) that routers use as
parameter type hints, e.g.:

    @router.get("/bookings")
    def list_bookings(owner: CurrentOwner) -> ...:
        ...

CurrentOwner and CurrentSuperadmin additionally enforce the matching role;
CurrentUser (used by GET /auth/me) accepts either role. INVARIANT:
the tenant/dominio_id a router acts on always comes from CurrentOwner's
`tenantId` JWT claim - it is never read from the request path/body/query.
"""

from __future__ import annotations

from collections.abc import Generator
from typing import Annotated

import pyodbc
from fastapi import Depends, Header, HTTPException, Request

from app.config import Settings, get_settings
from app.db import ConnectionFactory, get_connection
from app.security import TokenError, TokenPayload, decode_access_token


def get_db(request: Request) -> Generator[pyodbc.Connection, None, None]:
    """Yields a pyodbc connection scoped to the current request, taken from
    the ConnectionFactory stored on app.state at startup (see main.py)."""
    factory: ConnectionFactory = request.app.state.db_factory
    yield from get_connection(factory)


DbConnection = Annotated[pyodbc.Connection, Depends(get_db)]


def _decode_bearer_token(authorization: str | None, settings: Settings) -> TokenPayload:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        return decode_access_token(
            token, secret=settings.jwt_secret, algorithm=settings.jwt_algorithm
        )
    except TokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


def get_current_owner(
    *,
    authorization: Annotated[str | None, Header()] = None,
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenPayload:
    payload = _decode_bearer_token(authorization, settings)
    if payload.role != "owner":
        raise HTTPException(status_code=403, detail="owner role required")
    if payload.tenant_id is None:
        # Defense in depth: create_access_token always stamps tenantId for
        # role "owner", so this only fires for a hand-crafted/malformed
        # token - never trust a request-supplied tenant id as a fallback.
        raise HTTPException(status_code=401, detail="token missing tenantId claim")
    return payload


def get_current_superadmin(
    *,
    authorization: Annotated[str | None, Header()] = None,
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenPayload:
    payload = _decode_bearer_token(authorization, settings)
    if payload.role != "superadmin":
        raise HTTPException(status_code=403, detail="superadmin role required")
    return payload


def get_current_user(
    *,
    authorization: Annotated[str | None, Header()] = None,
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenPayload:
    """Accepts either role - used by GET /auth/me, which reports on whoever
    the token belongs to instead of requiring a specific role."""
    return _decode_bearer_token(authorization, settings)


CurrentOwner = Annotated[TokenPayload, Depends(get_current_owner)]
CurrentSuperadmin = Annotated[TokenPayload, Depends(get_current_superadmin)]
CurrentUser = Annotated[TokenPayload, Depends(get_current_user)]
