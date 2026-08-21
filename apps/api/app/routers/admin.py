"""Superadmin-only tenant management (endpoints.admin.* in the frontend)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import CurrentSuperadmin, DbConnection
from app.errors import NotFoundError
from app.mappers.tenant_mapper import map_tenant
from app.repositories.tenant_repository import TenantRepository
from app.routers import not_implemented
from app.schemas.common import PageResponse
from app.schemas.tenant import TenantCreateRequest, TenantResponse
from app.services.tenant_service import TenantService

router = APIRouter(prefix="/admin/tenants", tags=["admin"])


def _service(db: DbConnection) -> TenantService:
    return TenantService(TenantRepository(db))


@router.get("", response_model=PageResponse[TenantResponse])
def list_tenants(
    superadmin: CurrentSuperadmin,
    db: DbConnection,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> PageResponse[TenantResponse]:
    items, total = _service(db).list_tenants(page=page, page_size=page_size)
    return PageResponse(
        items=[TenantResponse(**map_tenant(row)) for row in items],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("", response_model=TenantResponse)
def create_tenant(payload: TenantCreateRequest) -> TenantResponse:
    """Tenants are only created via POST /auth/register-owner; admin tenant
    management only covers list/get/activate/suspend, so this endpoint
    returns 501."""
    not_implemented()


@router.get("/{tenant_id}", response_model=TenantResponse)
def get_tenant(tenant_id: int, superadmin: CurrentSuperadmin, db: DbConnection) -> TenantResponse:
    tenant = _service(db).get_tenant(tenant_id)
    if tenant is None:
        raise NotFoundError(f"Tenant {tenant_id} not found.")
    return TenantResponse(**map_tenant(tenant))


@router.post("/{tenant_id}/activate", response_model=TenantResponse)
def activate_tenant(
    tenant_id: int, superadmin: CurrentSuperadmin, db: DbConnection
) -> TenantResponse:
    tenant = _service(db).activate_tenant(tenant_id, int(superadmin.sub))
    return TenantResponse(**map_tenant(tenant or {}))


@router.post("/{tenant_id}/suspend", response_model=TenantResponse)
def suspend_tenant(
    tenant_id: int, superadmin: CurrentSuperadmin, db: DbConnection
) -> TenantResponse:
    tenant = _service(db).suspend_tenant(tenant_id, int(superadmin.sub))
    return TenantResponse(**map_tenant(tenant or {}))
