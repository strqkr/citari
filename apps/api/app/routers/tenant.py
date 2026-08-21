"""The owner's own tenant profile (endpoints.tenant.current)."""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import CurrentOwner, DbConnection
from app.errors import NotFoundError
from app.mappers.tenant_mapper import map_tenant
from app.repositories.tenant_repository import TenantRepository
from app.schemas.tenant import TenantResponse, TenantUpdateRequest
from app.services.tenant_service import TenantService

router = APIRouter(prefix="/tenant", tags=["tenant"])


def _require_tenant(service: TenantService, tenant_id: int) -> dict:
    tenant = service.get_tenant(tenant_id)
    if tenant is None:
        # Should not normally happen - tenant_id always comes from the JWT's
        # tenantId claim (see app.deps.get_current_owner's invariant) - but a
        # domain could in principle be deleted after the token was issued.
        raise NotFoundError(f"Tenant {tenant_id} no longer exists.")
    return tenant


@router.get("/current", response_model=TenantResponse)
def get_current_tenant(owner: CurrentOwner, db: DbConnection) -> TenantResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    tenant = _require_tenant(TenantService(TenantRepository(db)), tenant_id)
    return TenantResponse(**map_tenant(tenant))


@router.patch("/current", response_model=TenantResponse)
def update_current_tenant(
    payload: TenantUpdateRequest, owner: CurrentOwner, db: DbConnection
) -> TenantResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    service = TenantService(TenantRepository(db))
    _require_tenant(service, tenant_id)
    tenant = service.update_tenant(
        tenant_id,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        description=payload.description,
        logo_url=payload.logo_url,
        public_message=payload.public_message,
    )
    return TenantResponse(**map_tenant(tenant or {}))
