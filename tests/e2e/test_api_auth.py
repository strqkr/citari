"""Autenticacion: login owner/superadmin, password malo, /auth/me
con y sin token, register-owner + limpieza, logout."""

from __future__ import annotations

import httpx
import pytest

from conftest import OWNER_PASSWORD, SUPERADMIN_PASSWORD, bearer
from test_api_helpers import assert_rfc7807, unique_tag

pytestmark = pytest.mark.e2e


def test_login_owner_success_shape(client: httpx.Client, seed_identities: dict) -> None:
    r = client.post(
        "/auth/login",
        json={"email": seed_identities["owner1_email"], "password": OWNER_PASSWORD, "role": "owner"},
    )
    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) == {"accessToken", "tokenType", "user"}
    assert body["tokenType"] == "bearer"
    user = body["user"]
    assert user["role"] == "owner"
    assert user["tenantId"] is not None
    assert set(user.keys()) == {"id", "firstName", "lastName", "email", "role", "tenantId"}


def test_login_superadmin_success_shape(client: httpx.Client, seed_identities: dict) -> None:
    r = client.post(
        "/auth/login",
        json={
            "email": seed_identities["superadmin_email"],
            "password": SUPERADMIN_PASSWORD,
            "role": "superadmin",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == "superadmin"
    assert body["user"]["tenantId"] is None


def test_login_wrong_password_401_generic(client: httpx.Client, seed_identities: dict) -> None:
    r = client.post(
        "/auth/login",
        json={"email": seed_identities["owner1_email"], "password": "not-the-password", "role": "owner"},
    )
    assert r.status_code == 401
    body = r.json()
    assert_rfc7807(body, 401)
    # El mensaje debe ser generico (no debe revelar si el email existe o no).
    assert "invalid" in body["detail"].lower() or "invalido" in body["detail"].lower()
    assert seed_identities["owner1_email"] not in body["detail"]


def test_login_unknown_email_401_generic_same_message(
    client: httpx.Client, seed_identities: dict
) -> None:
    """El mismo mensaje generico debe usarse tanto para email inexistente
    como para password incorrecto (no debe filtrar cual de los dos fallo)."""
    wrong_pass = client.post(
        "/auth/login",
        json={"email": seed_identities["owner1_email"], "password": "wrong", "role": "owner"},
    )
    unknown_email = client.post(
        "/auth/login",
        json={"email": "zz.no.existe.jamas@example.com", "password": "whatever", "role": "owner"},
    )
    assert wrong_pass.status_code == 401
    assert unknown_email.status_code == 401
    assert wrong_pass.json()["detail"] == unknown_email.json()["detail"]


def test_login_missing_fields_422(client: httpx.Client) -> None:
    r = client.post("/auth/login", json={"email": "someone@example.com"})
    assert r.status_code == 422
    assert_rfc7807(r.json(), 422)


def test_auth_me_with_owner_token(client: httpx.Client, owner1_token: str) -> None:
    r = client.get("/auth/me", headers=bearer(owner1_token))
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "owner"
    assert body["tenantId"] is not None
    assert set(body.keys()) == {"id", "firstName", "lastName", "email", "role", "tenantId"}


def test_auth_me_with_superadmin_token(client: httpx.Client, superadmin_token: str) -> None:
    r = client.get("/auth/me", headers=bearer(superadmin_token))
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "superadmin"
    assert body["tenantId"] is None


def test_auth_me_without_token_401(client: httpx.Client) -> None:
    r = client.get("/auth/me")
    assert r.status_code == 401
    assert_rfc7807(r.json(), 401)


def test_auth_me_with_garbage_token_401(client: httpx.Client) -> None:
    r = client.get("/auth/me", headers={"Authorization": "Bearer not-a-real-jwt"})
    assert r.status_code == 401
    assert_rfc7807(r.json(), 401)


def test_logout_returns_204(client: httpx.Client) -> None:
    r = client.post("/auth/logout")
    assert r.status_code == 204
    assert r.text == ""


def test_register_owner_creates_pending_tenant_and_cleans_up(
    client: httpx.Client, cleanup_sql
) -> None:
    from conftest import sql_scalar

    tag = unique_tag()
    slug = f"zz-e2e-{tag}"
    business_email = f"zz.e2e.business.{tag}@example.com"
    owner_email = f"zz.e2e.owner.{tag}@example.com"

    r = client.post(
        "/auth/register-owner",
        json={
            "businessName": "ZZ E2E Test Business",
            "businessTypeId": 1,
            "slug": slug,
            "businessEmail": business_email,
            "ownerFirstName": "Zz",
            "ownerLastName": "E2E Tester",
            "ownerEmail": owner_email,
            "password": "ZzE2ePass123",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert set(body.keys()) == {"tenantId", "owner", "message"}
    tenant_id = body["tenantId"]
    assert body["owner"]["email"] == owner_email
    assert body["owner"]["role"] == "owner"
    assert body["owner"]["tenantId"] == tenant_id

    # cleanup_sql ejecuta en orden LIFO (ver docstring del fixture en
    # conftest.py): registramos el DELETE del padre (tenants) primero para
    # que el teardown corra el DELETE del hijo (tenant_owners, que
    # tiene FK NO_ACTION hacia tenants) PRIMERO y evite violar la FK.
    # tenant_owners y tenants tienen a su vez sus propias tablas hijas
    # normalizadas de email/phone, que deben borrarse antes que ellos.
    cleanup_sql(f"DELETE FROM tenants WHERE tenant_id = {tenant_id}")
    cleanup_sql(f"DELETE FROM tenant_owners WHERE tenant_id = {tenant_id}")
    cleanup_sql(f"DELETE FROM tenant_emails WHERE tenant_id = {tenant_id}")
    cleanup_sql(f"DELETE FROM tenant_phones WHERE tenant_id = {tenant_id}")
    cleanup_sql(
        "DELETE FROM owner_emails WHERE owner_id IN "
        f"(SELECT owner_id FROM tenant_owners WHERE tenant_id = {tenant_id})"
    )
    cleanup_sql(
        "DELETE FROM owner_phones WHERE owner_id IN "
        f"(SELECT owner_id FROM tenant_owners WHERE tenant_id = {tenant_id})"
    )

    # El dominio nuevo queda pendiente de activacion (no "activo").
    assert sql_scalar(
        "SELECT ed.name FROM tenants d JOIN tenant_statuses ed "
        f"ON ed.tenant_status_id = d.tenant_status_id WHERE d.tenant_id = {tenant_id}"
    ) == "pending"

    # Comportamiento real (documentado en app/services/auth_service.py
    # AuthService._ensure_tenant_active): un owner recien registrado NO
    # puede loguearse todavia porque su dominio queda en 'pendiente' hasta
    # que un superadmin lo active - login devuelve 403 con detail claro
    # (a diferencia de credenciales invalidas, que siempre son 401 generico).
    login_resp = client.post(
        "/auth/login", json={"email": owner_email, "password": "ZzE2ePass123", "role": "owner"}
    )
    assert login_resp.status_code == 403, login_resp.text
    assert_rfc7807(login_resp.json(), 403)
    assert "pending" in login_resp.json()["detail"]


def test_register_owner_duplicate_slug_400(client: httpx.Client, seed_identities: dict) -> None:
    tag = unique_tag()
    r = client.post(
        "/auth/register-owner",
        json={
            "businessName": "ZZ Duplicate Slug Test",
            "businessTypeId": 1,
            "slug": seed_identities["slug1"],
            "businessEmail": f"zz.e2e.dup.{tag}@example.com",
            "ownerFirstName": "Zz",
            "ownerLastName": "Dup",
            "ownerEmail": f"zz.e2e.dup.owner.{tag}@example.com",
            "password": "ZzE2ePass123",
        },
    )
    assert r.status_code == 400, r.text
    assert_rfc7807(r.json(), 400)


def test_register_owner_missing_fields_422(client: httpx.Client) -> None:
    r = client.post("/auth/register-owner", json={"businessName": "Incomplete"})
    assert r.status_code == 422
    assert_rfc7807(r.json(), 422)
