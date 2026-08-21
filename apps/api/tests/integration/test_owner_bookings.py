"""Integration tests for the owner-facing /bookings lifecycle (internal
creation -> confirm -> complete; creation -> cancel with the block freed;
reschedule), plus list pagination/filters, against the real seed database.

All supporting data (category/service/location/blocks) is created through
the API itself under the seed owner's tenant, and removed afterwards in FK
order by the module fixture, so the suite stays re-runnable and the seed
counts are untouched.
"""

from __future__ import annotations

from collections.abc import Generator
from datetime import date

import pytest
from fastapi.testclient import TestClient

from tests.integration.conftest import TEST_CUSTOMER_EMAIL, owner_auth_headers

TEST_MARK = "booking-test"


@pytest.fixture
def owner_headers(client: TestClient, seed_owner: dict) -> dict[str, str]:
    return owner_auth_headers(client, email=seed_owner["email"], password=seed_owner["password"])


@pytest.fixture
def booking_cleanup(raw_conn) -> Generator[dict, None, None]:
    """Same FK-ordered cleanup contract as the shared cleanup_tracker, extended
    with the category/service/location rows this module creates."""
    tracker: dict[str, list[int]] = {"booking_ids": [], "block_ids": []}
    yield tracker

    cursor = raw_conn.cursor()
    booking_ids = tracker["booking_ids"]
    block_ids = tracker["block_ids"]

    if booking_ids:
        placeholders = ",".join("?" for _ in booking_ids)
        cursor.execute(
            f"DELETE FROM tracking_codes WHERE booking_id IN ({placeholders})",
            booking_ids,
        )
        cursor.execute(
            "DELETE FROM audit_logs WHERE entity_name = 'bookings' "
            f"AND entity_id IN ({placeholders})",
            booking_ids,
        )
        cursor.execute(
            f"DELETE FROM bookings WHERE booking_id IN ({placeholders})",
            booking_ids,
        )

    if block_ids:
        placeholders = ",".join("?" for _ in block_ids)
        cursor.execute(
            f"DELETE FROM availability_blocks WHERE availability_block_id IN ({placeholders})",
            block_ids,
        )

    cursor.execute("SELECT customer_id FROM customer_emails WHERE email = ?", [TEST_CUSTOMER_EMAIL])
    test_customer_ids = [row.customer_id for row in cursor.fetchall()]
    if test_customer_ids:
        customer_placeholders = ",".join("?" for _ in test_customer_ids)
        cursor.execute(
            f"DELETE FROM customer_emails WHERE customer_id IN ({customer_placeholders})",
            test_customer_ids,
        )
        cursor.execute(
            f"DELETE FROM customer_phones WHERE customer_id IN ({customer_placeholders})",
            test_customer_ids,
        )
        cursor.execute(
            f"DELETE FROM customers WHERE customer_id IN ({customer_placeholders})",
            test_customer_ids,
        )
    cursor.execute("DELETE FROM services WHERE name LIKE ?", [f"%{TEST_MARK}%"])
    cursor.execute("DELETE FROM service_categories WHERE name LIKE ?", [f"%{TEST_MARK}%"])
    cursor.execute("DELETE FROM locations WHERE name LIKE ?", [f"%{TEST_MARK}%"])
    raw_conn.commit()
    cursor.close()


@pytest.fixture
def booking_env(client: TestClient, owner_headers: dict, booking_cleanup: dict) -> dict:
    """category + service + location under the seed owner's tenant, all via
    the API (cleaned up by booking_cleanup)."""
    category = client.post(
        "/api/v1/service-categories",
        headers=owner_headers,
        json={"name": f"Category {TEST_MARK}"},
    )
    assert category.status_code == 201, category.text

    service = client.post(
        "/api/v1/services",
        headers=owner_headers,
        json={
            "categoryId": category.json()["categoryId"],
            "name": f"Service {TEST_MARK}",
            "durationMinutes": 30,
        },
    )
    assert service.status_code == 201, service.text

    location = client.post(
        "/api/v1/locations",
        headers=owner_headers,
        json={
            "name": f"Location {TEST_MARK}",
            "province": "San Jose",
            "canton": "Central",
            "district": "Carmen",
            "postalCode": "10101",
        },
    )
    assert location.status_code == 201, location.text

    return {
        "service_id": service.json()["serviceId"],
        "location_id": location.json()["locationId"],
        "tracker": booking_cleanup,
    }


def _make_block(
    client: TestClient, owner_headers: dict, env: dict, *, block_date: date, start: str, end: str
) -> int:
    response = client.post(
        "/api/v1/availability-blocks",
        headers=owner_headers,
        json={
            "locationId": env["location_id"],
            "blockDate": block_date.isoformat(),
            "startTime": start,
            "endTime": end,
        },
    )
    assert response.status_code == 201, response.text
    block_id = response.json()["availabilityBlockId"]
    env["tracker"]["block_ids"].append(block_id)
    return block_id


def _create_booking(client: TestClient, owner_headers: dict, env: dict, block_id: int) -> dict:
    response = client.post(
        "/api/v1/bookings",
        headers=owner_headers,
        json={
            "serviceId": env["service_id"],
            "locationId": env["location_id"],
            "availabilityBlockId": block_id,
            "customer": {
                "firstName": "Interna",
                "lastName": "Prueba Interna",
                "email": TEST_CUSTOMER_EMAIL,
                "phone": "8888-0000",
            },
            "customerNotes": TEST_MARK,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    env["tracker"]["booking_ids"].append(body["bookingId"])
    return body


def test_booking_lifecycle_confirm_then_complete(
    client: TestClient, owner_headers: dict, booking_env: dict
) -> None:
    block_id = _make_block(
        client,
        owner_headers,
        booking_env,
        block_date=date(2033, 2, 1),
        start="09:00:00",
        end="09:30:00",
    )
    created = _create_booking(client, owner_headers, booking_env, block_id)
    booking_id = created["bookingId"]
    assert created["status"] == "pending"
    assert created["trackingCode"].startswith("CITARI-")

    confirmed = client.post(f"/api/v1/bookings/{booking_id}/confirm", headers=owner_headers)
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["status"] == "confirmed"

    completed = client.post(f"/api/v1/bookings/{booking_id}/complete", headers=owner_headers)
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"

    # Completing again is an invalid transition -> SP THROW 50003 -> 400.
    again = client.post(f"/api/v1/bookings/{booking_id}/complete", headers=owner_headers)
    assert again.status_code == 400


def test_booking_lifecycle_cancel_frees_block(
    client: TestClient, owner_headers: dict, booking_env: dict
) -> None:
    block_id = _make_block(
        client,
        owner_headers,
        booking_env,
        block_date=date(2033, 2, 2),
        start="10:00:00",
        end="10:30:00",
    )
    created = _create_booking(client, owner_headers, booking_env, block_id)
    booking_id = created["bookingId"]

    cancelled = client.post(f"/api/v1/bookings/{booking_id}/cancel", headers=owner_headers)
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"

    # trg_liberar_bloque_al_cancelar freed the block: it shows up unreserved.
    block = client.get(f"/api/v1/availability-blocks/{block_id}", headers=owner_headers)
    assert block.status_code == 200
    assert block.json()["isReserved"] is False


def test_booking_reschedule_moves_to_new_block(
    client: TestClient, owner_headers: dict, booking_env: dict
) -> None:
    old_block = _make_block(
        client,
        owner_headers,
        booking_env,
        block_date=date(2033, 2, 3),
        start="11:00:00",
        end="11:30:00",
    )
    new_block = _make_block(
        client,
        owner_headers,
        booking_env,
        block_date=date(2033, 2, 4),
        start="12:00:00",
        end="12:30:00",
    )
    created = _create_booking(client, owner_headers, booking_env, old_block)
    booking_id = created["bookingId"]

    rescheduled = client.post(
        f"/api/v1/bookings/{booking_id}/reschedule",
        headers=owner_headers,
        json={"newAvailabilityBlockId": new_block},
    )
    assert rescheduled.status_code == 200, rescheduled.text
    assert rescheduled.json()["status"] == "rescheduled"
    assert rescheduled.json()["bookingDate"] == "2033-02-04"

    # The trigger reactivated only the OLD block.
    old = client.get(f"/api/v1/availability-blocks/{old_block}", headers=owner_headers)
    assert old.json()["isReserved"] is False


def test_booking_create_with_existing_customer_id(
    client: TestClient, owner_headers: dict, booking_env: dict
) -> None:
    customer = client.post(
        "/api/v1/customers",
        headers=owner_headers,
        json={
            "firstName": "Cliente",
            "lastName": "Existing Customer",
            "email": TEST_CUSTOMER_EMAIL,
            "phone": "8888-0000",
        },
    )
    assert customer.status_code == 201
    customer_id = customer.json()["customerId"]

    block_id = _make_block(
        client,
        owner_headers,
        booking_env,
        block_date=date(2033, 2, 5),
        start="13:00:00",
        end="13:30:00",
    )
    response = client.post(
        "/api/v1/bookings",
        headers=owner_headers,
        json={
            "serviceId": booking_env["service_id"],
            "locationId": booking_env["location_id"],
            "availabilityBlockId": block_id,
            "customerId": customer_id,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    booking_env["tracker"]["booking_ids"].append(body["bookingId"])
    assert body["customerName"].startswith("Cliente")

    history = client.get(f"/api/v1/customers/{customer_id}/bookings", headers=owner_headers)
    assert history.status_code == 200
    assert body["bookingId"] in [item["bookingId"] for item in history.json()]


def test_booking_create_without_customer_data_returns_400(
    client: TestClient, owner_headers: dict, booking_env: dict
) -> None:
    """Neither customerId nor customer contact -> sp_create_booking THROW
    50005 -> 400."""
    block_id = _make_block(
        client,
        owner_headers,
        booking_env,
        block_date=date(2033, 2, 6),
        start="14:00:00",
        end="14:30:00",
    )
    response = client.post(
        "/api/v1/bookings",
        headers=owner_headers,
        json={
            "serviceId": booking_env["service_id"],
            "locationId": booking_env["location_id"],
            "availabilityBlockId": block_id,
        },
    )
    assert response.status_code == 400


def test_bookings_list_pagination_and_status_filter(
    client: TestClient, owner_headers: dict, booking_env: dict
) -> None:
    first_block = _make_block(
        client,
        owner_headers,
        booking_env,
        block_date=date(2033, 2, 7),
        start="09:00:00",
        end="09:30:00",
    )
    second_block = _make_block(
        client,
        owner_headers,
        booking_env,
        block_date=date(2033, 2, 8),
        start="09:00:00",
        end="09:30:00",
    )
    first = _create_booking(client, owner_headers, booking_env, first_block)
    second = _create_booking(client, owner_headers, booking_env, second_block)

    confirmed = client.post(
        f"/api/v1/bookings/{second['bookingId']}/confirm", headers=owner_headers
    )
    assert confirmed.status_code == 200

    page1 = client.get(
        "/api/v1/bookings", headers=owner_headers, params={"page": 1, "pageSize": 1}
    ).json()
    page2 = client.get(
        "/api/v1/bookings", headers=owner_headers, params={"page": 2, "pageSize": 1}
    ).json()
    assert page1["total"] == page2["total"] >= 2
    assert len(page1["items"]) == 1 and len(page2["items"]) == 1
    assert page1["items"][0]["bookingId"] != page2["items"][0]["bookingId"]

    only_confirmed = client.get(
        "/api/v1/bookings",
        headers=owner_headers,
        params={"status": "confirmed", "date": "2033-02-08"},
    ).json()
    ids = [item["bookingId"] for item in only_confirmed["items"]]
    assert second["bookingId"] in ids
    assert first["bookingId"] not in ids
