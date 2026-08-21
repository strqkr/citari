"""Owner CRUD for service categories (endpoints.serviceCategories)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import CurrentOwner, DbConnection
from app.errors import NotFoundError
from app.mappers.service_mapper import map_service_category
from app.repositories.service_category_repository import ServiceCategoryRepository
from app.schemas.category import (
    ServiceCategoryCreateRequest,
    ServiceCategoryResponse,
    ServiceCategoryUpdateRequest,
)
from app.schemas.common import PageResponse
from app.services.service_category_service import ServiceCategoryService

router = APIRouter(prefix="/service-categories", tags=["service-categories"])


def _service(db: DbConnection) -> ServiceCategoryService:
    return ServiceCategoryService(ServiceCategoryRepository(db))


def _require(service: ServiceCategoryService, tenant_id: int, category_id: int) -> dict:
    category = service.get(tenant_id, category_id)
    if category is None:
        raise NotFoundError(f"Category {category_id} not found or does not belong to the tenant.")
    return category


@router.get("", response_model=PageResponse[ServiceCategoryResponse])
def list_service_categories(
    owner: CurrentOwner,
    db: DbConnection,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> PageResponse[ServiceCategoryResponse]:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    items, total = _service(db).list_categories(tenant_id, page=page, page_size=page_size)
    return PageResponse(
        items=[ServiceCategoryResponse(**map_service_category(row)) for row in items],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("", response_model=ServiceCategoryResponse, status_code=201)
def create_service_category(
    payload: ServiceCategoryCreateRequest, owner: CurrentOwner, db: DbConnection
) -> ServiceCategoryResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    category = _service(db).create(
        tenant_id=tenant_id, name=payload.name, description=payload.description
    )
    return ServiceCategoryResponse(**map_service_category(category))


@router.get("/{category_id}", response_model=ServiceCategoryResponse)
def get_service_category(
    category_id: int, owner: CurrentOwner, db: DbConnection
) -> ServiceCategoryResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    category = _require(_service(db), tenant_id, category_id)
    return ServiceCategoryResponse(**map_service_category(category))


@router.patch("/{category_id}", response_model=ServiceCategoryResponse)
def update_service_category(
    category_id: int, payload: ServiceCategoryUpdateRequest, owner: CurrentOwner, db: DbConnection
) -> ServiceCategoryResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    service = _service(db)
    _require(service, tenant_id, category_id)
    category = service.update(
        tenant_id,
        category_id,
        name=payload.name,
        description=payload.description,
        is_active=payload.is_active,
    )
    return ServiceCategoryResponse(**map_service_category(category or {}))


@router.delete("/{category_id}")
def delete_service_category(
    category_id: int, owner: CurrentOwner, db: DbConnection
) -> dict[str, str]:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    service = _service(db)
    _require(service, tenant_id, category_id)
    service.delete(tenant_id, category_id)
    return {"status": "deleted"}
