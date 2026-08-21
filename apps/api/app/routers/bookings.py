"""Owner CRUD + lifecycle actions for bookings (endpoints.bookings)."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import CurrentOwner, DbConnection
from app.mappers.booking_mapper import map_booking_detail
from app.repositories.booking_repository import BookingRepository
from app.schemas.booking import (
    BookingCreateRequest,
    BookingDetailResponse,
    BookingRescheduleRequest,
    BookingStatus,
)
from app.schemas.common import PageResponse
from app.services.booking_service import BookingService

router = APIRouter(prefix="/bookings", tags=["bookings"])


def _service(db: DbConnection) -> BookingService:
    return BookingService(BookingRepository(db))


@router.get("", response_model=PageResponse[BookingDetailResponse])
def list_bookings(
    owner: CurrentOwner,
    db: DbConnection,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
    status: Annotated[BookingStatus | None, Query()] = None,
    booking_date: Annotated[date | None, Query(alias="date")] = None,
) -> PageResponse[BookingDetailResponse]:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    items, total = _service(db).list_bookings(
        tenant_id, page=page, page_size=page_size, status=status, booking_date=booking_date
    )
    return PageResponse(
        items=[BookingDetailResponse(**map_booking_detail(row)) for row in items],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("", response_model=BookingDetailResponse, status_code=201)
def create_booking(
    payload: BookingCreateRequest, owner: CurrentOwner, db: DbConnection
) -> BookingDetailResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    customer = payload.customer
    detail = _service(db).create_owner_booking(
        tenant_id=tenant_id,
        service_id=payload.service_id,
        location_id=payload.location_id,
        availability_block_id=payload.availability_block_id,
        customer_id=payload.customer_id,
        first_name=customer.first_name if customer else None,
        last_name=customer.last_name if customer else None,
        email=customer.email if customer else None,
        phone=customer.phone if customer else None,
        customer_notes=payload.customer_notes,
    )
    return BookingDetailResponse(**map_booking_detail(detail))


@router.get("/{booking_id}", response_model=BookingDetailResponse)
def get_booking(booking_id: int, owner: CurrentOwner, db: DbConnection) -> BookingDetailResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    detail = _service(db).get(tenant_id, booking_id)
    return BookingDetailResponse(**map_booking_detail(detail))


@router.post("/{booking_id}/confirm", response_model=BookingDetailResponse)
def confirm_booking(
    booking_id: int, owner: CurrentOwner, db: DbConnection
) -> BookingDetailResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    detail = _service(db).confirm(tenant_id, booking_id)
    return BookingDetailResponse(**map_booking_detail(detail))


@router.post("/{booking_id}/cancel", response_model=BookingDetailResponse)
def cancel_booking(booking_id: int, owner: CurrentOwner, db: DbConnection) -> BookingDetailResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    detail = _service(db).cancel(tenant_id, booking_id)
    return BookingDetailResponse(**map_booking_detail(detail))


@router.post("/{booking_id}/complete", response_model=BookingDetailResponse)
def complete_booking(
    booking_id: int, owner: CurrentOwner, db: DbConnection
) -> BookingDetailResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    detail = _service(db).complete(tenant_id, booking_id)
    return BookingDetailResponse(**map_booking_detail(detail))


@router.post("/{booking_id}/reschedule", response_model=BookingDetailResponse)
def reschedule_booking(
    booking_id: int, payload: BookingRescheduleRequest, owner: CurrentOwner, db: DbConnection
) -> BookingDetailResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    detail = _service(db).reschedule(
        tenant_id, booking_id, availability_block_id=payload.new_availability_block_id
    )
    return BookingDetailResponse(**map_booking_detail(detail))
