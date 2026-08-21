"""Tracking-code self-service (endpoints.track.*): customers manage their own
booking without an account, using the tracking code as the credential."""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import DbConnection
from app.mappers.booking_mapper import map_booking_detail
from app.repositories.booking_repository import BookingRepository
from app.schemas.booking import BookingDetailResponse, TrackRescheduleRequest
from app.services.booking_service import BookingService

router = APIRouter(prefix="/track", tags=["track"])


@router.get("/{code}", response_model=BookingDetailResponse)
def get_by_tracking_code(code: str, db: DbConnection) -> BookingDetailResponse:
    row = BookingService(BookingRepository(db)).get_by_tracking_code(code)
    return BookingDetailResponse(**map_booking_detail(row))


@router.post("/{code}/cancel", response_model=BookingDetailResponse)
def cancel_by_tracking_code(code: str, db: DbConnection) -> BookingDetailResponse:
    row = BookingService(BookingRepository(db)).cancel_by_tracking_code(code)
    return BookingDetailResponse(**map_booking_detail(row))


@router.post("/{code}/reschedule", response_model=BookingDetailResponse)
def reschedule_by_tracking_code(
    code: str, payload: TrackRescheduleRequest, db: DbConnection
) -> BookingDetailResponse:
    row = BookingService(BookingRepository(db)).reschedule_by_tracking_code(
        code, new_availability_block_id=payload.new_availability_block_id
    )
    return BookingDetailResponse(**map_booking_detail(row))
