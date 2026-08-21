"""Integration tests for /api/v1/track/* (get/cancel/reschedule by tracking
code)."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.db import ConnectionFactory
from tests.integration.conftest import booking_payload, make_block


def _create_booking(
    client: TestClient,
    seed_tenant: dict,
    db_factory: ConnectionFactory,
    cleanup_tracker: dict,
    *,
    block_date: date,
) -> tuple[str, int]:
    """Creates one throwaway booking and returns (tracking_code, block_id)."""
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
    return body["trackingCode"], block_id


def test_get_by_tracking_code_returns_booking(
    client: TestClient,
    seed_tenant: dict,
    db_factory: ConnectionFactory,
    cleanup_tracker: dict,
) -> None:
    tracking_code, _block_id = _create_booking(
        client, seed_tenant, db_factory, cleanup_tracker, block_date=date(2032, 4, 1)
    )

    response = client.get(f"/api/v1/track/{tracking_code}")

    assert response.status_code == 200
    body = response.json()
    assert body["trackingCode"] == tracking_code
    assert body["status"] == "pending"
    assert body["serviceName"]
    assert "locationName" in body
    assert "startTime" in body


def test_cancel_by_tracking_code_frees_the_block(
    client: TestClient,
    seed_tenant: dict,
    db_factory: ConnectionFactory,
    cleanup_tracker: dict,
) -> None:
    block_date = date(2032, 4, 2)
    tracking_code, block_id = _create_booking(
        client, seed_tenant, db_factory, cleanup_tracker, block_date=block_date
    )

    response = client.post(f"/api/v1/track/{tracking_code}/cancel")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "cancelled"

    availability = client.get(
        f"/api/v1/public/{seed_tenant['slug']}/availability",
        params={"date": block_date.isoformat()},
    ).json()
    match = next(item for item in availability if item["availabilityBlockId"] == block_id)
    assert match["isReserved"] is False


def test_reschedule_moves_to_new_block_and_frees_old_one(
    client: TestClient,
    seed_tenant: dict,
    db_factory: ConnectionFactory,
    cleanup_tracker: dict,
) -> None:
    old_date = date(2032, 4, 3)
    new_date = date(2032, 4, 4)
    tracking_code, old_block_id = _create_booking(
        client, seed_tenant, db_factory, cleanup_tracker, block_date=old_date
    )
    new_block_id = make_block(db_factory, seed_tenant, block_date=new_date)
    cleanup_tracker["block_ids"].append(new_block_id)

    response = client.post(
        f"/api/v1/track/{tracking_code}/reschedule",
        json={"newAvailabilityBlockId": new_block_id},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "rescheduled"
    assert body["trackingCode"] == tracking_code

    old_availability = client.get(
        f"/api/v1/public/{seed_tenant['slug']}/availability",
        params={"date": old_date.isoformat()},
    ).json()
    old_match = next(
        item for item in old_availability if item["availabilityBlockId"] == old_block_id
    )
    assert old_match["isReserved"] is False

    new_availability = client.get(
        f"/api/v1/public/{seed_tenant['slug']}/availability",
        params={"date": new_date.isoformat()},
    ).json()
    assert new_block_id not in [item["availabilityBlockId"] for item in new_availability]


def test_track_unknown_code_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/track/CITARI-ZZZZZZ")

    assert response.status_code == 404
    body = response.json()
    assert body["status"] == 404
    assert {"type", "title", "status", "detail", "traceId"} <= body.keys()
