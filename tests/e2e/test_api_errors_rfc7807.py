"""RFC 7807: los errores 400/404/409/422 (y 401/403/501, cubiertos
tambien aqui para redondear el envelope) traen {type, title, status, detail,
traceId}. Para 422 se documenta el formato real de FastAPI, que difiere del
shape nativo {"detail": [...]} (aqui viene re-envuelto en RFC 7807 con
detail como una lista de errores *stringificada*, no un array JSON -
ver apps/api/app/main.py::validation_error_handler)."""

from __future__ import annotations

import httpx
import pytest

from conftest import bearer
from test_api_helpers import RFC7807_KEYS, assert_rfc7807, unique_tag

pytestmark = pytest.mark.e2e


def test_400_bad_request_envelope(client: httpx.Client, owner1_token: str) -> None:
    """THROW 50004 (rango de fechas invalido del bloque) -> 400."""
    r = client.post(
        "/availability-blocks",
        json={"locationId": 1, "blockDate": "2027-08-01", "startTime": "10:00:00", "endTime": "09:00:00"},
        headers=bearer(owner1_token),
    )
    assert r.status_code == 400
    assert_rfc7807(r.json(), 400)


def test_401_unauthorized_envelope(client: httpx.Client) -> None:
    r = client.get("/customers")
    assert r.status_code == 401
    assert_rfc7807(r.json(), 401)


def test_403_forbidden_envelope(client: httpx.Client, owner1_token: str) -> None:
    r = client.get("/admin/tenants", headers=bearer(owner1_token))
    assert r.status_code == 403
    assert_rfc7807(r.json(), 403)


def test_404_not_found_envelope(client: httpx.Client, owner1_token: str) -> None:
    r = client.get("/customers/999999999", headers=bearer(owner1_token))
    assert r.status_code == 404
    assert_rfc7807(r.json(), 404)


def test_409_conflict_envelope_double_booking(
    client: httpx.Client, owner1_token: str, cleanup_sql
) -> None:
    """THROW 50040 (bloque ya ocupado) -> 409: se reserva el mismo bloque
    dos veces seguidas para provocarlo."""
    h = bearer(owner1_token)
    block_id = client.post(
        "/availability-blocks",
        json={"locationId": 1, "blockDate": "2027-08-02", "startTime": "09:00:00", "endTime": "09:30:00"},
        headers=h,
    ).json()["availabilityBlockId"]
    cleanup_sql(f"DELETE FROM availability_blocks WHERE availability_block_id = {block_id}")

    tag = unique_tag()
    customer_id = client.post(
        "/customers",
        json={
            "firstName": "Zz",
            "lastName": "Conflict",
            "email": f"zz.e2e.conflict.{tag}@example.com",
            "phone": "8888-1212",
        },
        headers=h,
    ).json()["customerId"]
    cleanup_sql(f"DELETE FROM customers WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_emails WHERE customer_id = {customer_id}")
    cleanup_sql(f"DELETE FROM customer_phones WHERE customer_id = {customer_id}")

    first = client.post(
        "/bookings",
        json={"serviceId": 1, "locationId": 1, "availabilityBlockId": block_id, "customerId": customer_id},
        headers=h,
    )
    assert first.status_code == 201, first.text
    booking_id = first.json()["bookingId"]
    cleanup_sql(f"DELETE FROM bookings WHERE booking_id = {booking_id}")
    cleanup_sql(f"DELETE FROM tracking_codes WHERE booking_id = {booking_id}")
    cleanup_sql(
        f"DELETE FROM audit_logs WHERE entity_name = 'bookings' AND entity_id = {booking_id}"
    )

    second = client.post(
        "/bookings",
        json={"serviceId": 1, "locationId": 1, "availabilityBlockId": block_id, "customerId": customer_id},
        headers=h,
    )
    assert second.status_code == 409, second.text
    assert_rfc7807(second.json(), 409)


def test_501_not_implemented_envelope(client: httpx.Client, superadmin_token: str) -> None:
    r = client.post(
        "/admin/tenants",
        json={"name": "x", "slug": "zz-501-envelope-check", "businessTypeId": 1, "email": "z@z.com"},
        headers=bearer(superadmin_token),
    )
    assert r.status_code == 501
    assert_rfc7807(r.json(), 501)


def test_422_envelope_shape_differs_from_fastapi_default(client: httpx.Client) -> None:
    """El shape 'nativo' de FastAPI para 422 es {"detail": [{"loc":...,
    "msg":...,"type":...}, ...]} (un array JSON real, ver el schema
    HTTPValidationError del propio openapi.json). Aqui, en cambio, main.py
    intercepta RequestValidationError y lo reescribe como envelope RFC 7807
    con `detail` = json.dumps(exc.errors()) - es decir, la lista de errores
    de pydantic serializada como texto JSON (defecto D3, ya corregido:
    antes era str(exc.errors()), una representacion Python con comillas
    simples y no parseable como JSON; ver app/main.py). El `detail` sigue
    siendo un string (cumple RFC 7807: detail es texto, no un array), pero
    ahora ese string SI es JSON valido si el cliente decide parsearlo."""
    # /auth/register-owner es publico (sin guarda de auth de por medio),
    # asi que un body incompleto llega directo a la validacion de pydantic.
    r = client.post("/auth/register-owner", json={"businessName": "solo esto"})
    assert r.status_code == 422
    body = r.json()

    assert set(body.keys()) == RFC7807_KEYS
    assert body["status"] == 422
    detail = body["detail"]
    assert isinstance(detail, str), "detail deberia ser string (RFC7807), no una lista/array"
    # El contenido es JSON valido: una lista de objetos con loc/msg/type.
    import json as _json

    parsed = _json.loads(detail)
    assert isinstance(parsed, list) and len(parsed) > 0
    assert {"loc", "msg", "type"} <= set(parsed[0].keys())


def test_422_error_detail_is_useful_missing_field_named(client: httpx.Client) -> None:
    """El detail, aunque no sea JSON valido, si es 'util' en el sentido
    pedido por la matriz: nombra el campo faltante real."""
    # /auth/register-owner es publico: aisla el 422 puro sin interaccion
    # con los guardas de auth (esos casos ya se cubren en el archivo de
    # catalogo/scheduling con owner1_token).
    r = client.post(
        "/auth/register-owner",
        json={"businessName": "x", "businessTypeId": 1, "slug": "zz-422-detail-check"},
    )
    assert r.status_code == 422
    detail = r.json()["detail"]
    for field in ("businessEmail", "ownerFirstName", "ownerLastName", "ownerEmail", "password"):
        assert field in detail, f"{field} deberia aparecer en el detail: {detail}"
