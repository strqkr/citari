"""Row from `tenants` -> Tenant contract.

Matches apps/frontend/types/tenant.ts:
    { tenantId, slug, name, description, publicMessage }

GET/PATCH /tenant/current select the full `tenants` row (including
email/phone/logo_url), unlike the public endpoint's narrower SELECT -
when those columns are present in the input row they are surfaced too, as
email/phone/logoUrl. This is intentionally conditional (only added when the
key is present) so a row without those keys still maps correctly (see
tests/unit/test_mappers.py::test_map_tenant, which asserts exact dict
equality on such a row).

email/phone don't live on `tenants` itself (they're in
tenant_emails/tenant_phones, 1:N); the repository queries that need
them resolve them via an OUTER APPLY and alias the result back onto the row
AS email/AS phone (see
app.repositories.tenant_repository.get_by_id/get_by_slug/list_tenants), so
the "is the key present on this row" check below means whether *this* query
bothered to select the column, not whether the row was fully hydrated.
get_active_by_slug (the public path) deliberately doesn't select them at
all, so this stays conditional rather than becoming an unconditional
`row["email"]`.

GET /admin/tenants and GET /admin/tenants/{id} join tenant_statuses and
pass through `status_name` (see
app.repositories.tenant_repository.get_by_id/list_tenants) - surfaced here
as `status`, same conditional-field technique.
"""

from __future__ import annotations

from typing import Any


def map_tenant(row: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {
        "tenant_id": row["tenant_id"],
        "slug": row["slug"],
        "name": row["name"],
        "description": row.get("description"),
        "public_message": row.get("public_message"),
    }
    if "email" in row:
        result["email"] = row["email"]
    if "phone" in row:
        result["phone"] = row["phone"]
    if "logo_url" in row:
        result["logo_url"] = row["logo_url"]
    if "status_name" in row:
        result["status"] = row["status_name"]
    return result
