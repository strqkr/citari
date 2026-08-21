"""Matches apps/frontend/types/booking.ts."""

from __future__ import annotations

from datetime import date, time
from typing import Literal

from app.schemas.common import CamelModel

BookingStatus = Literal["pending", "confirmed", "cancelled", "completed", "rescheduled"]


class BookingResponse(CamelModel):
    booking_id: int
    customer_name: str
    service_name: str
    booking_date: date
    start_time: time
    status: BookingStatus
    tracking_code: str


class BookingDetailResponse(BookingResponse):
    """Superset of BookingResponse used by the public/track endpoints.
    Extra fields are optional and only set when the repository row actually
    carries them (see app.mappers.booking_mapper.map_booking_detail) - never
    includes nota_interna (internal/business-only note)."""

    end_time: time | None = None
    location_name: str | None = None
    customer_notes: str | None = None


class BookingCustomerContact(CamelModel):
    """Nested `customer` object of PublicBookingCreateRequest/
    BookingCreateRequest - contact info for a customer that does not exist
    yet (the public flow never has a pre-existing customer_id; the owner
    flow may use either this or an existing customerId - see
    BookingCreateRequest)."""

    first_name: str
    last_name: str
    email: str
    phone: str


class BookingCreateRequest(CamelModel):
    """POST /bookings (owner-authenticated internal creation):
    sp_create_booking takes either an existing `customerId` OR a full
    `customer` contact block (never both, never neither) - see
    docs/sql-signatures.md #9. The SP itself enforces that rule (THROW 50005
    -> 400) rather than duplicating it here. `bookingDate`/`startTime` are
    not accepted: like the public flow, the booking's schedule always comes
    from `availabilityBlockId`'s own block."""

    service_id: int
    location_id: int
    availability_block_id: int
    customer_id: int | None = None
    customer: BookingCustomerContact | None = None
    customer_notes: str | None = None


class BookingRescheduleRequest(CamelModel):
    """POST /bookings/{id}/reschedule body: `{ newAvailabilityBlockId }`
    - same shape as TrackRescheduleRequest, kept as its own class so the
    owner-facing and public-facing contracts can evolve independently."""

    new_availability_block_id: int


class PublicBookingCreateRequest(CamelModel):
    """POST /public/{slug}/bookings body."""

    service_id: int
    location_id: int
    availability_block_id: int
    customer: BookingCustomerContact
    customer_notes: str | None = None


class TrackRescheduleRequest(CamelModel):
    """POST /track/{code}/reschedule body: `{ newAvailabilityBlockId }`."""

    new_availability_block_id: int
