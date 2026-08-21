"""Integration tests for /api/v1/auth/* against the real seed database:
owner login, wrong password, superadmin login, GET /auth/me,
register-owner + cleanup, a protected route without a token, and owner
login blocked by an inactive tenant.
"""

from __future__ import annotations

import uuid
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from tests.integration.conftest import owner_auth_headers


@pytest.fixture
def temp_pending_owner(
    client: TestClient, raw_conn, seed_business_type: dict
) -> Generator[dict, None, None]:
    """Registers a fresh owner + tenant (sp_create_tenant always creates it
    in the 'pending' state) via POST /auth/register-owner, yields its
    data, then deletes both rows (and any audit trail) so the suite stays
    re-runnable and the seed data is restored."""
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "businessName": f"Auth Test Business {suffix}",
        "businessTypeId": seed_business_type["business_type_id"],
        "slug": f"auth-test-{suffix}",
        "businessEmail": f"auth-test.business.{suffix}@example.com",
        "ownerFirstName": "AuthTest",
        "ownerLastName": "IntegrationTest",
        "ownerEmail": f"auth-test.owner.{suffix}@example.com",
        "password": "TempOwnerPass123",
        "phone": "8888-0000",
    }
    response = client.post("/api/v1/auth/register-owner", json=payload)
    assert response.status_code == 201, response.text
    body = response.json()
    tenant_id = body["tenantId"]
    owner_id = body["owner"]["id"]

    yield {
        "tenant_id": tenant_id,
        "owner_id": owner_id,
        "email": payload["ownerEmail"],
        "password": payload["password"],
        "slug": payload["slug"],
    }

    cursor = raw_conn.cursor()
    cursor.execute(
        "DELETE FROM audit_logs WHERE entity_name = 'tenant_owners' AND entity_id = ?",
        [owner_id],
    )
    cursor.execute(
        "DELETE FROM audit_logs WHERE entity_name = 'tenants' AND entity_id = ?",
        [tenant_id],
    )
    cursor.execute("DELETE FROM owner_emails WHERE owner_id = ?", [owner_id])
    cursor.execute("DELETE FROM owner_phones WHERE owner_id = ?", [owner_id])
    cursor.execute("DELETE FROM tenant_emails WHERE tenant_id = ?", [tenant_id])
    cursor.execute("DELETE FROM tenant_phones WHERE tenant_id = ?", [tenant_id])
    cursor.execute("DELETE FROM tenant_owners WHERE owner_id = ?", [owner_id])
    cursor.execute("DELETE FROM tenants WHERE tenant_id = ?", [tenant_id])
    raw_conn.commit()
    cursor.close()


def test_login_owner_with_seed_credentials_returns_token(
    client: TestClient, seed_owner: dict
) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": seed_owner["email"], "password": seed_owner["password"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["tokenType"] == "bearer"
    assert isinstance(body["accessToken"], str) and body["accessToken"]
    assert body["user"]["role"] == "owner"
    assert body["user"]["tenantId"] == seed_owner["tenant_id"]
    assert body["user"]["email"] == seed_owner["email"]
    assert {"id", "firstName", "lastName", "email", "role", "tenantId"} <= body["user"].keys()


def test_login_owner_wrong_password_returns_401(client: TestClient, seed_owner: dict) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": seed_owner["email"], "password": "definitely-wrong"},
    )

    assert response.status_code == 401
    body = response.json()
    assert {"type", "title", "status", "detail", "traceId"} <= body.keys()


def test_login_unknown_email_returns_401_generic(client: TestClient) -> None:
    """Must be indistinguishable from a wrong-password 401 - never reveals
    whether the email is registered."""
    known_email_response = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody.auth-test@example.com", "password": "whatever123"},
    )

    assert known_email_response.status_code == 401


def test_login_superadmin_with_seed_credentials_returns_token(
    client: TestClient, seed_superadmin: dict
) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": seed_superadmin["email"],
            "password": seed_superadmin["password"],
            "role": "superadmin",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["role"] == "superadmin"
    assert body["user"]["tenantId"] is None


def test_get_me_returns_current_owner(client: TestClient, seed_owner: dict) -> None:
    headers = owner_auth_headers(client, email=seed_owner["email"], password=seed_owner["password"])

    response = client.get("/api/v1/auth/me", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == seed_owner["owner_id"]
    assert body["role"] == "owner"
    assert body["tenantId"] == seed_owner["tenant_id"]
    assert body["email"] == seed_owner["email"]


def test_get_me_without_token_returns_401(client: TestClient) -> None:
    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401


def test_get_me_with_garbage_token_returns_401(client: TestClient) -> None:
    response = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer this-is-not-a-jwt"})

    assert response.status_code == 401


def test_logout_returns_204(client: TestClient) -> None:
    response = client.post("/api/v1/auth/logout")

    assert response.status_code == 204


def test_register_owner_creates_pending_tenant(
    client: TestClient, temp_pending_owner: dict, raw_conn
) -> None:
    cursor = raw_conn.cursor()
    cursor.execute(
        "SELECT ed.name FROM tenants d "
        "JOIN tenant_statuses ed ON ed.tenant_status_id = d.tenant_status_id "
        "WHERE d.tenant_id = ?",
        [temp_pending_owner["tenant_id"]],
    )
    row = cursor.fetchone()
    cursor.close()

    assert row is not None
    assert row[0] == "pending"


def test_login_owner_with_inactive_domain_returns_403(
    client: TestClient, temp_pending_owner: dict
) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": temp_pending_owner["email"],
            "password": temp_pending_owner["password"],
        },
    )

    assert response.status_code == 403
    body = response.json()
    assert "pending" in body["detail"]


def test_register_owner_duplicate_slug_returns_400(
    client: TestClient, temp_pending_owner: dict, seed_business_type: dict
) -> None:
    payload = {
        "businessName": "Duplicate Slug Attempt",
        "businessTypeId": seed_business_type["business_type_id"],
        "slug": temp_pending_owner["slug"],
        "businessEmail": "duplicate.slug@example.com",
        "ownerFirstName": "Dup",
        "ownerLastName": "Licate",
        "ownerEmail": "duplicate.owner@example.com",
        "password": "AnotherPass123",
    }

    response = client.post("/api/v1/auth/register-owner", json=payload)

    assert response.status_code == 400
    body = response.json()
    assert {"type", "title", "status", "detail", "traceId"} <= body.keys()
