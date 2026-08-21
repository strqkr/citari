"""Flujo de negocio completo, de punta a punta, con un tenant NUEVO (no del
seed): registro -> activacion -> el owner monta su catalogo
(categoria/servicio/localidad/horario/bloques) -> un cliente publico
reserva -> rastrea/reagenda/cancela -> el owner y el superadmin ven el
resultado reflejado en /bookings, /reports/dashboard y /audit-logs.

Reusa bearer()/run_sql()/sql_scalar() de conftest.py y
unique_tag()/assert_rfc7807() de test_api_helpers.py (import directo, sin
duplicar logica).

Slug/correos con SUFIJO FIJO (no unique_tag()): a diferencia de los tests
test_api_*.py (que corren muchos tests pequenos por sesion y necesitan
evitar colisiones entre ellos), este archivo tiene un solo escenario
narrativo por corrida; usar un sufijo fijo lo hace legible en los logs y
sigue siendo seguro entre corridas porque cleanup_sql borra el dominio
temporal COMPLETO (por tenant_id) al final de cada corrida - la corrida
debe quedar en verde de forma repetible, dos veces seguidas.

Orden de limpieza (FK reales confirmadas en database/scripts/02-create-tables.sql):
bookings depende de tenants/customers/services/locations/bloques;
tracking_codes depende de bookings; audit_logs depende de tenants
(owner_id/superadmin_id quedan NULL en los audit_logs que generan los
triggers de bookings, asi que no dependen realmente de
tenant_owners aqui); services depende de service_categories;
business_hours depende de locations; tenant_owners depende de tenants.
cleanup_sql corre en orden LIFO (conftest.py), por lo que el borrado FISICO
correcto (tracking_codes -> audit_logs -> bookings -> bloques ->
customers -> services -> categorias -> business_hours -> locations -> duenos ->
tenants) se logra registrando las 11 sentencias en el orden EXACTAMENTE
INVERSO, todas de una vez apenas se conoce tenant_id (ver primer bloque del
test), para que sin importar en que paso posterior falle el resto del
flujo, el teardown deje la base sin residuos del dominio temporal."""

from __future__ import annotations

import re

import httpx
import pytest

from conftest import bearer, sql_scalar
from test_api_helpers import assert_rfc7807

pytestmark = pytest.mark.e2e

FLOW_SLUG = "e2e-flow-ciclocompleto"
FLOW_BUSINESS_EMAIL = "zz.e2e.flow.negocio@example.com"
FLOW_OWNER_EMAIL = "zz.e2e.flow.duenio@example.com"
FLOW_OWNER_PASSWORD = "ZzE2eFlow123"
FLOW_CUSTOMER_EMAIL = "zz.e2e.flow.cliente@example.com"

# CITARI-XXXXXX, alfabeto real de dbo.fn_generar_tracking_code
# (database/scripts/05-functions.sql): sin 0/O ni 1/I.
TRACKING_CODE_RE = re.compile(r"^CITARI-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$")

# Fechas 2033 exclusivas de este archivo (no chocan con los 2027 usados por
# los tests test_api_*.py ni con los rangos usados por test_flows_carrera.py /
# test_flows_logging.py).
BLOCK_A_DATE = "2033-06-15"  # miercoles
BLOCK_B_DATE = "2033-06-16"  # jueves

SEED_COUNT_TABLES = ("tenants", "bookings", "availability_blocks", "customers")


@pytest.fixture(scope="module", autouse=True)
def _seed_counts_intactos_alrededor_del_modulo():
    """Snapshots the 4 critical seed row counts BEFORE this module creates
    its temporary tenant, and asserts they're back to the SAME counts AFTER
    the cleanup_sql teardown (function-scoped fixture that resolves/closes
    before this module-scoped fixture, being the only test in this module)
    finishes deleting everything. This is the final check that the module
    leaves no residue - it compares before vs after rather than assuming a
    fixed row count, since the seed dataset size is not a fixed constant."""
    before = {table: sql_scalar(f"SELECT COUNT(*) FROM {table}") for table in SEED_COUNT_TABLES}
    yield
    for table in SEED_COUNT_TABLES:
        count = sql_scalar(f"SELECT COUNT(*) FROM {table}")
        assert count == before[table], (
            f"{table} did not return to its pre-module row count "
            f"(before={before[table]}, after={count}; the temporary tenant left residue)"
        )


def test_ciclo_completo_flujo_de_negocio_extremo_a_extremo(
    client: httpx.Client,
    superadmin_token: str,
    cleanup_sql,
) -> None:
    sh = bearer(superadmin_token)

    # -----------------------------------------------------------------
    # (a) Registro de un tenant NUEVO -> 201, dominio 'pendiente'; login
    # del owner recien registrado -> 403 (dominio pendiente de activacion,
    # comportamiento real documentado en
    # test_api_auth.py::test_register_owner_creates_pending_tenant_and_cleans_up).
    # -----------------------------------------------------------------
    register_resp = client.post(
        "/auth/register-owner",
        json={
            "businessName": "ZZ E2E Flow Ciclo Completo",
            "businessTypeId": 1,
            "slug": FLOW_SLUG,
            "businessEmail": FLOW_BUSINESS_EMAIL,
            "ownerFirstName": "Zz",
            "ownerLastName": "Flow Ciclo Completo",
            "ownerEmail": FLOW_OWNER_EMAIL,
            "password": FLOW_OWNER_PASSWORD,
        },
    )
    assert register_resp.status_code == 201, register_resp.text
    register_body = register_resp.json()
    tenant_id = register_body["tenantId"]
    assert register_body["owner"]["email"] == FLOW_OWNER_EMAIL
    assert register_body["owner"]["tenantId"] == tenant_id

    # Limpieza total del dominio temporal, registrada YA (antes de crear
    # nada mas): ver docstring del modulo para la justificacion del orden.
    cleanup_sql(f"DELETE FROM tenants WHERE tenant_id = {tenant_id}")
    cleanup_sql(f"DELETE FROM tenant_owners WHERE tenant_id = {tenant_id}")
    cleanup_sql(f"DELETE FROM locations WHERE tenant_id = {tenant_id}")
    cleanup_sql(f"DELETE FROM business_hours WHERE tenant_id = {tenant_id}")
    cleanup_sql(f"DELETE FROM service_categories WHERE tenant_id = {tenant_id}")
    cleanup_sql(f"DELETE FROM services WHERE tenant_id = {tenant_id}")
    cleanup_sql(f"DELETE FROM customers WHERE tenant_id = {tenant_id}")
    cleanup_sql(f"DELETE FROM availability_blocks WHERE tenant_id = {tenant_id}")
    cleanup_sql(f"DELETE FROM bookings WHERE tenant_id = {tenant_id}")
    cleanup_sql(f"DELETE FROM audit_logs WHERE tenant_id = {tenant_id}")
    cleanup_sql(
        "DELETE FROM tracking_codes WHERE booking_id IN "
        f"(SELECT booking_id FROM bookings WHERE tenant_id = {tenant_id})"
    )
    # Tablas hijas normalizadas (email/phone 1:N): deben registrarse
    # despues de sus tablas padre en esta lista para que, en el orden LIFO
    # del teardown, se borren ANTES que el padre.
    cleanup_sql(f"DELETE FROM tenant_emails WHERE tenant_id = {tenant_id}")
    cleanup_sql(f"DELETE FROM tenant_phones WHERE tenant_id = {tenant_id}")
    cleanup_sql(
        "DELETE FROM owner_emails WHERE owner_id IN "
        f"(SELECT owner_id FROM tenant_owners WHERE tenant_id = {tenant_id})"
    )
    cleanup_sql(
        "DELETE FROM owner_phones WHERE owner_id IN "
        f"(SELECT owner_id FROM tenant_owners WHERE tenant_id = {tenant_id})"
    )
    cleanup_sql(
        "DELETE FROM customer_emails WHERE customer_id IN "
        f"(SELECT customer_id FROM customers WHERE tenant_id = {tenant_id})"
    )
    cleanup_sql(
        "DELETE FROM customer_phones WHERE customer_id IN "
        f"(SELECT customer_id FROM customers WHERE tenant_id = {tenant_id})"
    )
    cleanup_sql(
        "DELETE FROM location_phones WHERE location_id IN "
        f"(SELECT location_id FROM locations WHERE tenant_id = {tenant_id})"
    )

    assert sql_scalar(
        "SELECT ed.name FROM tenants d JOIN tenant_statuses ed "
        f"ON ed.tenant_status_id = d.tenant_status_id WHERE d.tenant_id = {tenant_id}"
    ) == "pending"

    login_pending_resp = client.post(
        "/auth/login",
        json={"email": FLOW_OWNER_EMAIL, "password": FLOW_OWNER_PASSWORD, "role": "owner"},
    )
    assert login_pending_resp.status_code == 403, login_pending_resp.text
    assert_rfc7807(login_pending_resp.json(), 403)
    assert "pending" in login_pending_resp.json()["detail"]

    # -----------------------------------------------------------------
    # (b) Superadmin activa el dominio -> login del owner nuevo ahora es 200.
    # -----------------------------------------------------------------
    activate_resp = client.post(f"/admin/tenants/{tenant_id}/activate", headers=sh)
    assert activate_resp.status_code == 200, activate_resp.text
    assert activate_resp.json()["status"] == "active"

    login_resp = client.post(
        "/auth/login",
        json={"email": FLOW_OWNER_EMAIL, "password": FLOW_OWNER_PASSWORD, "role": "owner"},
    )
    assert login_resp.status_code == 200, login_resp.text
    owner_token = login_resp.json()["accessToken"]
    h = bearer(owner_token)

    # -----------------------------------------------------------------
    # (c) El owner nuevo monta su catalogo: categoria -> servicio (30 min)
    # -> localidad -> horario semanal (lunes-viernes) -> 2 bloques de
    # disponibilidad en 2033 (el segundo para el reagendamiento del paso e).
    # -----------------------------------------------------------------
    category_resp = client.post(
        "/service-categories",
        json={"name": "ZZ E2E Flow Categoria", "description": "Categoria del flujo E2E completo"},
        headers=h,
    )
    assert category_resp.status_code == 201, category_resp.text
    category_id = category_resp.json()["categoryId"]

    service_resp = client.post(
        "/services",
        json={
            "categoryId": category_id,
            "name": "ZZ E2E Flow Servicio",
            "description": "Servicio de 30 minutos del flujo E2E completo",
            "durationMinutes": 30,
            "price": 8000,
            "showPrice": True,
        },
        headers=h,
    )
    assert service_resp.status_code == 201, service_resp.text
    service = service_resp.json()
    service_id = service["serviceId"]
    assert service["durationMinutes"] == 30

    location_resp = client.post(
        "/locations",
        json={
            "name": "ZZ E2E Flow Sede Central",
            "province": "San Jose",
            "canton": "Central",
            "district": "Carmen",
            "postalCode": "10101",
            "phone": "2200-7000",
        },
        headers=h,
    )
    assert location_resp.status_code == 201, location_resp.text
    location_id = location_resp.json()["locationId"]

    hours_resp = client.put(
        "/business-hours",
        json={
            "locationId": location_id,
            "hours": [
                {"dayOfWeek": 1, "openTime": "09:00:00", "closeTime": "17:00:00", "isClosed": False},
                {"dayOfWeek": 2, "openTime": "09:00:00", "closeTime": "17:00:00", "isClosed": False},
                {"dayOfWeek": 3, "openTime": "09:00:00", "closeTime": "17:00:00", "isClosed": False},
                {"dayOfWeek": 4, "openTime": "09:00:00", "closeTime": "17:00:00", "isClosed": False},
                {"dayOfWeek": 5, "openTime": "09:00:00", "closeTime": "17:00:00", "isClosed": False},
            ],
        },
        headers=h,
    )
    assert hours_resp.status_code == 200, hours_resp.text
    hours_body = hours_resp.json()
    assert len(hours_body) == 5
    assert {row["dayOfWeek"] for row in hours_body} == {1, 2, 3, 4, 5}

    block_a_resp = client.post(
        "/availability-blocks",
        json={
            "locationId": location_id,
            "blockDate": BLOCK_A_DATE,
            "startTime": "10:00:00",
            "endTime": "10:30:00",
        },
        headers=h,
    )
    assert block_a_resp.status_code == 201, block_a_resp.text
    block_a_id = block_a_resp.json()["availabilityBlockId"]

    block_b_resp = client.post(
        "/availability-blocks",
        json={
            "locationId": location_id,
            "blockDate": BLOCK_B_DATE,
            "startTime": "11:00:00",
            "endTime": "11:30:00",
        },
        headers=h,
    )
    assert block_b_resp.status_code == 201, block_b_resp.text
    block_b_id = block_b_resp.json()["availabilityBlockId"]

    # -----------------------------------------------------------------
    # (d) Cliente publico: slug -> services -> disponibilidad (el bloque A
    # aparece) -> crea la reserva -> 201 con trackingCode con formato vigente.
    # -----------------------------------------------------------------
    public_tenant_resp = client.get(f"/public/{FLOW_SLUG}")
    assert public_tenant_resp.status_code == 200, public_tenant_resp.text
    assert public_tenant_resp.json()["tenantId"] == tenant_id
    # Hallazgo: TenantRepository.get_active_by_slug (usado por GET
    # /public/{slug}) solo hace SELECT
    # tenant_id/slug/name/description/mensaje_publico - nunca
    # email/phone/logo_url/estado_nombre - asi que email/phone/logoUrl/
    # status SIEMPRE viajan null en este endpoint, aunque el dominio tenga
    # esos valores reales y el endpoint por definicion solo devuelva
    # tenants activos (fn_is_tenant_active ya filtro por 'activo' antes de
    # llegar aqui). Confirmado tambien contra un dominio del seed
    # (GET /public/barberia-el-colocho -> status: null).
    assert public_tenant_resp.json()["status"] is None

    public_services_resp = client.get(f"/public/{FLOW_SLUG}/services")
    assert public_services_resp.status_code == 200
    assert service_id in [s["serviceId"] for s in public_services_resp.json()]

    public_availability_resp = client.get(
        f"/public/{FLOW_SLUG}/availability", params={"date": BLOCK_A_DATE}
    )
    assert public_availability_resp.status_code == 200
    assert block_a_id in [b["availabilityBlockId"] for b in public_availability_resp.json()]

    booking_resp = client.post(
        f"/public/{FLOW_SLUG}/bookings",
        json={
            "serviceId": service_id,
            "locationId": location_id,
            "availabilityBlockId": block_a_id,
            "customer": {
                "firstName": "Zz",
                "lastName": "Flow Cliente",
                "email": FLOW_CUSTOMER_EMAIL,
                "phone": "8888-7001",
            },
            "customerNotes": "Primera visita, flujo E2E completo",
        },
    )
    assert booking_resp.status_code == 201, booking_resp.text
    booking = booking_resp.json()
    assert booking["status"] == "pending"
    booking_id = booking["bookingId"]
    tracking_code = booking["trackingCode"]
    assert TRACKING_CODE_RE.match(tracking_code), f"trackingCode con formato inesperado: {tracking_code!r}"

    # -----------------------------------------------------------------
    # (e) Tracking: consulta -> reagenda al bloque B (el bloque A reaparece
    # libre) -> cancela (el bloque B reaparece libre).
    # -----------------------------------------------------------------
    track_resp = client.get(f"/track/{tracking_code}")
    assert track_resp.status_code == 200
    assert track_resp.json()["bookingId"] == booking_id
    assert track_resp.json()["status"] == "pending"

    reschedule_resp = client.post(
        f"/track/{tracking_code}/reschedule", json={"newAvailabilityBlockId": block_b_id}
    )
    assert reschedule_resp.status_code == 200, reschedule_resp.text
    assert reschedule_resp.json()["startTime"] == "11:00:00"
    assert reschedule_resp.json()["status"] == "rescheduled"

    avail_a_after_reschedule = client.get(
        f"/public/{FLOW_SLUG}/availability", params={"date": BLOCK_A_DATE}
    ).json()
    assert block_a_id in [b["availabilityBlockId"] for b in avail_a_after_reschedule]

    avail_b_after_reschedule = client.get(
        f"/public/{FLOW_SLUG}/availability", params={"date": BLOCK_B_DATE}
    ).json()
    assert block_b_id not in [b["availabilityBlockId"] for b in avail_b_after_reschedule]

    cancel_resp = client.post(f"/track/{tracking_code}/cancel")
    assert cancel_resp.status_code == 200, cancel_resp.text
    assert cancel_resp.json()["status"] == "cancelled"

    avail_b_after_cancel = client.get(
        f"/public/{FLOW_SLUG}/availability", params={"date": BLOCK_B_DATE}
    ).json()
    assert block_b_id in [b["availabilityBlockId"] for b in avail_b_after_cancel]

    # -----------------------------------------------------------------
    # (f) Owner: GET /bookings refleja la reserva cancelada; GET
    # /reports/dashboard muestra los conteos del dominio nuevo; superadmin:
    # GET /audit-logs?tenantId=<nuevo> contiene booking_created y
    # booking_updated (generados por los triggers 2 y 3 de
    # 07-triggers.sql: 1 insercion + 2 actualizaciones de estado -
    # pendiente->reagendada, reagendada->cancelada).
    # -----------------------------------------------------------------
    owner_bookings_resp = client.get("/bookings", params={"pageSize": 100}, headers=h)
    assert owner_bookings_resp.status_code == 200
    owner_bookings = owner_bookings_resp.json()["items"]
    booking_row = next((b for b in owner_bookings if b["bookingId"] == booking_id), None)
    assert booking_row is not None, "la reserva no aparece en GET /bookings del dominio nuevo"
    assert booking_row["status"] == "cancelled"

    dashboard_resp = client.get("/reports/dashboard", headers=h)
    assert dashboard_resp.status_code == 200
    dashboard = dashboard_resp.json()
    assert dashboard["tenantId"] == tenant_id
    assert dashboard["totalBookings"] == 1
    assert dashboard["pendingBookings"] == 0
    assert dashboard["confirmedBookings"] == 0
    assert dashboard["cancelledBookings"] == 1
    assert dashboard["totalCustomers"] == 1
    assert dashboard["totalActiveServices"] == 1
    assert dashboard["totalActiveLocations"] == 1

    audit_resp = client.get(
        "/audit-logs", params={"tenantId": tenant_id, "pageSize": 100}, headers=sh
    )
    assert audit_resp.status_code == 200
    audit_items = audit_resp.json()["items"]
    assert all(item["tenantId"] == tenant_id for item in audit_items)
    actions = [item["action"] for item in audit_items]
    assert "booking_created" in actions
    assert "booking_updated" in actions
    assert actions.count("booking_created") == 1
    assert actions.count("booking_updated") == 2
    assert len(audit_items) == 3
