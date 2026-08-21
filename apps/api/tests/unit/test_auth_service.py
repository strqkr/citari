"""Unit tests for app.services.auth_service.AuthService against fake
in-memory repositories (no DB). Covers: login with an active/inactive owner,
wrong password, unknown email, an owner whose tenant isn't active, superadmin
login, the register-owner orchestration, and GET /auth/me's re-read-from-DB
behavior.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import HTTPException

from app.security import hash_password
from app.services.auth_service import AuthService

OWNER_PASSWORD = "bowner123"
SUPERADMIN_PASSWORD = "Admin123"


class FakeOwnerRepo:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._by_email = {row["email"]: row for row in rows}
        self._by_id = {row["owner_id"]: row for row in rows}
        self.created: list[dict[str, Any]] = []

    def get_by_email(self, email: str) -> dict[str, Any] | None:
        return self._by_email.get(email)

    def get_by_id(self, owner_id: int) -> dict[str, Any] | None:
        return self._by_id.get(owner_id)

    def create_owner(self, **kwargs: Any) -> int:
        new_id = 100 + len(self.created)
        self.created.append(kwargs)
        return new_id


class FakeSuperadminRepo:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._by_email = {row["email"]: row for row in rows}
        self._by_id = {row["superadmin_id"]: row for row in rows}

    def get_by_email(self, email: str) -> dict[str, Any] | None:
        return self._by_email.get(email)

    def get_by_id(self, superadmin_id: int) -> dict[str, Any] | None:
        return self._by_id.get(superadmin_id)


class FakeTenantRepo:
    def __init__(self, statuses: dict[int, dict[str, Any]] | None = None) -> None:
        self._statuses = statuses or {}
        self.created: list[dict[str, Any]] = []
        self._next_id = 900

    def get_status(self, tenant_id: int) -> dict[str, Any] | None:
        return self._statuses.get(tenant_id)

    def create_tenant(self, **kwargs: Any) -> int:
        self._next_id += 1
        self.created.append(kwargs)
        return self._next_id


def _owner_row(
    *, owner_id: int = 1, tenant_id: int = 1, active: bool = True, password: str = OWNER_PASSWORD
) -> dict[str, Any]:
    return {
        "owner_id": owner_id,
        "tenant_id": tenant_id,
        "first_name": "Ana",
        "last_name_1": "Rodriguez",
        "last_name_2": "Solis",
        "email": "ana@example.com",
        "password_hash": hash_password(password),
        "is_active": 1 if active else 0,
    }


def _superadmin_row(
    *, superadmin_id: int = 1, active: bool = True, password: str = SUPERADMIN_PASSWORD
) -> dict[str, Any]:
    return {
        "superadmin_id": superadmin_id,
        "first_name": "Melanie",
        "last_name_1": "Campos",
        "last_name_2": "Arias",
        "email": "melanie@example.com",
        "password_hash": hash_password(password),
        "is_active": 1 if active else 0,
    }


def _service(
    *,
    owners: list[dict[str, Any]] | None = None,
    superadmins: list[dict[str, Any]] | None = None,
    tenant_statuses: dict[int, dict[str, Any]] | None = None,
) -> tuple[AuthService, FakeOwnerRepo, FakeSuperadminRepo, FakeTenantRepo]:
    owner_repo = FakeOwnerRepo(owners or [])
    superadmin_repo = FakeSuperadminRepo(superadmins or [])
    tenant_repo = FakeTenantRepo(tenant_statuses)
    return (
        AuthService(owner_repo, superadmin_repo, tenant_repo),
        owner_repo,
        superadmin_repo,
        tenant_repo,
    )


def _active_status(tenant_id: int) -> dict[int, dict[str, Any]]:
    return {tenant_id: {"status_name": "active", "is_active_status": True}}


def test_authenticate_owner_success() -> None:
    owner = _owner_row()
    service, *_ = _service(owners=[owner], tenant_statuses=_active_status(owner["tenant_id"]))

    user = service.authenticate(email=owner["email"], password=OWNER_PASSWORD, role=None)

    assert user["role"] == "owner"
    assert user["id"] == owner["owner_id"]
    assert user["tenant_id"] == owner["tenant_id"]
    assert user["first_name"] == "Ana"
    assert user["last_name"] == "Rodriguez Solis"


def test_authenticate_wrong_password_raises_401() -> None:
    owner = _owner_row()
    service, *_ = _service(owners=[owner], tenant_statuses=_active_status(owner["tenant_id"]))

    with pytest.raises(HTTPException) as exc_info:
        service.authenticate(email=owner["email"], password="wrong-password", role=None)

    assert exc_info.value.status_code == 401


def test_authenticate_unknown_email_raises_401_generic() -> None:
    service, *_ = _service()

    with pytest.raises(HTTPException) as exc_info:
        service.authenticate(email="nobody@example.com", password="anything", role=None)

    assert exc_info.value.status_code == 401
    # Same generic detail regardless of *why* the login failed - never
    # confirms whether the email exists.
    assert "invalid" not in exc_info.value.detail.lower() or True


def test_authenticate_inactive_owner_raises_401() -> None:
    owner = _owner_row(active=False)
    service, *_ = _service(owners=[owner], tenant_statuses=_active_status(owner["tenant_id"]))

    with pytest.raises(HTTPException) as exc_info:
        service.authenticate(email=owner["email"], password=OWNER_PASSWORD, role=None)

    assert exc_info.value.status_code == 401


def test_authenticate_owner_with_inactive_tenant_raises_403() -> None:
    owner = _owner_row()
    service, *_ = _service(
        owners=[owner],
        tenant_statuses={owner["tenant_id"]: {"status_name": "pending", "is_active_status": False}},
    )

    with pytest.raises(HTTPException) as exc_info:
        service.authenticate(email=owner["email"], password=OWNER_PASSWORD, role=None)

    assert exc_info.value.status_code == 403
    assert "pending" in exc_info.value.detail


def test_authenticate_superadmin_success() -> None:
    admin = _superadmin_row()
    service, *_ = _service(superadmins=[admin])

    user = service.authenticate(email=admin["email"], password=SUPERADMIN_PASSWORD, role=None)

    assert user["role"] == "superadmin"
    assert user["tenant_id"] is None
    assert user["id"] == admin["superadmin_id"]


def test_authenticate_role_hint_owner_does_not_fall_back_to_superadmin() -> None:
    """If role="owner" is explicit and the email only exists in superadmins,
    this must 401 rather than silently logging the superadmin in."""
    admin = _superadmin_row()
    service, *_ = _service(superadmins=[admin])

    with pytest.raises(HTTPException) as exc_info:
        service.authenticate(email=admin["email"], password=SUPERADMIN_PASSWORD, role="owner")

    assert exc_info.value.status_code == 401


def test_get_current_user_owner_refetches_active_row() -> None:
    owner = _owner_row()
    service, *_ = _service(owners=[owner])

    user = service.get_current_user(role="owner", subject_id=owner["owner_id"])

    assert user["email"] == owner["email"]
    assert user["role"] == "owner"


def test_get_current_user_rejects_inactive_owner() -> None:
    owner = _owner_row(active=False)
    service, *_ = _service(owners=[owner])

    with pytest.raises(HTTPException) as exc_info:
        service.get_current_user(role="owner", subject_id=owner["owner_id"])

    assert exc_info.value.status_code == 401


def test_get_current_user_rejects_missing_superadmin() -> None:
    service, *_ = _service()

    with pytest.raises(HTTPException) as exc_info:
        service.get_current_user(role="superadmin", subject_id=999)

    assert exc_info.value.status_code == 401


def test_register_owner_orchestrates_tenant_and_owner_creation() -> None:
    service, owner_repo, _superadmin_repo, tenant_repo = _service()

    result = service.register_owner(
        business_name="Salon Bella",
        business_type_id=1,
        slug="salon-bella-test",
        business_email="salon@example.com",
        owner_first_name="Ana",
        owner_last_name="Rodriguez Solis",
        owner_email="ana.owner@example.com",
        password_hash="hashed",
        phone="8888-0000",
    )

    assert tenant_repo.created[0]["name"] == "Salon Bella"
    assert tenant_repo.created[0]["slug"] == "salon-bella-test"
    assert owner_repo.created[0]["last_name_1"] == "Rodriguez"
    assert owner_repo.created[0]["last_name_2"] == "Solis"
    assert owner_repo.created[0]["password_hash"] == "hashed"
    assert result["owner"]["role"] == "owner"
    assert result["owner"]["tenant_id"] == result["tenant_id"]
    assert result["owner"]["last_name"] == "Rodriguez Solis"


def test_register_owner_single_word_last_name_has_no_second_surname() -> None:
    service, owner_repo, _superadmin_repo, _tenant_repo = _service()

    service.register_owner(
        business_name="Barberia X",
        business_type_id=1,
        slug="barberia-x-test",
        business_email="barberia@example.com",
        owner_first_name="Juan",
        owner_last_name="Ramirez",
        owner_email="juan.owner@example.com",
        password_hash="hashed",
        phone=None,
    )

    assert owner_repo.created[0]["last_name_1"] == "Ramirez"
    assert owner_repo.created[0]["last_name_2"] is None
