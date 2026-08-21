"""Owner CRUD for locations (endpoints.locations)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import CurrentOwner, DbConnection
from app.errors import NotFoundError
from app.mappers.location_mapper import map_location
from app.repositories.location_repository import LocationRepository
from app.schemas.common import PageResponse
from app.schemas.location import LocationCreateRequest, LocationResponse, LocationUpdateRequest
from app.services.location_service import LocationService

router = APIRouter(prefix="/locations", tags=["locations"])


def _service(db: DbConnection) -> LocationService:
    return LocationService(LocationRepository(db))


def _require(service: LocationService, tenant_id: int, location_id: int) -> dict:
    row = service.get(tenant_id, location_id)
    if row is None:
        raise NotFoundError(f"Location {location_id} not found or does not belong to the tenant.")
    return row


@router.get("", response_model=PageResponse[LocationResponse])
def list_locations(
    owner: CurrentOwner,
    db: DbConnection,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> PageResponse[LocationResponse]:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    items, total = _service(db).list_locations(tenant_id, page=page, page_size=page_size)
    return PageResponse(
        items=[LocationResponse(**map_location(row)) for row in items],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("", response_model=LocationResponse, status_code=201)
def create_location(
    payload: LocationCreateRequest, owner: CurrentOwner, db: DbConnection
) -> LocationResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    location = _service(db).create(
        tenant_id=tenant_id,
        name=payload.name,
        province=payload.province,
        canton=payload.canton,
        district=payload.district,
        postal_code=payload.postal_code,
        phone=payload.phone,
        is_main=payload.is_main,
    )
    return LocationResponse(**map_location(location))


@router.get("/{location_id}", response_model=LocationResponse)
def get_location(location_id: int, owner: CurrentOwner, db: DbConnection) -> LocationResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    location = _require(_service(db), tenant_id, location_id)
    return LocationResponse(**map_location(location))


@router.patch("/{location_id}", response_model=LocationResponse)
def update_location(
    location_id: int, payload: LocationUpdateRequest, owner: CurrentOwner, db: DbConnection
) -> LocationResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    service = _service(db)
    _require(service, tenant_id, location_id)
    location = service.update(
        tenant_id,
        location_id,
        name=payload.name,
        province=payload.province,
        canton=payload.canton,
        district=payload.district,
        postal_code=payload.postal_code,
        phone=payload.phone,
        is_main=payload.is_main,
        is_active=payload.is_active,
    )
    return LocationResponse(**map_location(location or {}))


@router.delete("/{location_id}")
def delete_location(location_id: int, owner: CurrentOwner, db: DbConnection) -> dict[str, str]:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    service = _service(db)
    _require(service, tenant_id, location_id)
    service.delete(tenant_id, location_id)
    return {"status": "deleted"}
