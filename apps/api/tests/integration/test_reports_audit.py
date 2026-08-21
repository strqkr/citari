"""Integration tests for the five /reports/* endpoints (200 + correct
shape for the seed owner's tenant) and /audit-logs (superadmin guard,
pagination envelope, trigger-generated rows visible, tenantId/action
filters). The audit test creates one real booking through the public flow so
tr_bookings_audit_insert writes a fresh 'booking_created' row, then
cleans it up via the shared cleanup_tracker."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from tests.integration.conftest import booking_payload, make_block, owner_auth_headers
from tests.integration.test_admin_tenants import superadmin_headers


@pytest.fixture
def owner_headers(client: TestClient, seed_owner: dict) -> dict[str, str]:
    return owner_auth_headers(client, email=seed_owner["email"], password=seed_owner["password"])


# -- reports -------------------------------------------------------------------


def test_dashboard_shape(client: TestClient, owner_headers: dict, seed_owner: dict) -> None:
    response = client.get("/api/v1/reports/dashboard", headers=owner_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["tenantId"] == seed_owner["tenant_id"]
    assert {
        "tenantId",
        "name",
        "totalBookings",
        "pendingBookings",
        "confirmedBookings",
        "cancelledBookings",
        "totalCustomers",
        "totalActiveServices",
        "totalActiveLocations",
    } <= body.keys()
    assert isinstance(body["totalBookings"], int)


def test_daily_agenda_returns_list(client: TestClient, owner_headers: dict) -> None:
    response = client.get(
        "/api/v1/reports/daily-agenda",
        headers=owner_headers,
        params={"date": date.today().isoformat()},
    )

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    for item in body:
        assert {"bookingDate", "startTime", "endTime", "serviceName", "status"} <= item.keys()


def test_daily_agenda_requires_date(client: TestClient, owner_headers: dict) -> None:
    response = client.get("/api/v1/reports/daily-agenda", headers=owner_headers)
    assert response.status_code == 422


def test_bookings_detail_paginated(client: TestClient, owner_headers: dict) -> None:
    response = client.get(
        "/api/v1/reports/bookings-detail",
        headers=owner_headers,
        params={"page": 1, "pageSize": 5},
    )

    assert response.status_code == 200
    body = response.json()
    assert {"items", "total", "page", "pageSize"} <= body.keys()
    for item in body["items"]:
        assert {"bookingId", "customerName", "serviceName", "status", "trackingCode"} <= item.keys()


def test_services_demand_shape(client: TestClient, owner_headers: dict) -> None:
    response = client.get("/api/v1/reports/services-demand", headers=owner_headers)

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    for item in body:
        assert {"serviceId", "serviceName", "totalBookings"} <= item.keys()


def test_availability_status_shape(client: TestClient, owner_headers: dict) -> None:
    response = client.get(
        "/api/v1/reports/availability-status",
        headers=owner_headers,
        params={"date": date.today().isoformat()},
    )

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    for item in body:
        assert {
            "availabilityBlockId",
            "locationId",
            "locationName",
            "blockDate",
            "isActive",
            "isReserved",
        } <= item.keys()


def test_reports_require_owner_role(client: TestClient, seed_superadmin: dict) -> None:
    assert client.get("/api/v1/reports/dashboard").status_code == 401
    headers = superadmin_headers(client, seed_superadmin)
    assert client.get("/api/v1/reports/dashboard", headers=headers).status_code == 403


# -- audit logs -------------------------------------------------------------------


def test_audit_logs_show_trigger_generated_booking_row(
    client: TestClient,
    seed_superadmin: dict,
    seed_tenant: dict,
    db_factory,
    cleanup_tracker: dict,
) -> None:
    """Creates a booking (public flow) so trg_reservaciones_auditar_insert
    writes a 'booking_created' audit_logs row, then finds exactly that row through
    GET /audit-logs with the tenantId + action filters."""
    block_id = make_block(db_factory, seed_tenant, block_date=date(2033, 3, 1))
    cleanup_tracker["block_ids"].append(block_id)

    payload = booking_payload(
        service_id=seed_tenant["service_id"],
        location_id=seed_tenant["location_id"],
        availability_block_id=block_id,
    )
    booked = client.post(f"/api/v1/public/{seed_tenant['slug']}/bookings", json=payload)
    assert booked.status_code == 201
    booking_id = booked.json()["bookingId"]
    cleanup_tracker["booking_ids"].append(booking_id)

    headers = superadmin_headers(client, seed_superadmin)
    response = client.get(
        "/api/v1/audit-logs",
        headers=headers,
        params={"tenantId": seed_tenant["tenant_id"], "action": "booking_created"},
    )

    assert response.status_code == 200
    body = response.json()
    assert {"items", "total", "page", "pageSize"} <= body.keys()
    match = [item for item in body["items"] if item["entityId"] == booking_id]
    assert match, "the trigger-generated booking_created row must be visible"
    assert match[0]["entityName"] == "bookings"
    assert match[0]["tenantId"] == seed_tenant["tenant_id"]
    assert match[0]["action"] == "booking_created"


def test_audit_logs_pagination_envelope(client: TestClient, seed_superadmin: dict) -> None:
    headers = superadmin_headers(client, seed_superadmin)

    page1 = client.get(
        "/api/v1/audit-logs", headers=headers, params={"page": 1, "pageSize": 1}
    ).json()
    page2 = client.get(
        "/api/v1/audit-logs", headers=headers, params={"page": 2, "pageSize": 1}
    ).json()

    assert page1["total"] >= 2  # seed data always has at least a couple of audit_logs rows
    assert len(page1["items"]) == 1
    assert page1["items"][0]["auditId"] != page2["items"][0]["auditId"]


def test_audit_logs_require_superadmin_role(client: TestClient, seed_owner: dict) -> None:
    assert client.get("/api/v1/audit-logs").status_code == 401
    headers = owner_auth_headers(client, email=seed_owner["email"], password=seed_owner["password"])
    assert client.get("/api/v1/audit-logs", headers=headers).status_code == 403
