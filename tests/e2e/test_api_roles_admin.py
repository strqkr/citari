"""Guardas de rol cruzadas + admin/tenants (superadmin), tenant/current (owner),
audit-logs (superadmin) y reports (owner).

Documenta el codigo real cuando difiere de lo esperado (ver comentarios
inline: token owner sobre /admin/tenants y token superadmin sobre
/tenant/current dan ambos 403, con detail 'owner role required' /
'superadmin role required')."""

from __future__ import annotations

import httpx
import pytest

from conftest import bearer, sql_scalar
from test_api_helpers import assert_page_envelope, assert_rfc7807, unique_tag

pytestmark = pytest.mark.e2e


# ---------------------------------------------------------------------------
# Guardas de rol cruzadas (grupo 5)
# ---------------------------------------------------------------------------


def test_owner_token_on_admin_tenants_is_403(client: httpx.Client, owner1_token: str) -> None:
    r = client.get("/admin/tenants", headers=bearer(owner1_token))
    assert r.status_code == 403
    body = r.json()
    assert_rfc7807(body, 403)
    assert body["detail"] == "superadmin role required"


def test_superadmin_token_on_tenant_current_is_403(client: httpx.Client, superadmin_token: str) -> None:
    r = client.get("/tenant/current", headers=bearer(superadmin_token))
    assert r.status_code == 403
    body = r.json()
    assert_rfc7807(body, 403)
    assert body["detail"] == "owner role required"


def test_owner_token_on_audit_logs_is_403(client: httpx.Client, owner1_token: str) -> None:
    r = client.get("/audit-logs", headers=bearer(owner1_token))
    assert r.status_code == 403
    assert_rfc7807(r.json(), 403)


def test_superadmin_token_on_bookings_is_403(client: httpx.Client, superadmin_token: str) -> None:
    """El guarda de owner tambien rechaza un token superadmin valido (no
    solo la ausencia de token) - mismo detail 'owner role required'."""
    r = client.get("/bookings", headers=bearer(superadmin_token))
    assert r.status_code == 403
    assert_rfc7807(r.json(), 403)


# ---------------------------------------------------------------------------
# /admin/tenants (superadmin)
# ---------------------------------------------------------------------------


def test_admin_tenants_requires_auth_401(client: httpx.Client) -> None:
    r = client.get("/admin/tenants")
    assert r.status_code == 401
    assert_rfc7807(r.json(), 401)


def test_admin_tenants_create_is_501_stub(client: httpx.Client, superadmin_token: str) -> None:
    """POST /admin/tenants es un stub 501 a proposito (docs/api-handover.md:
    el unico camino real para crear un dominio es /auth/register-owner)."""
    r = client.post(
        "/admin/tenants",
        json={"name": "x", "slug": "zz-should-not-be-created", "businessTypeId": 1, "email": "z@z.com"},
        headers=bearer(superadmin_token),
    )
    assert r.status_code == 501
    assert_rfc7807(r.json(), 501)


def test_admin_tenants_list_pagination(client: httpx.Client, superadmin_token: str) -> None:
    r = client.get("/admin/tenants", params={"pageSize": 2}, headers=bearer(superadmin_token))
    assert r.status_code == 200
    body = r.json()
    assert_page_envelope(body)
    assert len(body["items"]) == 2
    assert body["total"] >= 2
    item = body["items"][0]
    assert set(item.keys()) == {
        "tenantId", "slug", "name", "description", "publicMessage", "email", "phone", "logoUrl", "status"
    }


def test_admin_tenant_get_nonexistent_404(client: httpx.Client, superadmin_token: str) -> None:
    r = client.get("/admin/tenants/999999999", headers=bearer(superadmin_token))
    assert r.status_code == 404
    assert_rfc7807(r.json(), 404)


def test_admin_tenant_activate_and_suspend_cycle(
    client: httpx.Client, superadmin_token: str, cleanup_sql
) -> None:
    """Usa un dominio temporal (via register-owner) en vez de tocar los
    tenants reales del seed, para no interferir con otros tests/agentes
    que dependen del estado 'activo' de los tenants 1/2."""
    tag = unique_tag()
    reg = client.post(
        "/auth/register-owner",
        json={
            "businessName": "ZZ E2E Admin Cycle",
            "businessTypeId": 1,
            "slug": f"zz-e2e-admincycle-{tag}",
            "businessEmail": f"zz.e2e.admincycle.{tag}@example.com",
            "ownerFirstName": "Zz",
            "ownerLastName": "Admin Cycle",
            "ownerEmail": f"zz.e2e.admincycle.owner.{tag}@example.com",
            "password": "ZzE2ePass123",
        },
    ).json()
    tenant_id = reg["tenantId"]
    cleanup_sql(f"DELETE FROM tenants WHERE tenant_id = {tenant_id}")
    cleanup_sql(f"DELETE FROM tenant_owners WHERE tenant_id = {tenant_id}")
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

    h = bearer(superadmin_token)
    get_resp = client.get(f"/admin/tenants/{tenant_id}", headers=h)
    assert get_resp.status_code == 200
    assert get_resp.json()["status"] == "pending"

    activate_resp = client.post(f"/admin/tenants/{tenant_id}/activate", headers=h)
    assert activate_resp.status_code == 200
    assert activate_resp.json()["status"] == "active"

    suspend_resp = client.post(f"/admin/tenants/{tenant_id}/suspend", headers=h)
    assert suspend_resp.status_code == 200
    assert suspend_resp.json()["status"] == "suspended"


def test_admin_tenant_activate_nonexistent_404(client: httpx.Client, superadmin_token: str) -> None:
    r = client.post("/admin/tenants/999999999/activate", headers=bearer(superadmin_token))
    assert r.status_code == 404
    assert_rfc7807(r.json(), 404)


# ---------------------------------------------------------------------------
# /tenant/current (owner)
# ---------------------------------------------------------------------------


def test_tenant_current_get_shape(client: httpx.Client, owner1_token: str) -> None:
    r = client.get("/tenant/current", headers=bearer(owner1_token))
    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) == {
        "tenantId", "slug", "name", "description", "publicMessage", "email", "phone", "logoUrl", "status"
    }
    assert body["status"] == "active"


def test_tenant_current_patch_updates_and_is_restored(
    client: httpx.Client, owner1_token: str, cleanup_sql
) -> None:
    """PATCH /tenant/current sigue el patron COALESCE (omitido = sin
    cambio, NO se puede volver a NULL enviando null - comportamiento real
    documentado aqui, igual al de categorias/services/locations). Por
    eso la restauracion del valor original se hace por SQL directo, no
    reenviando el valor original por PATCH (aunque tambien funcionaria)."""
    tag = unique_tag()
    h = bearer(owner1_token)

    original = client.get("/tenant/current", headers=h).json()
    original_phone = original["phone"]
    cleanup_sql(
        f"UPDATE tenant_phones SET phone = '{original_phone}' "
        "WHERE tenant_phone_id = (SELECT TOP 1 tenant_phone_id FROM tenant_phones "
        "WHERE tenant_id = 1 ORDER BY tenant_phone_id)"
    )

    patch_resp = client.patch("/tenant/current", json={"phone": f"2200-{tag[-4:]}"}, headers=h)
    assert patch_resp.status_code == 200
    assert patch_resp.json()["phone"] == f"2200-{tag[-4:]}"

    get_resp = client.get("/tenant/current", headers=h)
    assert get_resp.json()["phone"] == f"2200-{tag[-4:]}"


def test_tenant_current_patch_null_field_means_no_change(
    client: httpx.Client, owner1_token: str, cleanup_sql
) -> None:
    """Comportamiento real (no necesariamente el esperado por un cliente
    REST tipico): enviar {"phone": null} NO borra el phone, lo deja sin
    cambio (COALESCE-by-omission, ver TenantRepository.update_tenant)."""
    h = bearer(owner1_token)
    original_phone = client.get("/tenant/current", headers=h).json()["phone"]
    cleanup_sql(
        f"UPDATE tenant_phones SET phone = '{original_phone}' "
        "WHERE tenant_phone_id = (SELECT TOP 1 tenant_phone_id FROM tenant_phones "
        "WHERE tenant_id = 1 ORDER BY tenant_phone_id)"
    )

    r = client.patch("/tenant/current", json={"phone": None}, headers=h)
    assert r.status_code == 200
    assert r.json()["phone"] == original_phone


def test_tenant_current_requires_auth_401(client: httpx.Client) -> None:
    r = client.get("/tenant/current")
    assert r.status_code == 401
    assert_rfc7807(r.json(), 401)


# ---------------------------------------------------------------------------
# /audit-logs (superadmin)
# ---------------------------------------------------------------------------


def test_audit_logs_pagination_and_shape(client: httpx.Client, superadmin_token: str) -> None:
    r = client.get("/audit-logs", params={"pageSize": 3}, headers=bearer(superadmin_token))
    assert r.status_code == 200
    body = r.json()
    assert_page_envelope(body)
    assert len(body["items"]) == 3
    item = body["items"][0]
    assert set(item.keys()) == {
        "auditId", "tenantId", "ownerId", "superadminId", "action", "entityName",
        "entityId", "oldValue", "newValue", "createdAt",
    }


def test_audit_logs_filter_by_tenant_id(client: httpx.Client, superadmin_token: str) -> None:
    r = client.get("/audit-logs", params={"tenantId": 1, "pageSize": 100}, headers=bearer(superadmin_token))
    assert r.status_code == 200
    body = r.json()
    assert all(item["tenantId"] == 1 for item in body["items"])


def test_audit_logs_requires_auth_401(client: httpx.Client) -> None:
    r = client.get("/audit-logs")
    assert r.status_code == 401
    assert_rfc7807(r.json(), 401)


# ---------------------------------------------------------------------------
# /reports/* (owner)
# ---------------------------------------------------------------------------


def test_reports_dashboard_shape(client: httpx.Client, owner1_token: str) -> None:
    r = client.get("/reports/dashboard", headers=bearer(owner1_token))
    assert r.status_code == 200
    body = r.json()
    assert body["tenantId"] == 1
    assert set(body.keys()) == {
        "tenantId", "name", "totalBookings", "pendingBookings", "confirmedBookings",
        "cancelledBookings", "totalCustomers", "totalActiveServices", "totalActiveLocations",
    }


def test_reports_daily_agenda_requires_date_422(client: httpx.Client, owner1_token: str) -> None:
    r = client.get("/reports/daily-agenda", headers=bearer(owner1_token))
    assert r.status_code == 422
    assert_rfc7807(r.json(), 422)


def test_reports_daily_agenda_shape(client: httpx.Client, owner1_token: str) -> None:
    r = client.get(
        "/reports/daily-agenda", params={"date": "2020-01-01"}, headers=bearer(owner1_token)
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_reports_bookings_detail_pagination(client: httpx.Client, owner1_token: str) -> None:
    r = client.get("/reports/bookings-detail", params={"pageSize": 2}, headers=bearer(owner1_token))
    assert r.status_code == 200
    assert_page_envelope(r.json())


def test_reports_services_demand_shape(client: httpx.Client, owner1_token: str) -> None:
    r = client.get("/reports/services-demand", headers=bearer(owner1_token))
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    if body:
        assert set(body[0].keys()) == {"serviceId", "serviceName", "totalBookings", "lastBookingAt"}


def test_reports_availability_status_requires_date_422(client: httpx.Client, owner1_token: str) -> None:
    r = client.get("/reports/availability-status", headers=bearer(owner1_token))
    assert r.status_code == 422
    assert_rfc7807(r.json(), 422)


def test_reports_requires_auth_401(client: httpx.Client) -> None:
    r = client.get("/reports/dashboard")
    assert r.status_code == 401
    assert_rfc7807(r.json(), 401)
