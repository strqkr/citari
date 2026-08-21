"""Row from `bookings` / v_booking_details -> Booking contract.

Matches apps/frontend/types/booking.ts:
    { bookingId, customerName, serviceName, bookingDate, startTime, status,
      trackingCode }

v_booking_details already joins customers/services and exposes a
precomputed display name and the tracking code, so this mapper stays a flat,
pure translation (no name-combining logic here - that lives in
customer_mapper for the raw `customers` case).

`status` (booking_statuses.name) is now stored in English directly
(pending/confirmed/cancelled/completed/rescheduled), matching the slug the
frontend expects, so no translation step is needed anymore - the mapper is a
straight passthrough.

The repository is responsible for aliasing the real v_booking_details
column names (booking_id, customer_name, service_name, start_time,
end_time, ...) into the intermediate keys this mapper expects (see
app.repositories.booking_repository) - that intermediate contract is what the
unit tests lock in, not the raw view's column names.
"""

from __future__ import annotations

from typing import Any


def map_booking_detail(row: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {
        "booking_id": row["booking_id"],
        "customer_name": row["customer_name"],
        "service_name": row["service_name"],
        "booking_date": row["booking_date"],
        "start_time": row["start_time"],
        "status": row["status"],
        "tracking_code": row["tracking_code"],
    }
    # Optional BookingDetailResponse fields - only present when the caller's
    # SELECT actually included them (see get_by_tracking_code /
    # get_detail_by_id), same conditional pattern as map_availability_block's
    # is_reserved handling.
    if "end_time" in row:
        result["end_time"] = row["end_time"]
    if "location_name" in row:
        result["location_name"] = row["location_name"]
    if "customer_notes" in row:
        result["customer_notes"] = row["customer_notes"]
    return result
