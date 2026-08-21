"""Soft delete (adaptado al diseno real).

DELETE service/category/location/block -> respuesta ok; el recurso NO se
borra fisicamente (verificado via sql_scalar activo=0); GET por id y
presencia en el listado default se documentan tal cual se comportan en la
API real (no todos coinciden con lo esperado - ver comentarios inline,
especialmente availability-blocks, que es un DEFECTO real, no solo una
diferencia de diseno).

El escenario de "clave natural" (bloque cuya reserva se cancela queda
re-reservable) esta cubierto en test_api_public_track.py
(test_public_book_track_cancel_frees_block_for_rebooking), no se repite
aqui."""

from __future__ import annotations

import httpx
import pytest

from conftest import bearer, sql_scalar
from test_api_helpers import unique_tag

pytestmark = pytest.mark.e2e


def test_service_category_soft_delete_full_behavior(
    client: httpx.Client, owner1_token: str, cleanup_sql
) -> None:
    tag = unique_tag()
    h = bearer(owner1_token)
    name = f"ZZ_E2E_SOFTDEL_CAT_{tag}"

    category_id = client.post("/service-categories", json={"name": name}, headers=h).json()["categoryId"]
    cleanup_sql(f"DELETE FROM service_categories WHERE category_id = {category_id}")

    delete_resp = client.delete(f"/service-categories/{category_id}", headers=h)
    assert delete_resp.status_code == 200
    assert delete_resp.json() == {"status": "deleted"}

    # GET por id sigue devolviendo 200 (no 404) con isActive=false: el
    # soft-deleted sigue siendo legible por id (ver docstring de
    # ServiceCategoryRepository.get_by_id: "no activo filter here...a
    # soft-deleted category must still be readable by id").
    get_resp = client.get(f"/service-categories/{category_id}", headers=h)
    assert get_resp.status_code == 200
    assert get_resp.json()["isActive"] is False

    # Desaparece del listado default (list_by_tenant si filtra activo=1).
    list_resp = client.get("/service-categories", params={"pageSize": 100}, headers=h)
    assert category_id not in [c["categoryId"] for c in list_resp.json()["items"]]

    # No se borro fisicamente.
    assert sql_scalar(
        f"SELECT COUNT(*) FROM service_categories WHERE category_id = {category_id}"
    ) == "1"
    assert sql_scalar(
        f"SELECT is_active FROM service_categories WHERE category_id = {category_id}"
    ) == "0"


def test_service_soft_delete_full_behavior(client: httpx.Client, owner1_token: str, cleanup_sql) -> None:
    tag = unique_tag()
    h = bearer(owner1_token)

    category_id = client.post(
        "/service-categories", json={"name": f"ZZ_E2E_SOFTDEL_SVCCAT_{tag}"}, headers=h
    ).json()["categoryId"]
    cleanup_sql(f"DELETE FROM service_categories WHERE category_id = {category_id}")
    service_id = client.post(
        "/services",
        json={"categoryId": category_id, "name": f"ZZ_E2E_SOFTDEL_SVC_{tag}", "durationMinutes": 30},
        headers=h,
    ).json()["serviceId"]
    cleanup_sql(f"DELETE FROM services WHERE service_id = {service_id}")

    delete_resp = client.delete(f"/services/{service_id}", headers=h)
    assert delete_resp.status_code == 200
    assert delete_resp.json() == {"status": "deleted"}

    # Comportamiento real documentado: ServiceResponse NO expone isActive
    # (a diferencia de ServiceCategoryResponse/LocationResponse) - el
    # frontend no puede saber por la respuesta de GET si un servicio esta
    # activo o no, solo por SQL/inferencia (deja de aparecer en el listado).
    get_resp = client.get(f"/services/{service_id}", headers=h)
    assert get_resp.status_code == 200
    assert "isActive" not in get_resp.json()

    list_resp = client.get("/services", params={"pageSize": 100}, headers=h)
    assert service_id not in [s["serviceId"] for s in list_resp.json()["items"]]

    assert sql_scalar(f"SELECT is_active FROM services WHERE service_id = {service_id}") == "0"


def test_location_soft_delete_full_behavior(client: httpx.Client, owner1_token: str, cleanup_sql) -> None:
    tag = unique_tag()
    h = bearer(owner1_token)
    name = f"ZZ_E2E_SOFTDEL_LOC_{tag}"

    location_id = client.post(
        "/locations",
        json={
            "name": name,
            "province": "San Jose",
            "canton": "Central",
            "district": "Carmen",
            "postalCode": "10101",
        },
        headers=h,
    ).json()["locationId"]
    cleanup_sql(f"DELETE FROM locations WHERE location_id = {location_id}")

    delete_resp = client.delete(f"/locations/{location_id}", headers=h)
    assert delete_resp.status_code == 200
    assert delete_resp.json() == {"status": "deleted"}

    get_resp = client.get(f"/locations/{location_id}", headers=h)
    assert get_resp.status_code == 200
    assert get_resp.json()["isActive"] is False

    list_resp = client.get("/locations", params={"pageSize": 100}, headers=h)
    assert location_id not in [loc["locationId"] for loc in list_resp.json()["items"]]

    assert sql_scalar(f"SELECT is_active FROM locations WHERE location_id = {location_id}") == "0"


def test_availability_block_soft_delete_get_and_physical_state(
    client: httpx.Client, owner1_token: str, cleanup_sql
) -> None:
    h = bearer(owner1_token)
    block_id = client.post(
        "/availability-blocks",
        json={"locationId": 1, "blockDate": "2027-06-01", "startTime": "09:00:00", "endTime": "09:30:00"},
        headers=h,
    ).json()["availabilityBlockId"]
    cleanup_sql(f"DELETE FROM availability_blocks WHERE availability_block_id = {block_id}")

    delete_resp = client.delete(f"/availability-blocks/{block_id}", headers=h)
    assert delete_resp.status_code == 200
    assert delete_resp.json() == {"status": "deleted"}

    # GET por id sigue en 200 (igual que las otras entidades).
    get_resp = client.get(f"/availability-blocks/{block_id}", headers=h)
    assert get_resp.status_code == 200

    # No se borro fisicamente: activo pasa a 0.
    assert sql_scalar(
        f"SELECT is_active FROM availability_blocks WHERE availability_block_id = {block_id}"
    ) == "0"


def test_availability_block_soft_delete_disappears_from_owner_listing(
    client: httpx.Client, owner1_token: str, cleanup_sql
) -> None:
    """Antes documentado como defecto: GET /availability-blocks no filtraba
    `activo = 1` en su listado, a diferencia de
    service-categories/services/locations. Ya corregido:
    AvailabilityRepository.list_owner (apps/api/app/repositories/
    availability_repository.py) ahora exige bloque_activo = 1 en el WHERE
    contra v_availability_status. Un bloque desactivado (DELETE) ya no
    aparece en GET /availability-blocks para el owner, igual que en el
    resto de entidades con soft delete."""
    h = bearer(owner1_token)
    block_id = client.post(
        "/availability-blocks",
        json={"locationId": 1, "blockDate": "2027-06-02", "startTime": "09:00:00", "endTime": "09:30:00"},
        headers=h,
    ).json()["availabilityBlockId"]
    cleanup_sql(f"DELETE FROM availability_blocks WHERE availability_block_id = {block_id}")

    client.delete(f"/availability-blocks/{block_id}", headers=h)

    list_resp = client.get(
        "/availability-blocks", params={"date": "2027-06-02", "pageSize": 100}, headers=h
    )
    ids = [b["availabilityBlockId"] for b in list_resp.json()["items"]]
    assert block_id not in ids
