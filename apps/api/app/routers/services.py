"""Owner CRUD for services (endpoints.services)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import CurrentOwner, DbConnection
from app.errors import NotFoundError
from app.mappers.service_mapper import map_service
from app.repositories.service_repository import ServiceRepository
from app.schemas.common import PageResponse
from app.schemas.service import ServiceCreateRequest, ServiceResponse, ServiceUpdateRequest
from app.services.service_service import ServiceService

router = APIRouter(prefix="/services", tags=["services"])


def _service(db: DbConnection) -> ServiceService:
    return ServiceService(ServiceRepository(db))


def _require(service: ServiceService, tenant_id: int, service_id: int) -> dict:
    row = service.get(tenant_id, service_id)
    if row is None:
        raise NotFoundError(f"Service {service_id} not found or does not belong to the tenant.")
    return row


@router.get("", response_model=PageResponse[ServiceResponse])
def list_services(
    owner: CurrentOwner,
    db: DbConnection,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
    category_id: Annotated[int | None, Query(alias="categoryId")] = None,
) -> PageResponse[ServiceResponse]:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    items, total = _service(db).list_services(
        tenant_id, page=page, page_size=page_size, category_id=category_id
    )
    return PageResponse(
        items=[ServiceResponse(**map_service(row)) for row in items],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("", response_model=ServiceResponse, status_code=201)
def create_service(
    payload: ServiceCreateRequest, owner: CurrentOwner, db: DbConnection
) -> ServiceResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    service = _service(db).create(
        tenant_id=tenant_id,
        category_id=payload.category_id,
        name=payload.name,
        description=payload.description,
        duration_minutes=payload.duration_minutes,
        price=payload.price,
        show_price=payload.show_price,
    )
    return ServiceResponse(**map_service(service))


@router.get("/{service_id}", response_model=ServiceResponse)
def get_service(service_id: int, owner: CurrentOwner, db: DbConnection) -> ServiceResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    service = _require(_service(db), tenant_id, service_id)
    return ServiceResponse(**map_service(service))


@router.patch("/{service_id}", response_model=ServiceResponse)
def update_service(
    service_id: int, payload: ServiceUpdateRequest, owner: CurrentOwner, db: DbConnection
) -> ServiceResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    service = _service(db)
    _require(service, tenant_id, service_id)
    updated = service.update(
        tenant_id,
        service_id,
        category_id=payload.category_id,
        name=payload.name,
        description=payload.description,
        duration_minutes=payload.duration_minutes,
        price=payload.price,
        show_price=payload.show_price,
    )
    return ServiceResponse(**map_service(updated or {}))


@router.delete("/{service_id}")
def delete_service(service_id: int, owner: CurrentOwner, db: DbConnection) -> dict[str, str]:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    service = _service(db)
    _require(service, tenant_id, service_id)
    service.delete(tenant_id, service_id)
    return {"status": "deleted"}
