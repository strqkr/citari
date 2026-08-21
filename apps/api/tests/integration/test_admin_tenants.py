"""Integration tests for /admin/tenants (superadmin guard, listing,
activate/suspend with the owner-login side effect: suspended tenant -> owner
login 403; re-activated -> 200)."""

from __future__ import annotations

import uuid
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from tests.integration.conftest import owner_auth_headers


def superadmin_headers(client: TestClient, seed_superadmin: dict) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": seed_superadmin["email"],
            "password": seed_superadmin["password"],
            "role": "superadmin",
        },
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


@pytest.fixture
def temp_owner(
    client: TestClient, raw_conn, seed_business_type: dict
) -> Generator[dict, None, None]:
    """Fresh owner + pending tenant via POST /auth/register-owner (the same
    fixture pattern used elsewhere), removed afterwards so the seed counts
    are restored."""
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "businessName": f"Admin Test {suffix}",
        "businessTypeId": seed_business_type["business_type_id"],
        "slug": f"admin-test-{suffix}",
        "businessEmail": f"admin.biz.{suffix}@example.com",
        "ownerFirstName": "AdminTest",
        "ownerLastName": "AdminTest",
        "ownerEmail": f"admin.owner.{suffix}@example.com",
        "password": "TempOwnerPass123",
    }
    response = client.post("/api/v1/auth/register-owner", json=payload)
    assert response.status_code == 201, response.text
    body = response.json()

    yield {
        "tenant_id": body["tenantId"],
        "owner_id": body["owner"]["id"],
        "email": payload["ownerEmail"],
        "password": payload["password"],
    }

    cursor = raw_conn.cursor()
    cursor.execute(
        "DELETE FROM audit_logs WHERE entity_name = 'tenant_owners' AND entity_id = ?",
        [body["owner"]["id"]],
    )
    cursor.execute(
        "DELETE FROM audit_logs WHERE entity_name = 'tenants' AND entity_id = ?",
        [body["tenantId"]],
    )
    cursor.execute(
        "DELETE FROM owner_emails WHERE owner_id = ?",
        [body["owner"]["id"]],
    )
    cursor.execute(
        "DELETE FROM owner_phones WHERE owner_id = ?",
        [body["owner"]["id"]],
    )
    cursor.execute("DELETE FROM tenant_emails WHERE tenant_id = ?", [body["tenantId"]])
    cursor.execute("DELETE FROM tenant_phones WHERE tenant_id = ?", [body["tenantId"]])
    cursor.execute("DELETE FROM tenant_owners WHERE owner_id = ?", [body["owner"]["id"]])
    cursor.execute("DELETE FROM tenants WHERE tenant_id = ?", [body["tenantId"]])
    raw_conn.commit()
    cursor.close()


def test_list_tenants_paginated(client: TestClient, seed_superadmin: dict) -> None:
    headers = superadmin_headers(client, seed_superadmin)

    page1 = client.get(
        "/api/v1/admin/tenants", headers=headers, params={"page": 1, "pageSize": 1}
    ).json()
    page2 = client.get(
        "/api/v1/admin/tenants", headers=headers, params={"page": 2, "pageSize": 1}
    ).json()

    assert {"items", "total", "page", "pageSize"} <= page1.keys()
    assert page1["total"] >= 2  # seed data always has at least a couple of tenants
    assert len(page1["items"]) == 1
    assert page1["items"][0]["tenantId"] != page2["items"][0]["tenantId"]
    sample = page1["items"][0]
    assert {"tenantId", "slug", "name", "status"} <= sample.keys()
    assert sample["status"] is not None


def test_get_tenant_by_id_includes_status(client: TestClient, seed_superadmin: dict) -> None:
    headers = superadmin_headers(client, seed_superadmin)
    listing = client.get(
        "/api/v1/admin/tenants", headers=headers, params={"page": 1, "pageSize": 1}
    ).json()
    tenant_id = listing["items"][0]["tenantId"]

    response = client.get(f"/api/v1/admin/tenants/{tenant_id}", headers=headers)

    assert response.status_code == 200
    assert response.json()["tenantId"] == tenant_id
    assert response.json()["status"] is not None


def test_get_unknown_tenant_returns_404(client: TestClient, seed_superadmin: dict) -> None:
    headers = superadmin_headers(client, seed_superadmin)
    response = client.get("/api/v1/admin/tenants/999999", headers=headers)
    assert response.status_code == 404


def test_admin_tenants_requires_superadmin_role(client: TestClient, seed_owner: dict) -> None:
    no_token = client.get("/api/v1/admin/tenants")
    assert no_token.status_code == 401

    headers = owner_auth_headers(client, email=seed_owner["email"], password=seed_owner["password"])
    wrong_role = client.get("/api/v1/admin/tenants", headers=headers)
    assert wrong_role.status_code == 403


def test_activate_suspend_cycle_gates_owner_login(
    client: TestClient, seed_superadmin: dict, temp_owner: dict
) -> None:
    """register-owner leaves the tenant 'pendiente' (login 403); activate ->
    login 200; suspend -> login 403 (with the state name in the detail);
    activate again -> login 200."""
    headers = superadmin_headers(client, seed_superadmin)
    tenant_id = temp_owner["tenant_id"]
    login_body = {"email": temp_owner["email"], "password": temp_owner["password"]}

    pending_login = client.post("/api/v1/auth/login", json=login_body)
    assert pending_login.status_code == 403

    activated = client.post(f"/api/v1/admin/tenants/{tenant_id}/activate", headers=headers)
    assert activated.status_code == 200, activated.text
    assert activated.json()["status"] == "active"

    active_login = client.post("/api/v1/auth/login", json=login_body)
    assert active_login.status_code == 200

    suspended = client.post(f"/api/v1/admin/tenants/{tenant_id}/suspend", headers=headers)
    assert suspended.status_code == 200
    assert suspended.json()["status"] == "suspended"

    suspended_login = client.post("/api/v1/auth/login", json=login_body)
    assert suspended_login.status_code == 403
    assert "suspended" in suspended_login.json()["detail"]

    reactivated = client.post(f"/api/v1/admin/tenants/{tenant_id}/activate", headers=headers)
    assert reactivated.status_code == 200
    assert reactivated.json()["status"] == "active"

    final_login = client.post("/api/v1/auth/login", json=login_body)
    assert final_login.status_code == 200


def test_activate_unknown_tenant_returns_404(client: TestClient, seed_superadmin: dict) -> None:
    headers = superadmin_headers(client, seed_superadmin)
    response = client.post("/api/v1/admin/tenants/999999/activate", headers=headers)
    assert response.status_code == 404
