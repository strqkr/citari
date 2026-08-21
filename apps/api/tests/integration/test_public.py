"""Integration tests for /api/v1/public/* (GET tenant/services/availability,
POST bookings)."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.db import ConnectionFactory
from tests.integration.conftest import booking_payload, make_block


def test_get_public_tenant_ok(client: TestClient, seed_tenant: dict) -> None:
    response = client.get(f"/api/v1/public/{seed_tenant['slug']}")

    assert response.status_code == 200
    body = response.json()
    assert body["tenantId"] == seed_tenant["tenant_id"]
    assert body["slug"] == seed_tenant["slug"]
    assert isinstance(body["name"], str) and body["name"]


def test_get_public_tenant_404_for_unknown_slug(client: TestClient) -> None:
    response = client.get("/api/v1/public/slug-que-no-existe")

    assert response.status_code == 404
    body = response.json()
    assert body["status"] == 404
    assert {"type", "title", "status", "detail", "traceId"} <= body.keys()


def test_get_public_services_lists_camelcase_service(client: TestClient, seed_tenant: dict) -> None:
    response = client.get(f"/api/v1/public/{seed_tenant['slug']}/services")

    assert response.status_code == 200
    services = response.json()
    assert isinstance(services, list)
    assert len(services) >= 1
    ids = [item["serviceId"] for item in services]
    assert seed_tenant["service_id"] in ids

    sample = services[0]
    assert {"serviceId", "name", "description", "durationMinutes", "showPrice"} <= sample.keys()


def test_get_public_availability_shows_free_test_block(
    client: TestClient,
    seed_tenant: dict,
    db_factory: ConnectionFactory,
    cleanup_tracker: dict,
) -> None:
    block_date = date(2032, 3, 1)
    block_id = make_block(db_factory, seed_tenant, block_date=block_date)
    cleanup_tracker["block_ids"].append(block_id)

    response = client.get(
        f"/api/v1/public/{seed_tenant['slug']}/availability",
        params={"date": block_date.isoformat()},
    )

    assert response.status_code == 200
    blocks = response.json()
    ids = [item["availabilityBlockId"] for item in blocks]
    assert block_id in ids
    match = next(item for item in blocks if item["availabilityBlockId"] == block_id)
    assert match["blockDate"] == block_date.isoformat()
    assert match["isReserved"] is False


def test_create_public_booking_returns_201_with_tracking_code(
    client: TestClient,
    seed_tenant: dict,
    db_factory: ConnectionFactory,
    cleanup_tracker: dict,
) -> None:
    block_date = date(2032, 3, 2)
    block_id = make_block(db_factory, seed_tenant, block_date=block_date)
    cleanup_tracker["block_ids"].append(block_id)

    payload = booking_payload(
        service_id=seed_tenant["service_id"],
        location_id=seed_tenant["location_id"],
        availability_block_id=block_id,
    )
    response = client.post(f"/api/v1/public/{seed_tenant['slug']}/bookings", json=payload)

    assert response.status_code == 201
    body = response.json()
    cleanup_tracker["booking_ids"].append(body["bookingId"])

    assert body["trackingCode"].startswith("CITARI-")
    assert body["status"] == "pending"
    assert body["serviceName"]
    assert body["customerName"].startswith("Ana")

    # The block is now occupied - it must disappear from the free-availability list.
    availability = client.get(
        f"/api/v1/public/{seed_tenant['slug']}/availability",
        params={"date": block_date.isoformat()},
    ).json()
    assert block_id not in [item["availabilityBlockId"] for item in availability]


def test_create_public_booking_conflict_on_same_block(
    client: TestClient,
    seed_tenant: dict,
    db_factory: ConnectionFactory,
    cleanup_tracker: dict,
) -> None:
    block_date = date(2032, 3, 3)
    block_id = make_block(db_factory, seed_tenant, block_date=block_date)
    cleanup_tracker["block_ids"].append(block_id)

    payload = booking_payload(
        service_id=seed_tenant["service_id"],
        location_id=seed_tenant["location_id"],
        availability_block_id=block_id,
    )

    first = client.post(f"/api/v1/public/{seed_tenant['slug']}/bookings", json=payload)
    assert first.status_code == 201
    cleanup_tracker["booking_ids"].append(first.json()["bookingId"])

    second = client.post(f"/api/v1/public/{seed_tenant['slug']}/bookings", json=payload)
    assert second.status_code == 409
    body = second.json()
    assert body["status"] == 409
    assert {"type", "title", "status", "detail", "traceId"} <= body.keys()
