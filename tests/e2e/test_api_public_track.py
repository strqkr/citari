"""Storefront publico + tracking, sin auth (incluye la clave natural: un
bloque cuya reserva se cancela queda re-reservable).

Cubre:
- GET /public/{slug}, /public/{slug}/services, /public/{slug}/availability
- POST /public/{slug}/bookings
- GET /track/{code}, POST /track/{code}/cancel, POST /track/{code}/reschedule
- GET /business-types (catalogo publico usado por register-owner)
- 404 para slug/codigo inexistente, 422 para payload de reserva invalido
"""

from __future__ import annotations

import httpx
import pytest

from conftest import bearer, run_sql, sql_scalar
from test_api_helpers import assert_rfc7807, unique_tag

pytestmark = pytest.mark.e2e


# ---------------------------------------------------------------------------
# GET /business-types (publico)
# ---------------------------------------------------------------------------


def test_business_types_list_shape(client: httpx.Client) -> None:
    r = client.get("/business-types")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) > 0
    item = body[0]
    assert set(item.keys()) == {"businessTypeId", "name", "description"}


# ---------------------------------------------------------------------------
# GET /public/{slug}
# ---------------------------------------------------------------------------


def test_public_tenant_shape(client: httpx.Client, seed_identities: dict) -> None:
    r = client.get(f"/public/{seed_identities['slug1']}")
    assert r.status_code == 200
    body = r.json()
    assert body["slug"] == seed_identities["slug1"]
    assert set(body.keys()) == {
        "tenantId",
        "slug",
        "name",
        "description",
        "publicMessage",
        "email",
        "phone",
        "logoUrl",
        "status",
    }


def test_public_tenant_not_found_404(client: httpx.Client) -> None:
    r = client.get("/public/zz-slug-que-no-existe-jamas")
    assert r.status_code == 404
    assert_rfc7807(r.json(), 404)


# ---------------------------------------------------------------------------
# GET /public/{slug}/services
# ---------------------------------------------------------------------------


def test_public_services_shape(client: httpx.Client, seed_identities: dict) -> None:
    r = client.get(f"/public/{seed_identities['slug1']}/services")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    if body:
        item = body[0]
        assert set(item.keys()) == {
            "serviceId",
            "name",
            "description",
            "durationMinutes",
            "price",
            "showPrice",
        }


def test_public_services_unknown_slug_returns_empty_list(client: httpx.Client) -> None:
    """A diferencia de GET /public/{slug} (404 si el slug no existe), el WP6
    brief define que /services y /availability para un slug inexistente
    devuelven lista vacia en vez de 404 (documentado aqui como comportamiento
    real, no un defecto: son sub-recursos de listado, no de detalle)."""
    r = client.get("/public/zz-slug-que-no-existe-jamas/services")
    assert r.status_code == 200
    assert r.json() == []


# ---------------------------------------------------------------------------
# GET /public/{slug}/availability
# ---------------------------------------------------------------------------


def test_public_availability_shape(client: httpx.Client, seed_identities: dict) -> None:
    r = client.get(f"/public/{seed_identities['slug1']}/availability")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    if body:
        item = body[0]
        assert set(item.keys()) == {
            "availabilityBlockId",
            "blockDate",
            "startTime",
            "endTime",
            "isReserved",
            "locationId",
        }


# ---------------------------------------------------------------------------
# POST /public/{slug}/bookings - validacion
# ---------------------------------------------------------------------------


def test_public_booking_invalid_payload_422(client: httpx.Client, seed_identities: dict) -> None:
    r = client.post(f"/public/{seed_identities['slug1']}/bookings", json={})
    assert r.status_code == 422
    body = r.json()
    assert_rfc7807(body, 422)
    # FastAPI/pydantic wraps una lista de errores; aqui viaja stringificada
    # dentro de detail (ver docs/api-handover.md - no es el shape nativo
    # {"detail": [...]} de FastAPI, esta re-envuelto en RFC 7807).
    assert "serviceId" in body["detail"] or "field required" in body["detail"].lower()


def test_public_booking_unknown_slug_404(client: httpx.Client) -> None:
    r = client.post(
        "/public/zz-slug-que-no-existe-jamas/bookings",
        json={
            "serviceId": 1,
            "locationId": 1,
            "availabilityBlockId": 1,
            "customer": {
                "firstName": "Zz",
                "lastName": "Test",
                "email": "zz.nowhere@example.com",
                "phone": "8888-0000",
            },
        },
    )
    assert r.status_code == 404
    assert_rfc7807(r.json(), 404)


# ---------------------------------------------------------------------------
# GET /track/{code} y POST /track/{code}/cancel - 404
# ---------------------------------------------------------------------------


def test_track_get_invalid_code_404(client: httpx.Client) -> None:
    r = client.get("/track/CITARI-NOEXISTE")
    assert r.status_code == 404
    assert_rfc7807(r.json(), 404)


def test_track_cancel_invalid_code_404(client: httpx.Client) -> None:
    r = client.post("/track/CITARI-NOEXISTE/cancel")
    assert r.status_code == 404
    assert_rfc7807(r.json(), 404)


def test_track_reschedule_invalid_code_404(client: httpx.Client) -> None:
    r = client.post("/track/CITARI-NOEXISTE/reschedule", json={"newAvailabilityBlockId": 1})
    assert r.status_code == 404
    assert_rfc7807(r.json(), 404)


# ---------------------------------------------------------------------------
# Ciclo completo: publico -> crear -> track -> cancelar -> el bloque vuelve a
# estar libre -> se puede reservar de nuevo ("clave natural").
# ---------------------------------------------------------------------------


def test_public_book_track_cancel_frees_block_for_rebooking(
    client: httpx.Client,
    seed_identities: dict,
    owner1_token: str,
    cleanup_sql,
) -> None:
    tag = unique_tag()
    slug = seed_identities["slug1"]
    email = f"zz.e2e.{tag}@example.com"

    # 1. El owner crea un bloque de disponibilidad temporal.
    block_resp = client.post(
        "/availability-blocks",
        json={
            "locationId": 1,
            "blockDate": "2027-01-15",
            "startTime": "09:00:00",
            "endTime": "09:30:00",
        },
        headers=bearer(owner1_token),
    )
    assert block_resp.status_code == 201, block_resp.text
    block_id = block_resp.json()["availabilityBlockId"]
    cleanup_sql(f"DELETE FROM availability_blocks WHERE availability_block_id = {block_id}")

    # 2. Aparece en la disponibilidad publica.
    avail = client.get(f"/public/{slug}/availability", params={"date": "2027-01-15"})
    assert avail.status_code == 200
    assert block_id in [b["availabilityBlockId"] for b in avail.json()]

    # 3. Reserva publica.
    booking_resp = client.post(
        f"/public/{slug}/bookings",
        json={
            "serviceId": 1,
            "locationId": 1,
            "availabilityBlockId": block_id,
            "customer": {
                "firstName": "Zz",
                "lastName": "Rebook",
                "email": email,
                "phone": "8888-9999",
            },
            "customerNotes": "e2e rebook cycle",
        },
    )
    assert booking_resp.status_code == 201, booking_resp.text
    booking = booking_resp.json()
    assert booking["status"] == "pending"
    tracking_code = booking["trackingCode"]
    first_booking_id = booking["bookingId"]
    customer_id = sql_scalar(f"SELECT customer_id FROM customer_emails WHERE email = '{email}'")
    cleanup_sql(f"DELETE FROM customers WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_emails WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_phones WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM bookings WHERE booking_id = {first_booking_id}")
    cleanup_sql(f"DELETE FROM tracking_codes WHERE booking_id = {first_booking_id}")
    cleanup_sql(
        "DELETE FROM audit_logs WHERE entity_name = 'bookings' "
        f"AND entity_id = {first_booking_id}"
    )

    # 4. El bloque desaparece de la disponibilidad publica mientras esta reservado.
    avail_after_book = client.get(f"/public/{slug}/availability", params={"date": "2027-01-15"})
    assert block_id not in [b["availabilityBlockId"] for b in avail_after_book.json()]

    # 5. GET /track/{code} refleja la reserva.
    track_resp = client.get(f"/track/{tracking_code}")
    assert track_resp.status_code == 200
    assert track_resp.json()["bookingId"] == first_booking_id
    assert track_resp.json()["status"] == "pending"

    # 6. Cancelar por codigo de rastreo.
    cancel_resp = client.post(f"/track/{tracking_code}/cancel")
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "cancelled"

    # 7. El bloque vuelve a estar libre en disponibilidad publica (trigger
    # tr_liberar_bloque_al_cancelar, rama a).
    avail_after_cancel = client.get(f"/public/{slug}/availability", params={"date": "2027-01-15"})
    assert block_id in [b["availabilityBlockId"] for b in avail_after_cancel.json()]
    assert sql_scalar(
        f"SELECT is_active FROM availability_blocks WHERE availability_block_id = {block_id}"
    ) == "1"
    assert sql_scalar(
        f"SELECT availability_block_id FROM bookings WHERE booking_id = {first_booking_id}"
    ) == "NULL"

    # 8. Se puede reservar de nuevo el mismo bloque (clave natural: no quedo
    # "quemado" tras la cancelacion).
    rebook_resp = client.post(
        f"/public/{slug}/bookings",
        json={
            "serviceId": 1,
            "locationId": 1,
            "availabilityBlockId": block_id,
            "customer": {
                "firstName": "Zz",
                "lastName": "Rebook",
                "email": email,
                "phone": "8888-9999",
            },
            "customerNotes": "e2e rebook cycle - segunda vuelta",
        },
    )
    assert rebook_resp.status_code == 201, rebook_resp.text
    second_booking_id = rebook_resp.json()["bookingId"]
    assert second_booking_id != first_booking_id
    cleanup_sql(f"DELETE FROM bookings WHERE booking_id = {second_booking_id}")
    cleanup_sql(f"DELETE FROM tracking_codes WHERE booking_id = {second_booking_id}")
    cleanup_sql(
        "DELETE FROM audit_logs WHERE entity_name = 'bookings' "
        f"AND entity_id = {second_booking_id}"
    )


def test_track_reschedule_moves_booking_and_frees_old_block(
    client: httpx.Client,
    seed_identities: dict,
    owner1_token: str,
    cleanup_sql,
) -> None:
    tag = unique_tag()
    slug = seed_identities["slug1"]
    email = f"zz.e2e.resched.{tag}@example.com"

    block_a = client.post(
        "/availability-blocks",
        json={"locationId": 1, "blockDate": "2027-01-16", "startTime": "10:00:00", "endTime": "10:30:00"},
        headers=bearer(owner1_token),
    ).json()["availabilityBlockId"]
    block_b = client.post(
        "/availability-blocks",
        json={"locationId": 1, "blockDate": "2027-01-16", "startTime": "11:00:00", "endTime": "11:30:00"},
        headers=bearer(owner1_token),
    ).json()["availabilityBlockId"]
    cleanup_sql(f"DELETE FROM availability_blocks WHERE availability_block_id IN ({block_a}, {block_b})")

    booking = client.post(
        f"/public/{slug}/bookings",
        json={
            "serviceId": 1,
            "locationId": 1,
            "availabilityBlockId": block_a,
            "customer": {"firstName": "Zz", "lastName": "Resched", "email": email, "phone": "8888-1111"},
        },
    ).json()
    booking_id = booking["bookingId"]
    tracking_code = booking["trackingCode"]
    customer_id = sql_scalar(f"SELECT customer_id FROM customer_emails WHERE email = '{email}'")
    cleanup_sql(f"DELETE FROM customers WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_emails WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_phones WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM bookings WHERE booking_id = {booking_id}")
    cleanup_sql(f"DELETE FROM tracking_codes WHERE booking_id = {booking_id}")
    cleanup_sql(
        f"DELETE FROM audit_logs WHERE entity_name = 'bookings' AND entity_id = {booking_id}"
    )

    resched_resp = client.post(
        f"/track/{tracking_code}/reschedule", json={"newAvailabilityBlockId": block_b}
    )
    assert resched_resp.status_code == 200, resched_resp.text
    resched_body = resched_resp.json()
    assert resched_body["startTime"] == "11:00:00"

    # El bloque anterior (a) vuelve a estar activo/libre; el nuevo (b) queda ocupado.
    assert sql_scalar(
        f"SELECT is_active FROM availability_blocks WHERE availability_block_id = {block_a}"
    ) == "1"
    avail = client.get(f"/public/{slug}/availability", params={"date": "2027-01-16"}).json()
    ids = [b["availabilityBlockId"] for b in avail]
    assert block_a in ids
    assert block_b not in ids
