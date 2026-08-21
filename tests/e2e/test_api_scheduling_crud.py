"""CRUD owner - agenda: availability-blocks, customers, bookings. Por
recurso: happy path crear->leer->actualizar (o transicion de estado para
bookings, que no tiene PATCH), 422 con payload invalido, 401 sin token,
paginacion.

Nota de orden de limpieza: cleanup_sql corre en orden LIFO (ver conftest.py).
Las FK reales de la base (confirmadas via sys.foreign_keys) son todas
NO_ACTION salvo bookings.availability_block_id (SET_NULL). Por eso
en todo este archivo se registra primero el cleanup del recurso padre
(bloque/cliente) y despues el del hijo (reservacion) que lo referencia -
LIFO invierte ese orden y borra hijo antes que padre. tracking_codes y
audit_logs siempre se registran junto con la reservacion que los genera
(triggers 1/2/3 de 07-triggers.sql las crean automaticamente)."""

from __future__ import annotations

import httpx
import pytest

from conftest import bearer, sql_scalar
from test_api_helpers import assert_page_envelope, assert_rfc7807, unique_tag

pytestmark = pytest.mark.e2e


def _cleanup_booking(cleanup_sql, booking_id: int) -> None:
    """Registra, en orden seguro, la limpieza de todo lo que una reserva deja
    atras: tracking_codes (hijo de bookings) y audit_logs (sin FK,
    pero igual se limpia para no dejar filas de auditoria huerfanas)."""
    cleanup_sql(f"DELETE FROM bookings WHERE booking_id = {booking_id}")
    cleanup_sql(f"DELETE FROM tracking_codes WHERE booking_id = {booking_id}")
    cleanup_sql(
        f"DELETE FROM audit_logs WHERE entity_name = 'bookings' AND entity_id = {booking_id}"
    )


# ---------------------------------------------------------------------------
# availability-blocks
# ---------------------------------------------------------------------------


def test_availability_block_create_and_read(
    client: httpx.Client, owner1_token: str, cleanup_sql
) -> None:
    h = bearer(owner1_token)
    create_resp = client.post(
        "/availability-blocks",
        json={"locationId": 1, "blockDate": "2027-03-01", "startTime": "08:00:00", "endTime": "08:30:00"},
        headers=h,
    )
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    block_id = created["availabilityBlockId"]
    assert created["isReserved"] is False
    cleanup_sql(f"DELETE FROM availability_blocks WHERE availability_block_id = {block_id}")

    get_resp = client.get(f"/availability-blocks/{block_id}", headers=h)
    assert get_resp.status_code == 200
    assert get_resp.json()["blockDate"] == "2027-03-01"


def test_availability_block_invalid_payload_422(client: httpx.Client, owner1_token: str) -> None:
    h = bearer(owner1_token)
    r1 = client.post("/availability-blocks", json={"locationId": 1}, headers=h)
    assert r1.status_code == 422
    assert_rfc7807(r1.json(), 422)

    r2 = client.post(
        "/availability-blocks",
        json={"locationId": 1, "blockDate": "not-a-date", "startTime": "08:00:00", "endTime": "08:30:00"},
        headers=h,
    )
    assert r2.status_code == 422
    assert_rfc7807(r2.json(), 422)


def test_availability_block_invalid_range_400(client: httpx.Client, owner1_token: str) -> None:
    """fecha_inicio >= fecha_final -> THROW 50004 -> 400 (docs/sql-signatures.md)."""
    h = bearer(owner1_token)
    r = client.post(
        "/availability-blocks",
        json={"locationId": 1, "blockDate": "2027-03-01", "startTime": "10:00:00", "endTime": "09:00:00"},
        headers=h,
    )
    assert r.status_code == 400, r.text
    assert_rfc7807(r.json(), 400)


def test_availability_block_requires_auth_401(client: httpx.Client) -> None:
    r = client.get("/availability-blocks")
    assert r.status_code == 401
    assert_rfc7807(r.json(), 401)


def test_availability_block_pagination_envelope(
    client: httpx.Client, owner1_token: str, cleanup_sql
) -> None:
    h = bearer(owner1_token)
    ids = []
    for i in range(2):
        r = client.post(
            "/availability-blocks",
            json={"locationId": 1, "blockDate": "2027-03-02", "startTime": f"{8 + i:02d}:00:00", "endTime": f"{8 + i:02d}:30:00"},
            headers=h,
        )
        bid = r.json()["availabilityBlockId"]
        ids.append(bid)
        cleanup_sql(f"DELETE FROM availability_blocks WHERE availability_block_id = {bid}")

    list_resp = client.get(
        "/availability-blocks", params={"date": "2027-03-02", "pageSize": 1}, headers=h
    )
    body = list_resp.json()
    assert_page_envelope(body)
    assert len(body["items"]) == 1
    assert body["total"] >= 2


# ---------------------------------------------------------------------------
# customers
# ---------------------------------------------------------------------------


def test_customer_create_read_update_cycle(
    client: httpx.Client, owner1_token: str, cleanup_sql
) -> None:
    tag = unique_tag()
    h = bearer(owner1_token)
    email = f"zz.e2e.customer.{tag}@example.com"

    create_resp = client.post(
        "/customers",
        json={"firstName": "Zz", "lastName": "Cliente Prueba", "email": email, "phone": "8888-3333"},
        headers=h,
    )
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    customer_id = created["customerId"]
    cleanup_sql(f"DELETE FROM customers WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_emails WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_phones WHERE customer_id = {customer_id}")

    get_resp = client.get(f"/customers/{customer_id}", headers=h)
    assert get_resp.status_code == 200
    assert get_resp.json()["email"] == email

    patch_resp = client.patch(f"/customers/{customer_id}", json={"notes": "nota actualizada"}, headers=h)
    assert patch_resp.status_code == 200
    assert patch_resp.json()["notes"] == "nota actualizada"
    assert patch_resp.json()["email"] == email  # sin cambio


def test_customer_create_reuses_existing_by_email(
    client: httpx.Client, owner1_token: str, cleanup_sql
) -> None:
    """sp_create_customer reutiliza el cliente existente por tenant_id+email
    (docs/sql-signatures.md #8) en vez de crear un duplicado."""
    tag = unique_tag()
    h = bearer(owner1_token)
    email = f"zz.e2e.reuse.{tag}@example.com"
    payload = {"firstName": "Zz", "lastName": "Reuse", "email": email, "phone": "8888-4444"}

    first = client.post("/customers", json=payload, headers=h)
    customer_id = first.json()["customerId"]
    cleanup_sql(f"DELETE FROM customers WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_emails WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_phones WHERE customer_id = {customer_id}")

    second = client.post("/customers", json=payload, headers=h)
    assert second.status_code == 201
    assert second.json()["customerId"] == customer_id


def test_customer_invalid_payload_422(client: httpx.Client, owner1_token: str) -> None:
    h = bearer(owner1_token)
    r1 = client.post("/customers", json={"firstName": "Solo name"}, headers=h)
    assert r1.status_code == 422
    body1 = r1.json()
    assert_rfc7807(body1, 422)
    assert "lastName" in body1["detail"] or "email" in body1["detail"]

    r2 = client.post(
        "/customers",
        json={"firstName": 1, "lastName": "x", "email": "a@b.com", "phone": "123"},
        headers=h,
    )
    assert r2.status_code == 422
    assert_rfc7807(r2.json(), 422)


def test_customer_requires_auth_401(client: httpx.Client) -> None:
    r = client.get("/customers")
    assert r.status_code == 401
    assert_rfc7807(r.json(), 401)


def test_customer_pagination_envelope(client: httpx.Client, owner1_token: str, cleanup_sql) -> None:
    tag = unique_tag()
    h = bearer(owner1_token)
    ids = []
    for i in range(2):
        r = client.post(
            "/customers",
            json={
                "firstName": "Zz",
                "lastName": f"Page {i}",
                "email": f"zz.e2e.page.{tag}.{i}@example.com",
                "phone": "8888-5555",
            },
            headers=h,
        )
        cid = r.json()["customerId"]
        ids.append(cid)
        cleanup_sql(f"DELETE FROM customers WHERE customer_id = {cid}")
        cleanup_sql(f"DELETE FROM customer_emails WHERE customer_id = {cid}")
        cleanup_sql(f"DELETE FROM customer_phones WHERE customer_id = {cid}")

    list_resp = client.get("/customers", params={"pageSize": 1}, headers=h)
    body = list_resp.json()
    assert_page_envelope(body)
    assert len(body["items"]) == 1
    assert body["total"] >= 2


# ---------------------------------------------------------------------------
# bookings (owner-authenticated: POST /bookings, confirm/cancel/complete/
# reschedule, GET /bookings, GET /bookings/{id})
# ---------------------------------------------------------------------------


def test_booking_create_read_and_lifecycle_transitions(
    client: httpx.Client, owner1_token: str, cleanup_sql
) -> None:
    tag = unique_tag()
    h = bearer(owner1_token)

    block_resp = client.post(
        "/availability-blocks",
        json={"locationId": 1, "blockDate": "2027-04-01", "startTime": "09:00:00", "endTime": "09:30:00"},
        headers=h,
    )
    block_id = block_resp.json()["availabilityBlockId"]
    cleanup_sql(f"DELETE FROM availability_blocks WHERE availability_block_id = {block_id}")

    customer_resp = client.post(
        "/customers",
        json={
            "firstName": "Zz",
            "lastName": "Booking Lifecycle",
            "email": f"zz.e2e.lifecycle.{tag}@example.com",
            "phone": "8888-6666",
        },
        headers=h,
    )
    customer_id = customer_resp.json()["customerId"]
    cleanup_sql(f"DELETE FROM customers WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_emails WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_phones WHERE customer_id = {customer_id}")

    create_resp = client.post(
        "/bookings",
        json={
            "serviceId": 1,
            "locationId": 1,
            "availabilityBlockId": block_id,
            "customerId": customer_id,
            "customerNotes": "reserva de prueba e2e",
        },
        headers=h,
    )
    assert create_resp.status_code == 201, create_resp.text
    booking = create_resp.json()
    booking_id = booking["bookingId"]
    assert booking["status"] == "pending"
    _cleanup_booking(cleanup_sql, booking_id)

    get_resp = client.get(f"/bookings/{booking_id}", headers=h)
    assert get_resp.status_code == 200
    assert get_resp.json()["customerNotes"] == "reserva de prueba e2e"

    confirm_resp = client.post(f"/bookings/{booking_id}/confirm", headers=h)
    assert confirm_resp.status_code == 200
    assert confirm_resp.json()["status"] == "confirmed"

    complete_resp = client.post(f"/bookings/{booking_id}/complete", headers=h)
    assert complete_resp.status_code == 200
    assert complete_resp.json()["status"] == "completed"

    # Comportamiento real: cancelar una reserva ya completada no es una
    # transicion valida (THROW 50003) -> 400, no 409/404.
    cancel_resp = client.post(f"/bookings/{booking_id}/cancel", headers=h)
    assert cancel_resp.status_code == 400, cancel_resp.text
    assert_rfc7807(cancel_resp.json(), 400)

    history_resp = client.get(f"/customers/{customer_id}/bookings", headers=h)
    assert history_resp.status_code == 200
    assert booking_id in [b["bookingId"] for b in history_resp.json()]


def test_booking_reschedule(client: httpx.Client, owner1_token: str, cleanup_sql) -> None:
    tag = unique_tag()
    h = bearer(owner1_token)

    block_a = client.post(
        "/availability-blocks",
        json={"locationId": 1, "blockDate": "2027-04-02", "startTime": "09:00:00", "endTime": "09:30:00"},
        headers=h,
    ).json()["availabilityBlockId"]
    block_b = client.post(
        "/availability-blocks",
        json={"locationId": 1, "blockDate": "2027-04-02", "startTime": "10:00:00", "endTime": "10:30:00"},
        headers=h,
    ).json()["availabilityBlockId"]
    cleanup_sql(
        f"DELETE FROM availability_blocks WHERE availability_block_id IN ({block_a}, {block_b})"
    )

    customer_id = client.post(
        "/customers",
        json={
            "firstName": "Zz",
            "lastName": "Resched Owner",
            "email": f"zz.e2e.resched.owner.{tag}@example.com",
            "phone": "8888-7777",
        },
        headers=h,
    ).json()["customerId"]
    cleanup_sql(f"DELETE FROM customers WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_emails WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_phones WHERE customer_id = {customer_id}")

    booking_id = client.post(
        "/bookings",
        json={"serviceId": 1, "locationId": 1, "availabilityBlockId": block_a, "customerId": customer_id},
        headers=h,
    ).json()["bookingId"]
    _cleanup_booking(cleanup_sql, booking_id)

    resched_resp = client.post(
        f"/bookings/{booking_id}/reschedule", json={"newAvailabilityBlockId": block_b}, headers=h
    )
    assert resched_resp.status_code == 200, resched_resp.text
    assert resched_resp.json()["startTime"] == "10:00:00"
    assert sql_scalar(
        f"SELECT is_active FROM availability_blocks WHERE availability_block_id = {block_a}"
    ) == "1"


def test_booking_create_missing_customer_info_400(client: httpx.Client, owner1_token: str) -> None:
    """Ni customerId ni customer: THROW 50005 -> 400 (regla de negocio de la
    SP, no un 422 de pydantic - documentado en docs/sql-signatures.md #9)."""
    h = bearer(owner1_token)
    r = client.post(
        "/bookings",
        json={"serviceId": 1, "locationId": 1, "availabilityBlockId": 999999999},
        headers=h,
    )
    assert r.status_code == 400, r.text
    assert_rfc7807(r.json(), 400)


def test_booking_invalid_payload_422(client: httpx.Client, owner1_token: str) -> None:
    h = bearer(owner1_token)
    r1 = client.post("/bookings", json={"serviceId": 1}, headers=h)
    assert r1.status_code == 422
    assert_rfc7807(r1.json(), 422)

    r2 = client.post(
        "/bookings",
        json={"serviceId": "uno", "locationId": 1, "availabilityBlockId": 1},
        headers=h,
    )
    assert r2.status_code == 422
    assert_rfc7807(r2.json(), 422)


def test_booking_nonexistent_id_404(client: httpx.Client, owner1_token: str) -> None:
    r = client.get("/bookings/999999999", headers=bearer(owner1_token))
    assert r.status_code == 404
    assert_rfc7807(r.json(), 404)


def test_booking_requires_auth_401(client: httpx.Client) -> None:
    r = client.get("/bookings")
    assert r.status_code == 401
    assert_rfc7807(r.json(), 401)


def test_booking_pagination_envelope(client: httpx.Client, owner1_token: str, cleanup_sql) -> None:
    tag = unique_tag()
    h = bearer(owner1_token)

    customer_id = client.post(
        "/customers",
        json={
            "firstName": "Zz",
            "lastName": "Page Bookings",
            "email": f"zz.e2e.pagebook.{tag}@example.com",
            "phone": "8888-8888",
        },
        headers=h,
    ).json()["customerId"]
    cleanup_sql(f"DELETE FROM customers WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_emails WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_phones WHERE customer_id = {customer_id}")

    booking_ids = []
    for i in range(2):
        block_id = client.post(
            "/availability-blocks",
            json={"locationId": 1, "blockDate": "2027-04-03", "startTime": f"{9 + i:02d}:00:00", "endTime": f"{9 + i:02d}:30:00"},
            headers=h,
        ).json()["availabilityBlockId"]
        cleanup_sql(f"DELETE FROM availability_blocks WHERE availability_block_id = {block_id}")
        bid = client.post(
            "/bookings",
            json={"serviceId": 1, "locationId": 1, "availabilityBlockId": block_id, "customerId": customer_id},
            headers=h,
        ).json()["bookingId"]
        booking_ids.append(bid)
        _cleanup_booking(cleanup_sql, bid)

    list_resp = client.get("/bookings", params={"date": "2027-04-03", "pageSize": 1}, headers=h)
    body = list_resp.json()
    assert_page_envelope(body)
    assert len(body["items"]) == 1
    assert body["total"] >= 2
