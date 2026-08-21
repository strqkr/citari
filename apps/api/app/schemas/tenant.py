"""Matches apps/frontend/types/tenant.ts's core fields
({ tenantId, slug, name, description, publicMessage }), plus the additional
editable `dominios` columns GET/PATCH /tenant/current also expose
(email/phone/logoUrl). Those three are not part of the frontend Tenant type
yet but the owner can read and edit them, so they are carried as optional
fields (see app.mappers.tenant_mapper for why they stay absent on the public
endpoint's response)."""

from __future__ import annotations

from app.schemas.common import CamelModel


class TenantResponse(CamelModel):
    tenant_id: int
    slug: str
    name: str
    description: str | None = None
    public_message: str | None = None
    email: str | None = None
    phone: str | None = None
    logo_url: str | None = None
    # Only present on GET /admin/tenants and GET /admin/tenants/{id}
    # (see app.mappers.tenant_mapper.map_tenant's conditional field).
    status: str | None = None


class TenantCreateRequest(CamelModel):
    name: str
    slug: str
    business_type_id: int
    email: str
    phone: str | None = None
    description: str | None = None
    public_message: str | None = None


class TenantUpdateRequest(CamelModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    description: str | None = None
    logo_url: str | None = None
    public_message: str | None = None
