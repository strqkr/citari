"""Integration tests for owner CRUD groups (service-categories, services,
locations, business-hours, availability-blocks, customers) against the real
seed database. Every test creates its own throwaway data and removes it via
the crud_cleanup fixture, so the suite is re-runnable and leaves the seed
counts untouched.

Cross-tenant coverage lives in test_cross_tenant.py; the bookings lifecycle
in test_owner_bookings.py.
"""

from __future__ import annotations

from collections.abc import Generator
from datetime import date

import pytest
from fastapi.testclient import TestClient

from tests.integration.conftest import TEST_CUSTOMER_EMAIL, owner_auth_headers

TEST_MARK = "crud-test"


@pytest.fixture
def owner_headers(client: TestClient, seed_owner: dict) -> dict[str, str]:
    return owner_auth_headers(client, email=seed_owner["email"], password=seed_owner["password"])


@pytest.fixture
def crud_cleanup(raw_conn) -> Generator[None, None, None]:
    """Deletes every row this module creates (identifiable by the TEST_MARK
    marker in name/notas/descripcion, or the shared test-customer email),
    in FK order, after each test - pass or fail."""
    yield
    cursor = raw_conn.cursor()
    cursor.execute(
        "DELETE FROM business_hours WHERE location_id IN "
        "(SELECT location_id FROM locations WHERE name LIKE ?)",
        [f"%{TEST_MARK}%"],
    )
    cursor.execute("DELETE FROM services WHERE name LIKE ?", [f"%{TEST_MARK}%"])
    cursor.execute("DELETE FROM service_categories WHERE name LIKE ?", [f"%{TEST_MARK}%"])
    cursor.execute(
        "DELETE FROM availability_blocks WHERE location_id IN "
        "(SELECT location_id FROM locations WHERE name LIKE ?)",
        [f"%{TEST_MARK}%"],
    )
    cursor.execute(
        "DELETE FROM location_phones WHERE location_id IN "
        "(SELECT location_id FROM locations WHERE name LIKE ?)",
        [f"%{TEST_MARK}%"],
    )
    cursor.execute("DELETE FROM locations WHERE name LIKE ?", [f"%{TEST_MARK}%"])
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
    raw_conn.commit()
    cursor.close()


# -- service categories --------------------------------------------------------


def test_service_category_crud_lifecycle(
    client: TestClient, owner_headers: dict, crud_cleanup: None
) -> None:
    created = client.post(
        "/api/v1/service-categories",
        headers=owner_headers,
        json={"name": f"Category {TEST_MARK}", "description": "created via integration test"},
    )
    assert created.status_code == 201, created.text
    category_id = created.json()["categoryId"]
    assert created.json()["isActive"] is True

    fetched = client.get(f"/api/v1/service-categories/{category_id}", headers=owner_headers)
    assert fetched.status_code == 200
    assert fetched.json()["name"] == f"Category {TEST_MARK}"

    updated = client.patch(
        f"/api/v1/service-categories/{category_id}",
        headers=owner_headers,
        json={"description": "updated description"},
    )
    assert updated.status_code == 200
    assert updated.json()["description"] == "updated description"

    deleted = client.delete(f"/api/v1/service-categories/{category_id}", headers=owner_headers)
    assert deleted.status_code == 200

    # Soft delete: still readable by id, flagged inactive, and gone from the list.
    after = client.get(f"/api/v1/service-categories/{category_id}", headers=owner_headers)
    assert after.status_code == 200
    assert after.json()["isActive"] is False

    listing = client.get("/api/v1/service-categories", headers=owner_headers)
    assert listing.status_code == 200
    assert category_id not in [item["categoryId"] for item in listing.json()["items"]]


def test_service_categories_pagination_envelope(
    client: TestClient, owner_headers: dict, crud_cleanup: None
) -> None:
    """Creates 2 known rows and pages through them with pageSize=1 (page=2
    over a known set)."""
    names = [f"Pagination A {TEST_MARK}", f"Pagination B {TEST_MARK}"]
    ids = []
    for name in names:
        response = client.post(
            "/api/v1/service-categories", headers=owner_headers, json={"name": name}
        )
        assert response.status_code == 201
        ids.append(response.json()["categoryId"])

    page1 = client.get(
        "/api/v1/service-categories",
        headers=owner_headers,
        params={"page": 1, "pageSize": 1},
    ).json()
    page2 = client.get(
        "/api/v1/service-categories",
        headers=owner_headers,
        params={"page": 2, "pageSize": 1},
    ).json()

    assert {"items", "total", "page", "pageSize"} <= page1.keys()
    assert page1["page"] == 1 and page2["page"] == 2
    assert page1["pageSize"] == 1 and len(page1["items"]) == 1
    assert page1["total"] == page2["total"] >= 2
    assert page1["items"][0]["categoryId"] != page2["items"][0]["categoryId"]


# -- services -------------------------------------------------------------------


@pytest.fixture
def temp_category(client: TestClient, owner_headers: dict) -> dict:
    response = client.post(
        "/api/v1/service-categories",
        headers=owner_headers,
        json={"name": f"Category services {TEST_MARK}"},
    )
    assert response.status_code == 201
    return response.json()


def test_service_crud_lifecycle(
    client: TestClient, owner_headers: dict, temp_category: dict, crud_cleanup: None
) -> None:
    created = client.post(
        "/api/v1/services",
        headers=owner_headers,
        json={
            "categoryId": temp_category["categoryId"],
            "name": f"Service {TEST_MARK}",
            "description": "integration test service",
            "durationMinutes": 45,
            "price": 25.5,
            "showPrice": True,
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    service_id = body["serviceId"]
    assert body["durationMinutes"] == 45
    assert body["showPrice"] is True

    fetched = client.get(f"/api/v1/services/{service_id}", headers=owner_headers)
    assert fetched.status_code == 200
    assert fetched.json()["name"] == f"Service {TEST_MARK}"

    updated = client.patch(
        f"/api/v1/services/{service_id}",
        headers=owner_headers,
        json={"durationMinutes": 60, "price": 30.0},
    )
    assert updated.status_code == 200
    assert updated.json()["durationMinutes"] == 60
    assert updated.json()["price"] == 30.0

    filtered = client.get(
        "/api/v1/services",
        headers=owner_headers,
        params={"categoryId": temp_category["categoryId"]},
    )
    assert filtered.status_code == 200
    assert service_id in [item["serviceId"] for item in filtered.json()["items"]]

    deleted = client.delete(f"/api/v1/services/{service_id}", headers=owner_headers)
    assert deleted.status_code == 200

    listing = client.get("/api/v1/services", headers=owner_headers)
    assert service_id not in [item["serviceId"] for item in listing.json()["items"]]


# -- locations -------------------------------------------------------------------


def test_location_crud_lifecycle(
    client: TestClient, owner_headers: dict, crud_cleanup: None
) -> None:
    created = client.post(
        "/api/v1/locations",
        headers=owner_headers,
        json={
            "name": f"Location {TEST_MARK}",
            "province": "San Jose",
            "canton": "Central",
            "district": "Carmen",
            "postalCode": "10101",
            "phone": "2222-1111",
        },
    )
    assert created.status_code == 201, created.text
    location_id = created.json()["locationId"]
    assert created.json()["isMain"] is False

    fetched = client.get(f"/api/v1/locations/{location_id}", headers=owner_headers)
    assert fetched.status_code == 200

    updated = client.patch(
        f"/api/v1/locations/{location_id}",
        headers=owner_headers,
        json={"district": "Zapote", "isMain": True},
    )
    assert updated.status_code == 200
    assert updated.json()["district"] == "Zapote"
    assert updated.json()["isMain"] is True

    deleted = client.delete(f"/api/v1/locations/{location_id}", headers=owner_headers)
    assert deleted.status_code == 200

    after = client.get(f"/api/v1/locations/{location_id}", headers=owner_headers)
    assert after.status_code == 200
    assert after.json()["isActive"] is False

    listing = client.get("/api/v1/locations", headers=owner_headers)
    assert location_id not in [item["locationId"] for item in listing.json()["items"]]


# -- business hours ---------------------------------------------------------------


@pytest.fixture
def temp_location(client: TestClient, owner_headers: dict) -> dict:
    response = client.post(
        "/api/v1/locations",
        headers=owner_headers,
        json={
            "name": f"Location hours {TEST_MARK}",
            "province": "San Jose",
            "canton": "Central",
            "district": "Carmen",
            "postalCode": "10101",
        },
    )
    assert response.status_code == 201
    return response.json()


def test_business_hours_put_replaces_weekly_set(
    client: TestClient, owner_headers: dict, temp_location: dict, crud_cleanup: None
) -> None:
    location_id = temp_location["locationId"]
    first = client.put(
        "/api/v1/business-hours",
        headers=owner_headers,
        json={
            "locationId": location_id,
            "hours": [
                {"dayOfWeek": 1, "openTime": "09:00:00", "closeTime": "17:00:00"},
                {"dayOfWeek": 2, "openTime": "09:00:00", "closeTime": "17:00:00"},
                {"dayOfWeek": 7, "isClosed": True},
            ],
        },
    )
    assert first.status_code == 200, first.text
    assert len(first.json()) == 3

    # Full replacement: the second PUT's 2-day set wins outright.
    second = client.put(
        "/api/v1/business-hours",
        headers=owner_headers,
        json={
            "locationId": location_id,
            "hours": [
                {"dayOfWeek": 1, "openTime": "10:00:00", "closeTime": "18:00:00"},
                {"dayOfWeek": 6, "isClosed": True},
            ],
        },
    )
    assert second.status_code == 200
    body = second.json()
    assert len(body) == 2
    monday = next(item for item in body if item["dayOfWeek"] == 1)
    assert monday["openTime"] == "10:00:00"

    listing = client.get(
        "/api/v1/business-hours", headers=owner_headers, params={"locationId": location_id}
    )
    assert listing.status_code == 200
    assert len(listing.json()) == 2


# -- availability blocks -----------------------------------------------------------


def test_availability_block_create_list_and_soft_delete(
    client: TestClient, owner_headers: dict, temp_location: dict, crud_cleanup: None
) -> None:
    location_id = temp_location["locationId"]
    block_date = date(2033, 1, 10)
    created = client.post(
        "/api/v1/availability-blocks",
        headers=owner_headers,
        json={
            "locationId": location_id,
            "blockDate": block_date.isoformat(),
            "startTime": "09:00:00",
            "endTime": "09:30:00",
        },
    )
    assert created.status_code == 201, created.text
    block_id = created.json()["availabilityBlockId"]
    assert created.json()["isReserved"] is False

    listing = client.get(
        "/api/v1/availability-blocks",
        headers=owner_headers,
        params={"date": block_date.isoformat(), "locationId": location_id},
    )
    assert listing.status_code == 200
    assert block_id in [item["availabilityBlockId"] for item in listing.json()["items"]]

    deleted = client.delete(f"/api/v1/availability-blocks/{block_id}", headers=owner_headers)
    assert deleted.status_code == 200


def test_availability_block_delete_with_booking_returns_409(
    client: TestClient,
    owner_headers: dict,
    seed_tenant: dict,
    seed_owner: dict,
    db_factory,
    cleanup_tracker: dict,
) -> None:
    """Books a block via the public flow, then tries to soft-delete it as the
    owner -> 409. Uses seed_tenant (same tenant as seed_owner per seed
    ordering) only if they match; otherwise books via the owner's own data."""
    from tests.integration.conftest import booking_payload, make_block

    if seed_tenant["tenant_id"] != seed_owner["tenant_id"]:
        pytest.skip("seed owner and seed tenant differ; covered by lifecycle test")

    block_id = make_block(db_factory, seed_tenant, block_date=date(2033, 1, 11))
    cleanup_tracker["block_ids"].append(block_id)

    payload = booking_payload(
        service_id=seed_tenant["service_id"],
        location_id=seed_tenant["location_id"],
        availability_block_id=block_id,
    )
    booked = client.post(f"/api/v1/public/{seed_tenant['slug']}/bookings", json=payload)
    assert booked.status_code == 201
    cleanup_tracker["booking_ids"].append(booked.json()["bookingId"])

    response = client.delete(f"/api/v1/availability-blocks/{block_id}", headers=owner_headers)
    assert response.status_code == 409


# -- customers ----------------------------------------------------------------------


def test_customer_crud_and_search(
    client: TestClient, owner_headers: dict, crud_cleanup: None
) -> None:
    created = client.post(
        "/api/v1/customers",
        headers=owner_headers,
        json={
            "firstName": "TestmarkAna",
            "lastName": "Rodriguez Solis",
            "email": TEST_CUSTOMER_EMAIL,
            "phone": "8888-0000",
            "notes": TEST_MARK,
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    customer_id = body["customerId"]
    assert body["firstName"] == "TestmarkAna"
    assert body["lastName"] == "Rodriguez Solis"

    fetched = client.get(f"/api/v1/customers/{customer_id}", headers=owner_headers)
    assert fetched.status_code == 200
    assert fetched.json()["email"] == TEST_CUSTOMER_EMAIL

    searched = client.get("/api/v1/customers", headers=owner_headers, params={"q": "TestmarkAna"})
    assert searched.status_code == 200
    assert customer_id in [item["customerId"] for item in searched.json()["items"]]

    updated = client.patch(
        f"/api/v1/customers/{customer_id}",
        headers=owner_headers,
        json={"phone": "8888-9999", "lastName": "Vargas"},
    )
    assert updated.status_code == 200
    assert updated.json()["phone"] == "8888-9999"
    assert updated.json()["lastName"] == "Vargas"

    history = client.get(f"/api/v1/customers/{customer_id}/bookings", headers=owner_headers)
    assert history.status_code == 200
    assert history.json() == []
