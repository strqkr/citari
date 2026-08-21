"""Owner CRUD for availability blocks (endpoints.availabilityBlocks)."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import CurrentOwner, DbConnection
from app.errors import NotFoundError
from app.mappers.availability_mapper import map_availability_block
from app.repositories.availability_repository import AvailabilityRepository
from app.schemas.availability import AvailabilityBlockCreateRequest, AvailabilityBlockResponse
from app.schemas.common import PageResponse
from app.services.availability_service import AvailabilityService

router = APIRouter(prefix="/availability-blocks", tags=["availability-blocks"])


def _service(db: DbConnection) -> AvailabilityService:
    return AvailabilityService(AvailabilityRepository(db))


def _require(service: AvailabilityService, tenant_id: int, block_id: int) -> dict:
    row = service.get(tenant_id, block_id)
    if row is None:
        raise NotFoundError(f"Availability block {block_id} not found or does not belong to the tenant.")
    return row


@router.get("", response_model=PageResponse[AvailabilityBlockResponse])
def list_availability_blocks(
    owner: CurrentOwner,
    db: DbConnection,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
    block_date: Annotated[date | None, Query(alias="date")] = None,
    location_id: Annotated[int | None, Query(alias="locationId")] = None,
) -> PageResponse[AvailabilityBlockResponse]:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    items, total = _service(db).list_owner(
        tenant_id,
        page=page,
        page_size=page_size,
        block_date=block_date,
        location_id=location_id,
    )
    return PageResponse(
        items=[AvailabilityBlockResponse(**map_availability_block(row)) for row in items],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("", response_model=AvailabilityBlockResponse, status_code=201)
def create_availability_block(
    payload: AvailabilityBlockCreateRequest, owner: CurrentOwner, db: DbConnection
) -> AvailabilityBlockResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    service = _service(db)
    block_id = service.create_block(
        tenant_id=tenant_id,
        location_id=payload.location_id,
        block_date=payload.block_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    row = _require(service, tenant_id, block_id)
    return AvailabilityBlockResponse(**map_availability_block(row))


@router.get("/{availability_block_id}", response_model=AvailabilityBlockResponse)
def get_availability_block(
    availability_block_id: int, owner: CurrentOwner, db: DbConnection
) -> AvailabilityBlockResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    row = _require(_service(db), tenant_id, availability_block_id)
    return AvailabilityBlockResponse(**map_availability_block(row))


@router.delete("/{availability_block_id}")
def delete_availability_block(
    availability_block_id: int, owner: CurrentOwner, db: DbConnection
) -> dict[str, str]:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    service = _service(db)
    _require(service, tenant_id, availability_block_id)
    service.delete_block(tenant_id, availability_block_id)
    return {"status": "deleted"}
