"""Aislamiento multi-tenant (critico, cero tolerancia).

Con owner1_token (dominio 1) y owner2_token (dominio 2):
- GET por ID directo de un recurso del otro tenant -> 404.
- PATCH y DELETE de un recurso ajeno -> 404 y no se modifica (verificado por SQL).
- Los listados de un tenant no incluyen recursos del otro.
- Los filtros de query (?categoryId de B desde A) no filtran datos ajenos.

Cubre service-categories, services, locations, availability-blocks,
customers y bookings (todo lo que tiene GET/PATCH/DELETE por id con guarda
de tenant, ver `_require` en cada router de apps/api/app/routers/)."""

from __future__ import annotations

import httpx
import pytest

from conftest import bearer, sql_scalar
from test_api_helpers import assert_rfc7807, unique_tag

pytestmark = pytest.mark.e2e


# ---------------------------------------------------------------------------
# service-categories
# ---------------------------------------------------------------------------


def test_category_cross_tenant_get_patch_delete_404(
    client: httpx.Client, owner1_token: str, owner2_token: str, cleanup_sql
) -> None:
    tag = unique_tag()
    h1 = bearer(owner1_token)
    h2 = bearer(owner2_token)

    cat = client.post("/service-categories", json={"name": f"ZZ_E2E_ISO_CAT_{tag}"}, headers=h1).json()
    category_id = cat["categoryId"]
    cleanup_sql(f"DELETE FROM service_categories WHERE category_id = {category_id}")

    get_resp = client.get(f"/service-categories/{category_id}", headers=h2)
    assert get_resp.status_code == 404
    assert_rfc7807(get_resp.json(), 404)

    patch_resp = client.patch(
        f"/service-categories/{category_id}", json={"name": "HACKED"}, headers=h2
    )
    assert patch_resp.status_code == 404
    assert_rfc7807(patch_resp.json(), 404)

    delete_resp = client.delete(f"/service-categories/{category_id}", headers=h2)
    assert delete_resp.status_code == 404
    assert_rfc7807(delete_resp.json(), 404)

    assert sql_scalar(
        f"SELECT name FROM service_categories WHERE category_id = {category_id}"
    ) == f"ZZ_E2E_ISO_CAT_{tag}"
    assert sql_scalar(
        f"SELECT is_active FROM service_categories WHERE category_id = {category_id}"
    ) == "1"


def test_category_listing_does_not_leak_across_tenants(
    client: httpx.Client, owner1_token: str, owner2_token: str, cleanup_sql
) -> None:
    tag = unique_tag()
    name = f"ZZ_E2E_ISO_LISTCAT_{tag}"
    cat = client.post(
        "/service-categories", json={"name": name}, headers=bearer(owner2_token)
    ).json()
    cleanup_sql(f"DELETE FROM service_categories WHERE category_id = {cat['categoryId']}")

    list_resp = client.get(
        "/service-categories", params={"pageSize": 100}, headers=bearer(owner1_token)
    )
    names = [c["name"] for c in list_resp.json()["items"]]
    assert name not in names


# ---------------------------------------------------------------------------
# services (incluye filtro ?categoryId)
# ---------------------------------------------------------------------------


def test_service_cross_tenant_get_patch_delete_404(
    client: httpx.Client, owner1_token: str, owner2_token: str, cleanup_sql
) -> None:
    tag = unique_tag()
    h1 = bearer(owner1_token)
    h2 = bearer(owner2_token)

    cat_id = client.post(
        "/service-categories", json={"name": f"ZZ_E2E_ISO_SVCCAT_{tag}"}, headers=h1
    ).json()["categoryId"]
    cleanup_sql(f"DELETE FROM service_categories WHERE category_id = {cat_id}")

    svc = client.post(
        "/services",
        json={"categoryId": cat_id, "name": f"ZZ_E2E_ISO_SVC_{tag}", "durationMinutes": 30},
        headers=h1,
    ).json()
    service_id = svc["serviceId"]
    cleanup_sql(f"DELETE FROM services WHERE service_id = {service_id}")

    assert client.get(f"/services/{service_id}", headers=h2).status_code == 404
    patch_resp = client.patch(f"/services/{service_id}", json={"name": "HACKED"}, headers=h2)
    assert patch_resp.status_code == 404
    delete_resp = client.delete(f"/services/{service_id}", headers=h2)
    assert delete_resp.status_code == 404

    assert sql_scalar(
        f"SELECT name FROM services WHERE service_id = {service_id}"
    ) == f"ZZ_E2E_ISO_SVC_{tag}"
    assert sql_scalar(f"SELECT is_active FROM services WHERE service_id = {service_id}") == "1"


def test_service_category_filter_from_other_tenant_does_not_leak(
    client: httpx.Client, owner1_token: str, owner2_token: str, cleanup_sql
) -> None:
    """?categoryId apuntando a una categoria del otro dominio no debe
    devolver los services de esa categoria (el filtro siempre corre en
    conjuncion con tenant_id = tenant_id del token, ver
    ServiceRepository.list_by_tenant)."""
    tag = unique_tag()
    h1 = bearer(owner1_token)
    h2 = bearer(owner2_token)

    cat1_id = client.post(
        "/service-categories", json={"name": f"ZZ_E2E_ISO_FILTCAT_{tag}"}, headers=h1
    ).json()["categoryId"]
    cleanup_sql(f"DELETE FROM service_categories WHERE category_id = {cat1_id}")
    svc1_id = client.post(
        "/services",
        json={"categoryId": cat1_id, "name": f"ZZ_E2E_ISO_FILTSVC_{tag}", "durationMinutes": 30},
        headers=h1,
    ).json()["serviceId"]
    cleanup_sql(f"DELETE FROM services WHERE service_id = {svc1_id}")

    # owner2 consulta con el categoryId de owner1: no debe ver nada.
    r = client.get("/services", params={"categoryId": cat1_id, "pageSize": 100}, headers=h2)
    assert r.status_code == 200
    assert r.json()["total"] == 0
    assert r.json()["items"] == []


def test_service_listing_does_not_leak_across_tenants(
    client: httpx.Client, owner1_token: str, owner2_token: str, cleanup_sql
) -> None:
    tag = unique_tag()
    h2 = bearer(owner2_token)
    cat_id = client.post(
        "/service-categories", json={"name": f"ZZ_E2E_ISO_LISTCAT2_{tag}"}, headers=h2
    ).json()["categoryId"]
    cleanup_sql(f"DELETE FROM service_categories WHERE category_id = {cat_id}")
    name = f"ZZ_E2E_ISO_LISTSVC_{tag}"
    svc_id = client.post(
        "/services", json={"categoryId": cat_id, "name": name, "durationMinutes": 30}, headers=h2
    ).json()["serviceId"]
    cleanup_sql(f"DELETE FROM services WHERE service_id = {svc_id}")

    list_resp = client.get("/services", params={"pageSize": 100}, headers=bearer(owner1_token))
    names = [s["name"] for s in list_resp.json()["items"]]
    assert name not in names


# ---------------------------------------------------------------------------
# locations
# ---------------------------------------------------------------------------


def test_location_cross_tenant_get_patch_delete_404(
    client: httpx.Client, owner1_token: str, owner2_token: str, cleanup_sql
) -> None:
    tag = unique_tag()
    h1 = bearer(owner1_token)
    h2 = bearer(owner2_token)

    loc = client.post(
        "/locations",
        json={
            "name": f"ZZ_E2E_ISO_LOC_{tag}",
            "province": "San Jose",
            "canton": "Central",
            "district": "Carmen",
            "postalCode": "10101",
        },
        headers=h1,
    ).json()
    location_id = loc["locationId"]
    cleanup_sql(f"DELETE FROM locations WHERE location_id = {location_id}")

    assert client.get(f"/locations/{location_id}", headers=h2).status_code == 404
    patch_resp = client.patch(f"/locations/{location_id}", json={"name": "HACKED"}, headers=h2)
    assert patch_resp.status_code == 404
    delete_resp = client.delete(f"/locations/{location_id}", headers=h2)
    assert delete_resp.status_code == 404

    assert sql_scalar(
        f"SELECT name FROM locations WHERE location_id = {location_id}"
    ) == f"ZZ_E2E_ISO_LOC_{tag}"
    assert sql_scalar(f"SELECT is_active FROM locations WHERE location_id = {location_id}") == "1"


def test_location_listing_does_not_leak_across_tenants(
    client: httpx.Client, owner1_token: str, owner2_token: str, cleanup_sql
) -> None:
    tag = unique_tag()
    name = f"ZZ_E2E_ISO_LISTLOC_{tag}"
    loc_id = client.post(
        "/locations",
        json={
            "name": name,
            "province": "San Jose",
            "canton": "Central",
            "district": "Carmen",
            "postalCode": "10101",
        },
        headers=bearer(owner2_token),
    ).json()["locationId"]
    cleanup_sql(f"DELETE FROM locations WHERE location_id = {loc_id}")

    list_resp = client.get("/locations", params={"pageSize": 100}, headers=bearer(owner1_token))
    names = [loc["name"] for loc in list_resp.json()["items"]]
    assert name not in names


# ---------------------------------------------------------------------------
# availability-blocks
# ---------------------------------------------------------------------------


def test_availability_block_cross_tenant_get_delete_404(
    client: httpx.Client, owner1_token: str, owner2_token: str, cleanup_sql
) -> None:
    h1 = bearer(owner1_token)
    h2 = bearer(owner2_token)

    block = client.post(
        "/availability-blocks",
        json={"locationId": 1, "blockDate": "2027-05-01", "startTime": "09:00:00", "endTime": "09:30:00"},
        headers=h1,
    ).json()
    block_id = block["availabilityBlockId"]
    cleanup_sql(f"DELETE FROM availability_blocks WHERE availability_block_id = {block_id}")

    assert client.get(f"/availability-blocks/{block_id}", headers=h2).status_code == 404
    delete_resp = client.delete(f"/availability-blocks/{block_id}", headers=h2)
    assert delete_resp.status_code == 404

    assert sql_scalar(
        f"SELECT is_active FROM availability_blocks WHERE availability_block_id = {block_id}"
    ) == "1"


def test_availability_block_listing_does_not_leak_across_tenants(
    client: httpx.Client, owner1_token: str, owner2_token: str, cleanup_sql
) -> None:
    """owner2 crea un bloque en su propia localidad (locationId=3, seed);
    owner1 no debe verlo en su listado aunque comparta la misma fecha."""
    block_id = client.post(
        "/availability-blocks",
        json={"locationId": 3, "blockDate": "2027-05-02", "startTime": "09:00:00", "endTime": "09:30:00"},
        headers=bearer(owner2_token),
    ).json()["availabilityBlockId"]
    cleanup_sql(f"DELETE FROM availability_blocks WHERE availability_block_id = {block_id}")

    list_resp = client.get(
        "/availability-blocks", params={"date": "2027-05-02", "pageSize": 100}, headers=bearer(owner1_token)
    )
    ids = [b["availabilityBlockId"] for b in list_resp.json()["items"]]
    assert block_id not in ids


def test_availability_block_location_filter_from_other_tenant_does_not_leak(
    client: httpx.Client, owner1_token: str, owner2_token: str, cleanup_sql
) -> None:
    """?locationId=3 (owner2's real location) consultado por owner1 no
    debe devolver los bloques de owner2 (el filtro corre en conjuncion con
    tenant_id = tenant_id del token)."""
    block_id = client.post(
        "/availability-blocks",
        json={"locationId": 3, "blockDate": "2027-05-03", "startTime": "09:00:00", "endTime": "09:30:00"},
        headers=bearer(owner2_token),
    ).json()["availabilityBlockId"]
    cleanup_sql(f"DELETE FROM availability_blocks WHERE availability_block_id = {block_id}")

    r = client.get(
        "/availability-blocks", params={"locationId": 3, "pageSize": 100}, headers=bearer(owner1_token)
    )
    assert r.status_code == 200
    assert r.json()["total"] == 0


# ---------------------------------------------------------------------------
# customers
# ---------------------------------------------------------------------------


def test_customer_cross_tenant_get_patch_404(
    client: httpx.Client, owner1_token: str, owner2_token: str, cleanup_sql
) -> None:
    tag = unique_tag()
    h1 = bearer(owner1_token)
    h2 = bearer(owner2_token)

    customer = client.post(
        "/customers",
        json={
            "firstName": "Zz",
            "lastName": "Iso Customer",
            "email": f"zz.e2e.iso.customer.{tag}@example.com",
            "phone": "8888-9090",
        },
        headers=h1,
    ).json()
    customer_id = customer["customerId"]
    cleanup_sql(f"DELETE FROM customers WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_emails WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_phones WHERE customer_id = {customer_id}")

    assert client.get(f"/customers/{customer_id}", headers=h2).status_code == 404
    patch_resp = client.patch(f"/customers/{customer_id}", json={"notes": "HACKED"}, headers=h2)
    assert patch_resp.status_code == 404
    bookings_resp = client.get(f"/customers/{customer_id}/bookings", headers=h2)
    assert bookings_resp.status_code == 404

    assert sql_scalar(f"SELECT notes FROM customers WHERE customer_id = {customer_id}") == "NULL"


def test_customer_listing_does_not_leak_across_tenants(
    client: httpx.Client, owner1_token: str, owner2_token: str, cleanup_sql
) -> None:
    tag = unique_tag()
    email = f"zz.e2e.iso.listcustomer.{tag}@example.com"
    customer_id = client.post(
        "/customers",
        json={"firstName": "Zz", "lastName": "Iso List", "email": email, "phone": "8888-9191"},
        headers=bearer(owner2_token),
    ).json()["customerId"]
    cleanup_sql(f"DELETE FROM customers WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_emails WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_phones WHERE customer_id = {customer_id}")

    list_resp = client.get("/customers", params={"pageSize": 100}, headers=bearer(owner1_token))
    emails = [c["email"] for c in list_resp.json()["items"]]
    assert email not in emails


# ---------------------------------------------------------------------------
# bookings
# ---------------------------------------------------------------------------


def test_booking_cross_tenant_get_and_actions_404(
    client: httpx.Client, owner1_token: str, owner2_token: str, cleanup_sql
) -> None:
    tag = unique_tag()
    h1 = bearer(owner1_token)
    h2 = bearer(owner2_token)

    block_id = client.post(
        "/availability-blocks",
        json={"locationId": 1, "blockDate": "2027-05-04", "startTime": "09:00:00", "endTime": "09:30:00"},
        headers=h1,
    ).json()["availabilityBlockId"]
    cleanup_sql(f"DELETE FROM availability_blocks WHERE availability_block_id = {block_id}")

    customer_id = client.post(
        "/customers",
        json={
            "firstName": "Zz",
            "lastName": "Iso Booking",
            "email": f"zz.e2e.iso.booking.{tag}@example.com",
            "phone": "8888-9292",
        },
        headers=h1,
    ).json()["customerId"]
    cleanup_sql(f"DELETE FROM customers WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_emails WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_phones WHERE customer_id = {customer_id}")

    booking_id = client.post(
        "/bookings",
        json={"serviceId": 1, "locationId": 1, "availabilityBlockId": block_id, "customerId": customer_id},
        headers=h1,
    ).json()["bookingId"]
    cleanup_sql(f"DELETE FROM bookings WHERE booking_id = {booking_id}")
    cleanup_sql(f"DELETE FROM tracking_codes WHERE booking_id = {booking_id}")
    cleanup_sql(
        f"DELETE FROM audit_logs WHERE entity_name = 'bookings' AND entity_id = {booking_id}"
    )

    assert client.get(f"/bookings/{booking_id}", headers=h2).status_code == 404
    assert client.post(f"/bookings/{booking_id}/confirm", headers=h2).status_code == 404
    assert client.post(f"/bookings/{booking_id}/cancel", headers=h2).status_code == 404
    assert client.post(f"/bookings/{booking_id}/complete", headers=h2).status_code == 404
    resched_resp = client.post(
        f"/bookings/{booking_id}/reschedule", json={"newAvailabilityBlockId": block_id}, headers=h2
    )
    assert resched_resp.status_code == 404

    # No se modifico el estado (sigue pendiente = booking_status_id 1).
    assert sql_scalar(
        f"SELECT er.name FROM bookings r JOIN booking_statuses er "
        f"ON er.booking_status_id = r.booking_status_id WHERE r.booking_id = {booking_id}"
    ) == "pending"


def test_booking_listing_does_not_leak_across_tenants(
    client: httpx.Client, owner1_token: str, owner2_token: str, cleanup_sql
) -> None:
    block_id = client.post(
        "/availability-blocks",
        json={"locationId": 3, "blockDate": "2027-05-05", "startTime": "09:00:00", "endTime": "09:30:00"},
        headers=bearer(owner2_token),
    ).json()["availabilityBlockId"]
    cleanup_sql(f"DELETE FROM availability_blocks WHERE availability_block_id = {block_id}")

    tag = unique_tag()
    customer_id = client.post(
        "/customers",
        json={
            "firstName": "Zz",
            "lastName": "Iso List Booking",
            "email": f"zz.e2e.iso.listbooking.{tag}@example.com",
            "phone": "8888-9393",
        },
        headers=bearer(owner2_token),
    ).json()["customerId"]
    cleanup_sql(f"DELETE FROM customers WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_emails WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_phones WHERE customer_id = {customer_id}")

    booking_id = client.post(
        "/bookings",
        json={
            "serviceId": 4,
            "locationId": 3,
            "availabilityBlockId": block_id,
            "customerId": customer_id,
        },
        headers=bearer(owner2_token),
    ).json()["bookingId"]
    cleanup_sql(f"DELETE FROM bookings WHERE booking_id = {booking_id}")
    cleanup_sql(f"DELETE FROM tracking_codes WHERE booking_id = {booking_id}")
    cleanup_sql(
        f"DELETE FROM audit_logs WHERE entity_name = 'bookings' AND entity_id = {booking_id}"
    )

    list_resp = client.get(
        "/bookings", params={"date": "2027-05-05", "pageSize": 100}, headers=bearer(owner1_token)
    )
    ids = [b["bookingId"] for b in list_resp.json()["items"]]
    assert booking_id not in ids
