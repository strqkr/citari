"""Cross-tenant isolation tests: an authenticated owner reaching for
another tenant's resources must always get 404 (never 403, and never the
data) - covering services, customers, bookings, availability blocks and
categories. Read-only: touches nothing, so no cleanup is needed."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.integration.conftest import owner_auth_headers


@pytest.fixture
def owner_headers(client: TestClient, seed_owner: dict) -> dict[str, str]:
    return owner_auth_headers(client, email=seed_owner["email"], password=seed_owner["password"])


@pytest.fixture(scope="module")
def foreign_resources(db_factory, seed_owner_module: dict) -> dict:
    """One seed service/customer/booking/block/category belonging to any
    tenant OTHER than the seed owner's - the target of every cross-tenant
    probe below."""
    conn = db_factory.new_connection()
    try:
        cursor = conn.cursor()
        tenant_id = seed_owner_module["tenant_id"]
        resources: dict[str, int] = {}
        for key, sql in {
            "service_id": "SELECT TOP 1 service_id FROM services WHERE tenant_id <> ?",
            "customer_id": "SELECT TOP 1 customer_id FROM customers WHERE tenant_id <> ?",
            "booking_id": "SELECT TOP 1 booking_id FROM bookings WHERE tenant_id <> ?",
            "block_id": (
                "SELECT TOP 1 availability_block_id FROM availability_blocks "
                "WHERE tenant_id <> ?"
            ),
            "category_id": (
                "SELECT TOP 1 category_id FROM service_categories WHERE tenant_id <> ?"
            ),
        }.items():
            cursor.execute(sql, [tenant_id])
            row = cursor.fetchone()
            if row is None:
                pytest.skip(f"seed has no cross-tenant row for {key}")
            resources[key] = row[0]
        cursor.close()
        return resources
    finally:
        conn.close()


@pytest.fixture(scope="module")
def seed_owner_module(db_factory) -> dict:
    """Module-scoped clone of the session seed_owner lookup (fixtures used by
    a module-scoped fixture must not be session/function mixed via params)."""
    conn = db_factory.new_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT TOP 1 o.owner_id, o.tenant_id, oco.email
            FROM tenant_owners o
            OUTER APPLY (
                SELECT TOP 1 oc.email
                FROM owner_emails oc
                WHERE oc.owner_id = o.owner_id
                ORDER BY oc.owner_email_id
            ) oco
            WHERE o.is_active = 1 AND dbo.fn_is_tenant_active(o.tenant_id) = 1
            ORDER BY o.owner_id
            """
        )
        row = cursor.fetchone()
        if row is None:
            pytest.skip("seed data has no active owner with an active tenant")
        return {"owner_id": row.owner_id, "tenant_id": row.tenant_id, "email": row.email}
    finally:
        conn.close()


def test_get_foreign_service_returns_404(
    client: TestClient, owner_headers: dict, foreign_resources: dict
) -> None:
    response = client.get(
        f"/api/v1/services/{foreign_resources['service_id']}", headers=owner_headers
    )
    assert response.status_code == 404


def test_patch_foreign_service_returns_404_and_does_not_write(
    client: TestClient, owner_headers: dict, foreign_resources: dict, raw_conn
) -> None:
    service_id = foreign_resources["service_id"]
    cursor = raw_conn.cursor()
    cursor.execute("SELECT name FROM services WHERE service_id = ?", [service_id])
    original_name = cursor.fetchone()[0]

    response = client.patch(
        f"/api/v1/services/{service_id}",
        headers=owner_headers,
        json={"name": "hackeado-cross-tenant"},
    )
    assert response.status_code == 404

    cursor.execute("SELECT name FROM services WHERE service_id = ?", [service_id])
    assert cursor.fetchone()[0] == original_name
    cursor.close()


def test_delete_foreign_service_returns_404(
    client: TestClient, owner_headers: dict, foreign_resources: dict
) -> None:
    response = client.delete(
        f"/api/v1/services/{foreign_resources['service_id']}", headers=owner_headers
    )
    assert response.status_code == 404


def test_get_foreign_customer_returns_404(
    client: TestClient, owner_headers: dict, foreign_resources: dict
) -> None:
    response = client.get(
        f"/api/v1/customers/{foreign_resources['customer_id']}", headers=owner_headers
    )
    assert response.status_code == 404


def test_patch_foreign_customer_returns_404(
    client: TestClient, owner_headers: dict, foreign_resources: dict
) -> None:
    response = client.patch(
        f"/api/v1/customers/{foreign_resources['customer_id']}",
        headers=owner_headers,
        json={"phone": "0000-0000"},
    )
    assert response.status_code == 404


def test_get_foreign_booking_returns_404(
    client: TestClient, owner_headers: dict, foreign_resources: dict
) -> None:
    response = client.get(
        f"/api/v1/bookings/{foreign_resources['booking_id']}", headers=owner_headers
    )
    assert response.status_code == 404


def test_confirm_foreign_booking_returns_404(
    client: TestClient, owner_headers: dict, foreign_resources: dict
) -> None:
    """The SP's own tenant_id filter (THROW 50028) maps to 404 too - a
    lifecycle action is as isolated as a read."""
    response = client.post(
        f"/api/v1/bookings/{foreign_resources['booking_id']}/confirm", headers=owner_headers
    )
    assert response.status_code == 404


def test_get_foreign_availability_block_returns_404(
    client: TestClient, owner_headers: dict, foreign_resources: dict
) -> None:
    response = client.get(
        f"/api/v1/availability-blocks/{foreign_resources['block_id']}", headers=owner_headers
    )
    assert response.status_code == 404


def test_get_foreign_category_returns_404(
    client: TestClient, owner_headers: dict, foreign_resources: dict
) -> None:
    response = client.get(
        f"/api/v1/service-categories/{foreign_resources['category_id']}", headers=owner_headers
    )
    assert response.status_code == 404
