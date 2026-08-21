"""CRUD owner - catalogo: service-categories, services, locations,
business-hours. Por recurso: happy path crear->leer->actualizar,
422 con payload invalido, 401 sin token, paginacion (donde aplica)."""

from __future__ import annotations

import httpx
import pytest

from conftest import bearer, sql_scalar
from test_api_helpers import assert_page_envelope, assert_rfc7807, unique_tag

pytestmark = pytest.mark.e2e


# ---------------------------------------------------------------------------
# service-categories
# ---------------------------------------------------------------------------


def test_service_category_create_read_update_cycle(
    client: httpx.Client, owner1_token: str, cleanup_sql
) -> None:
    tag = unique_tag()
    name = f"ZZ_E2E_CAT_{tag}"
    h = bearer(owner1_token)

    create_resp = client.post("/service-categories", json={"name": name, "description": "d1"}, headers=h)
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    assert created["name"] == name
    assert created["isActive"] is True
    category_id = created["categoryId"]
    cleanup_sql(f"DELETE FROM service_categories WHERE category_id = {category_id}")

    get_resp = client.get(f"/service-categories/{category_id}", headers=h)
    assert get_resp.status_code == 200
    assert get_resp.json() == created

    patch_resp = client.patch(
        f"/service-categories/{category_id}", json={"description": "d2 actualizada"}, headers=h
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["description"] == "d2 actualizada"
    assert patch_resp.json()["name"] == name  # no cambio, PATCH parcial


def test_service_category_invalid_payload_422(client: httpx.Client, owner1_token: str) -> None:
    h = bearer(owner1_token)
    # name ausente (requerido)
    r1 = client.post("/service-categories", json={"description": "sin name"}, headers=h)
    assert r1.status_code == 422
    body1 = r1.json()
    assert_rfc7807(body1, 422)
    assert "name" in body1["detail"]

    # tipo incorrecto: name como numero
    r2 = client.post("/service-categories", json={"name": 12345}, headers=h)
    assert r2.status_code == 422
    assert_rfc7807(r2.json(), 422)


def test_service_category_requires_auth_401(client: httpx.Client) -> None:
    r = client.get("/service-categories")
    assert r.status_code == 401
    assert_rfc7807(r.json(), 401)


def test_service_category_pagination_envelope(
    client: httpx.Client, owner1_token: str, cleanup_sql
) -> None:
    tag = unique_tag()
    h = bearer(owner1_token)
    ids = []
    for i in range(2):
        resp = client.post(
            "/service-categories", json={"name": f"ZZ_E2E_PAGE_CAT_{tag}_{i}"}, headers=h
        )
        assert resp.status_code == 201
        cid = resp.json()["categoryId"]
        ids.append(cid)
        cleanup_sql(f"DELETE FROM service_categories WHERE category_id = {cid}")

    list_resp = client.get("/service-categories", params={"pageSize": 1, "page": 1}, headers=h)
    assert list_resp.status_code == 200
    body = list_resp.json()
    assert_page_envelope(body)
    assert body["pageSize"] == 1
    assert body["page"] == 1
    assert len(body["items"]) == 1
    assert body["total"] >= 2


# ---------------------------------------------------------------------------
# services
# ---------------------------------------------------------------------------


def test_service_create_read_update_cycle(
    client: httpx.Client, owner1_token: str, cleanup_sql
) -> None:
    tag = unique_tag()
    h = bearer(owner1_token)

    cat_resp = client.post("/service-categories", json={"name": f"ZZ_E2E_SVC_CAT_{tag}"}, headers=h)
    category_id = cat_resp.json()["categoryId"]
    cleanup_sql(f"DELETE FROM service_categories WHERE category_id = {category_id}")

    create_resp = client.post(
        "/services",
        json={
            "categoryId": category_id,
            "name": f"ZZ_E2E_SVC_{tag}",
            "description": "servicio de prueba",
            "durationMinutes": 45,
            "price": 9000,
            "showPrice": True,
        },
        headers=h,
    )
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    service_id = created["serviceId"]
    assert created["durationMinutes"] == 45
    assert created["showPrice"] is True
    cleanup_sql(f"DELETE FROM services WHERE service_id = {service_id}")

    get_resp = client.get(f"/services/{service_id}", headers=h)
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == f"ZZ_E2E_SVC_{tag}"

    patch_resp = client.patch(f"/services/{service_id}", json={"durationMinutes": 60}, headers=h)
    assert patch_resp.status_code == 200
    assert patch_resp.json()["durationMinutes"] == 60
    assert patch_resp.json()["name"] == f"ZZ_E2E_SVC_{tag}"  # sin cambio


def test_service_invalid_payload_422(client: httpx.Client, owner1_token: str) -> None:
    h = bearer(owner1_token)
    # faltan categoryId/durationMinutes (requeridos)
    r1 = client.post("/services", json={"name": "sin categoria ni duracion"}, headers=h)
    assert r1.status_code == 422
    assert_rfc7807(r1.json(), 422)

    # durationMinutes con tipo incorrecto
    r2 = client.post(
        "/services",
        json={"categoryId": 1, "name": "dur invalida", "durationMinutes": "treinta"},
        headers=h,
    )
    assert r2.status_code == 422
    assert_rfc7807(r2.json(), 422)


def test_service_nonexistent_category_400(client: httpx.Client, owner1_token: str) -> None:
    """categoryId con tipo correcto pero valor inexistente: no es un 422 de
    pydantic, es una regla de negocio (THROW 50023) -> 404, no 400. Se
    documenta aqui el codigo real (docs/sql-signatures.md dice 404 para
    categoria inexistente, a diferencia de otros 'invalido' que son 400)."""
    h = bearer(owner1_token)
    r = client.post(
        "/services",
        json={"categoryId": 999999999, "name": "cat inexistente", "durationMinutes": 30},
        headers=h,
    )
    assert r.status_code == 404, r.text
    assert_rfc7807(r.json(), 404)


def test_service_requires_auth_401(client: httpx.Client) -> None:
    r = client.get("/services")
    assert r.status_code == 401
    assert_rfc7807(r.json(), 401)


def test_service_pagination_and_category_filter(
    client: httpx.Client, owner1_token: str, cleanup_sql
) -> None:
    tag = unique_tag()
    h = bearer(owner1_token)
    cat_resp = client.post("/service-categories", json={"name": f"ZZ_E2E_SVC_FILT_CAT_{tag}"}, headers=h)
    category_id = cat_resp.json()["categoryId"]
    cleanup_sql(f"DELETE FROM service_categories WHERE category_id = {category_id}")

    service_ids = []
    for i in range(2):
        r = client.post(
            "/services",
            json={"categoryId": category_id, "name": f"ZZ_E2E_SVC_FILT_{tag}_{i}", "durationMinutes": 20},
            headers=h,
        )
        sid = r.json()["serviceId"]
        service_ids.append(sid)
        cleanup_sql(f"DELETE FROM services WHERE service_id = {sid}")

    list_resp = client.get("/services", params={"categoryId": category_id, "pageSize": 100}, headers=h)
    assert list_resp.status_code == 200
    body = list_resp.json()
    assert_page_envelope(body)
    assert body["total"] == 2
    assert {i["serviceId"] for i in body["items"]} == set(service_ids)


# ---------------------------------------------------------------------------
# locations
# ---------------------------------------------------------------------------


def test_location_create_read_update_cycle(
    client: httpx.Client, owner1_token: str, cleanup_sql
) -> None:
    tag = unique_tag()
    h = bearer(owner1_token)

    create_resp = client.post(
        "/locations",
        json={
            "name": f"ZZ_E2E_LOC_{tag}",
            "province": "San Jose",
            "canton": "Central",
            "district": "Carmen",
            "postalCode": "10101",
            "phone": "2200-0000",
        },
        headers=h,
    )
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    location_id = created["locationId"]
    assert created["isActive"] is True
    assert created["isMain"] is False
    # cleanup_sql ejecuta en orden LIFO: registrar el DELETE del padre
    # primero para que el de la tabla hija corra antes en el teardown.
    cleanup_sql(f"DELETE FROM locations WHERE location_id = {location_id}")
    cleanup_sql(f"DELETE FROM location_phones WHERE location_id = {location_id}")

    get_resp = client.get(f"/locations/{location_id}", headers=h)
    assert get_resp.status_code == 200
    assert get_resp.json()["district"] == "Carmen"

    patch_resp = client.patch(f"/locations/{location_id}", json={"phone": "2200-1111"}, headers=h)
    assert patch_resp.status_code == 200
    assert patch_resp.json()["phone"] == "2200-1111"
    assert patch_resp.json()["name"] == f"ZZ_E2E_LOC_{tag}"


def test_location_invalid_payload_422(client: httpx.Client, owner1_token: str) -> None:
    h = bearer(owner1_token)
    # province/canton/district/postalCode missing (required)
    r1 = client.post("/locations", json={"name": "sin direccion"}, headers=h)
    assert r1.status_code == 422
    body1 = r1.json()
    assert_rfc7807(body1, 422)
    assert "province" in body1["detail"]

    # isMain con tipo incorrecto
    r2 = client.post(
        "/locations",
        json={
            "name": "x",
            "province": "San Jose",
            "canton": "Central",
            "district": "Carmen",
            "postalCode": "10101",
            "isMain": "si",
        },
        headers=h,
    )
    assert r2.status_code == 422
    assert_rfc7807(r2.json(), 422)


def test_location_requires_auth_401(client: httpx.Client) -> None:
    r = client.get("/locations")
    assert r.status_code == 401
    assert_rfc7807(r.json(), 401)


def test_location_pagination_envelope(client: httpx.Client, owner1_token: str, cleanup_sql) -> None:
    tag = unique_tag()
    h = bearer(owner1_token)
    ids = []
    for i in range(2):
        r = client.post(
            "/locations",
            json={
                "name": f"ZZ_E2E_PAGE_LOC_{tag}_{i}",
                "province": "San Jose",
                "canton": "Central",
                "district": "Carmen",
                "postalCode": "10101",
            },
            headers=h,
        )
        lid = r.json()["locationId"]
        ids.append(lid)
        cleanup_sql(f"DELETE FROM locations WHERE location_id = {lid}")

    list_resp = client.get("/locations", params={"pageSize": 1}, headers=h)
    body = list_resp.json()
    assert_page_envelope(body)
    assert len(body["items"]) == 1
    assert body["total"] >= 2


# ---------------------------------------------------------------------------
# business-hours (no envelope de paginacion: la API devuelve una lista plana,
# ver docs/api-handover.md - documentado, no es un defecto)
# ---------------------------------------------------------------------------


def test_business_hours_put_replaces_full_week_then_get(
    client: httpx.Client, owner1_token: str, cleanup_sql
) -> None:
    tag = unique_tag()
    h = bearer(owner1_token)

    loc_resp = client.post(
        "/locations",
        json={
            "name": f"ZZ_E2E_HOURS_LOC_{tag}",
            "province": "San Jose",
            "canton": "Central",
            "district": "Carmen",
            "postalCode": "10101",
        },
        headers=h,
    )
    location_id = loc_resp.json()["locationId"]
    # cleanup_sql corre en orden LIFO: registramos locations (padre)
    # primero para que el teardown borre business_hours (hijo, FK NO_ACTION hacia
    # locations) antes que locations.
    cleanup_sql(f"DELETE FROM locations WHERE location_id = {location_id}")
    cleanup_sql(f"DELETE FROM business_hours WHERE location_id = {location_id}")

    put_resp = client.put(
        "/business-hours",
        json={
            "locationId": location_id,
            "hours": [
                {"dayOfWeek": 1, "openTime": "09:00:00", "closeTime": "17:00:00", "isClosed": False},
                {"dayOfWeek": 0, "isClosed": True},
            ],
        },
        headers=h,
    )
    assert put_resp.status_code == 200, put_resp.text
    put_body = put_resp.json()
    assert isinstance(put_body, list)
    assert len(put_body) == 2
    by_day = {row["dayOfWeek"]: row for row in put_body}
    assert by_day[1]["openTime"] == "09:00:00"
    assert by_day[0]["isClosed"] is True

    get_resp = client.get("/business-hours", params={"locationId": location_id}, headers=h)
    assert get_resp.status_code == 200
    assert len(get_resp.json()) == 2


def test_business_hours_invalid_payload_422(client: httpx.Client, owner1_token: str) -> None:
    h = bearer(owner1_token)
    # falta locationId (requerido)
    r1 = client.put("/business-hours", json={"hours": []}, headers=h)
    assert r1.status_code == 422
    assert_rfc7807(r1.json(), 422)

    # dayOfWeek con tipo incorrecto dentro de hours
    r2 = client.put(
        "/business-hours",
        json={"locationId": 1, "hours": [{"dayOfWeek": "lunes"}]},
        headers=h,
    )
    assert r2.status_code == 422
    assert_rfc7807(r2.json(), 422)


def test_business_hours_requires_auth_401(client: httpx.Client) -> None:
    r = client.get("/business-hours")
    assert r.status_code == 401
    assert_rfc7807(r.json(), 401)


def test_business_hours_nonexistent_location_404(client: httpx.Client, owner1_token: str) -> None:
    h = bearer(owner1_token)
    r = client.put(
        "/business-hours",
        json={"locationId": 999999999, "hours": [{"dayOfWeek": 1, "isClosed": True}]},
        headers=h,
    )
    assert r.status_code == 404, r.text
    assert_rfc7807(r.json(), 404)
