"""Integration tests for /api/v1/tenant/current against the real seed
database: GET, PATCH + revert, and protected-route guard checks (no token /
wrong role)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.integration.conftest import owner_auth_headers


def test_get_tenant_current_returns_owner_domain(client: TestClient, seed_owner: dict) -> None:
    headers = owner_auth_headers(client, email=seed_owner["email"], password=seed_owner["password"])

    response = client.get("/api/v1/tenant/current", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["tenantId"] == seed_owner["tenant_id"]
    assert isinstance(body["name"], str) and body["name"]
    assert isinstance(body["slug"], str) and body["slug"]


def test_patch_tenant_current_updates_and_reverts_public_message(
    client: TestClient, seed_owner: dict
) -> None:
    headers = owner_auth_headers(client, email=seed_owner["email"], password=seed_owner["password"])

    original = client.get("/api/v1/tenant/current", headers=headers)
    assert original.status_code == 200
    original_message = original.json()["publicMessage"]

    try:
        updated = client.patch(
            "/api/v1/tenant/current",
            headers=headers,
            json={"publicMessage": "Integration test message"},
        )
        assert updated.status_code == 200
        assert updated.json()["publicMessage"] == "Integration test message"

        refreshed = client.get("/api/v1/tenant/current", headers=headers)
        assert refreshed.json()["publicMessage"] == "Integration test message"
    finally:
        reverted = client.patch(
            "/api/v1/tenant/current",
            headers=headers,
            json={"publicMessage": original_message},
        )
        assert reverted.status_code == 200
        assert reverted.json()["publicMessage"] == original_message


def test_tenant_current_without_token_returns_401(client: TestClient) -> None:
    response = client.get("/api/v1/tenant/current")

    assert response.status_code == 401


def test_tenant_current_rejects_superadmin_token(client: TestClient, seed_superadmin: dict) -> None:
    """An authenticated-but-wrong-role token must 403, not 401 - the owner
    guard on /tenant/current rejects a superadmin token."""
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": seed_superadmin["email"],
            "password": seed_superadmin["password"],
            "role": "superadmin",
        },
    )
    assert login.status_code == 200
    token = login.json()["accessToken"]

    response = client.get("/api/v1/tenant/current", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 403
