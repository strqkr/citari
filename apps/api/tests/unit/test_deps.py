"""Unit tests for app.deps's JWT auth guards: CurrentOwner /
CurrentSuperadmin / CurrentUser. Pure in-process - no TestClient, no DB;
calls the dependency functions directly the same way FastAPI would after
resolving `authorization`/`settings`.
"""

from __future__ import annotations

import jwt as pyjwt
import pytest
from fastapi import HTTPException

from app.config import Settings
from app.deps import get_current_owner, get_current_superadmin, get_current_user
from app.security import create_access_token


@pytest.fixture
def settings(jwt_secret: str) -> Settings:
    return Settings(jwt_secret=jwt_secret)


def _bearer(token: str) -> str:
    return f"Bearer {token}"


def test_get_current_owner_accepts_valid_owner_token(settings: Settings) -> None:
    token = create_access_token(sub="1", role="owner", tenant_id=42, secret=settings.jwt_secret)

    payload = get_current_owner(authorization=_bearer(token), settings=settings)

    assert payload.role == "owner"
    assert payload.tenant_id == 42


def test_get_current_owner_rejects_missing_token(settings: Settings) -> None:
    with pytest.raises(HTTPException) as exc_info:
        get_current_owner(authorization=None, settings=settings)

    assert exc_info.value.status_code == 401


def test_get_current_owner_rejects_garbage_token(settings: Settings) -> None:
    with pytest.raises(HTTPException) as exc_info:
        get_current_owner(authorization=_bearer("not-a-real-jwt"), settings=settings)

    assert exc_info.value.status_code == 401


def test_get_current_owner_rejects_expired_token(settings: Settings) -> None:
    token = pyjwt.encode(
        {"sub": "1", "role": "owner", "tenantId": 1, "exp": 0},
        settings.jwt_secret,
        algorithm="HS256",
    )

    with pytest.raises(HTTPException) as exc_info:
        get_current_owner(authorization=_bearer(token), settings=settings)

    assert exc_info.value.status_code == 401


def test_get_current_owner_rejects_superadmin_token(settings: Settings) -> None:
    token = create_access_token(
        sub="9", role="superadmin", tenant_id=None, secret=settings.jwt_secret
    )

    with pytest.raises(HTTPException) as exc_info:
        get_current_owner(authorization=_bearer(token), settings=settings)

    assert exc_info.value.status_code == 403


def test_get_current_owner_rejects_owner_token_missing_tenant_id(settings: Settings) -> None:
    """Defense in depth: create_access_token always stamps tenantId for role
    owner, but a hand-crafted token might omit it - the tenant scope must
    never fall back to anything request-supplied."""
    token = pyjwt.encode(
        {"sub": "1", "role": "owner", "exp": 9999999999},
        settings.jwt_secret,
        algorithm="HS256",
    )

    with pytest.raises(HTTPException) as exc_info:
        get_current_owner(authorization=_bearer(token), settings=settings)

    assert exc_info.value.status_code == 401


def test_get_current_superadmin_accepts_valid_superadmin_token(settings: Settings) -> None:
    token = create_access_token(
        sub="5", role="superadmin", tenant_id=None, secret=settings.jwt_secret
    )

    payload = get_current_superadmin(authorization=_bearer(token), settings=settings)

    assert payload.role == "superadmin"


def test_get_current_superadmin_rejects_owner_token(settings: Settings) -> None:
    """An owner token used against a route that requires superadmin must
    403 - no such route exists yet, so this exercises the guard directly."""
    token = create_access_token(sub="1", role="owner", tenant_id=1, secret=settings.jwt_secret)

    with pytest.raises(HTTPException) as exc_info:
        get_current_superadmin(authorization=_bearer(token), settings=settings)

    assert exc_info.value.status_code == 403


def test_get_current_superadmin_rejects_missing_token(settings: Settings) -> None:
    with pytest.raises(HTTPException) as exc_info:
        get_current_superadmin(authorization=None, settings=settings)

    assert exc_info.value.status_code == 401


def test_get_current_user_accepts_owner_token(settings: Settings) -> None:
    token = create_access_token(sub="1", role="owner", tenant_id=1, secret=settings.jwt_secret)

    payload = get_current_user(authorization=_bearer(token), settings=settings)

    assert payload.role == "owner"


def test_get_current_user_accepts_superadmin_token(settings: Settings) -> None:
    token = create_access_token(
        sub="1", role="superadmin", tenant_id=None, secret=settings.jwt_secret
    )

    payload = get_current_user(authorization=_bearer(token), settings=settings)

    assert payload.role == "superadmin"


def test_get_current_user_rejects_malformed_header(settings: Settings) -> None:
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(authorization="Token abc.def.ghi", settings=settings)

    assert exc_info.value.status_code == 401
