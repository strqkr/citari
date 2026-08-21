from __future__ import annotations

from typing import Any

import pyodbc

from app.db import exec_sp, exec_sp_output, query_view

# Shared SELECT for the owner-facing flows (/bookings, /reports/*):
# aliases v_booking_details' own columns (it already exposes
# tracking_code via its own LEFT JOIN onto tracking_codes - see
# database/scripts/06-views.sql - so no re-join is needed here, unlike
# _DETAIL_SELECT below) into the same intermediate row shape
# app.mappers.booking_mapper.map_booking_detail expects. Reused by
# get_by_id/list_by_tenant here and by app.repositories.report_repository's
# bookings_detail (GET /reports/bookings-detail).
DETAIL_SELECT_BASE = """
SELECT
    v.booking_id                  AS booking_id,
    v.tenant_id                   AS tenant_id,
    v.location_id                 AS location_id,
    v.location_name               AS location_name,
    v.customer_name                AS customer_name,
    v.service_name                 AS service_name,
    CAST(v.start_time AS DATE)    AS booking_date,
    CAST(v.start_time AS TIME)    AS start_time,
    CAST(v.end_time AS TIME)      AS end_time,
    v.status                       AS status,
    v.customer_notes               AS customer_notes,
    v.tracking_code                AS tracking_code,
    v.created_at                   AS created_at
FROM v_booking_details v
"""

# Shared SELECT for the public/track detail flows. Aliases
# v_booking_details' real column names (booking_id, customer_name,
# service_name, start_time, end_time, ...) into the intermediate row
# shape app.mappers.booking_mapper.map_booking_detail expects (booking_id,
# customer_name, service_name, booking_date, start_time, ...) -
# that intermediate contract is what tests/unit/test_mappers.py locks in, not
# the view's own column names. `status` (booking_statuses.name) is already
# in English now, so no translation is needed here. Re-joins tracking_codes
# by booking_id to expose `expires_at`/`is_active` (the view itself only
# exposes `tracking_code`, not the code's own expiry/active flag).
_DETAIL_SELECT = """
SELECT
    v.booking_id                                     AS booking_id,
    v.tenant_id                                       AS tenant_id,
    v.tenant_slug                                      AS tenant_slug,
    v.location_id                                      AS location_id,
    v.location_name                                    AS location_name,
    v.customer_name                                    AS customer_name,
    v.service_name                                     AS service_name,
    CAST(v.start_time AS DATE)                        AS booking_date,
    CAST(v.start_time AS TIME)                        AS start_time,
    CAST(v.end_time AS TIME)                          AS end_time,
    v.status                                            AS status,
    v.customer_notes                                   AS customer_notes,
    v.tracking_code                                     AS tracking_code,
    tc.expires_at                                       AS expires_at,
    tc.is_active                                        AS is_active
FROM v_booking_details v
JOIN tracking_codes tc ON tc.booking_id = v.booking_id
"""


class BookingRepository:
    """bookings + tracking_codes (via v_booking_details)."""

    def __init__(self, conn: pyodbc.Connection) -> None:
        self._conn = conn

    # -- /bookings, owner-authenticated --------------------------------------
    # Not called by public.py/track.py. sp_create_booking's real signature
    # (database/scripts/04-procedures.sql) takes customer_id (existing
    # customer) OR the customer_first_name/customer_last_name_1/
    # customer_last_name_2/customer_email/customer_phone/customer_notes_field
    # branch (new customer, delegated internally to sp_create_customer),
    # plus service_id/location_id/availability_block_id/customer_notes, and
    # reports the new id via `@booking_id OUTPUT` only (no result set) - like
    # sp_create_availability_block in
    # app.repositories.availability_repository, this goes through
    # exec_sp_output.
    def create(
        self,
        *,
        tenant_id: int,
        service_id: int,
        location_id: int,
        availability_block_id: int,
        customer_id: int | None = None,
        first_name: str | None = None,
        last_name_1: str | None = None,
        last_name_2: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        customer_notes: str | None = None,
    ) -> int:
        """Returns the new `booking_id`. Neither `customer_id` nor the
        contact fields are validated here - an incomplete combination is
        rejected by the SP itself (THROW 50005 -> 400), same as the public
        flow relies on for its own required contact fields."""
        return exec_sp_output(
            self._conn,
            "sp_create_booking",
            {
                "tenant_id": tenant_id,
                "service_id": service_id,
                "location_id": location_id,
                "availability_block_id": availability_block_id,
                "customer_id": customer_id,
                "customer_first_name": first_name,
                "customer_last_name_1": last_name_1,
                "customer_last_name_2": last_name_2,
                "customer_email": email,
                "customer_phone": phone,
                "customer_notes": customer_notes,
            },
            output_param="booking_id",
        )

    def confirm(self, tenant_id: int, booking_id: int) -> None:
        exec_sp(
            self._conn,
            "sp_confirm_booking",
            {"booking_id": booking_id, "tenant_id": tenant_id},
        )

    def complete(self, tenant_id: int, booking_id: int) -> None:
        exec_sp(
            self._conn,
            "sp_complete_booking",
            {"booking_id": booking_id, "tenant_id": tenant_id},
        )

    def get_by_id(self, tenant_id: int, booking_id: int) -> dict[str, Any] | None:
        """Uses DETAIL_SELECT_BASE, same as list_by_tenant, since a raw
        `SELECT * FROM v_booking_details` returns the view's own
        column names (booking_id, customer_name, ...), not the intermediate
        keys map_booking_detail expects."""
        sql = DETAIL_SELECT_BASE + " WHERE v.tenant_id = ? AND v.booking_id = ?"
        rows = query_view(self._conn, sql, [tenant_id, booking_id], label="v_booking_details")
        return rows[0] if rows else None

    def list_by_tenant(
        self,
        tenant_id: int,
        *,
        page: int,
        page_size: int,
        status: str | None = None,
        booking_date: Any | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """GET /bookings. `status`, if given, is already the English
        booking_statuses.name value (pending/confirmed/cancelled/completed/
        rescheduled) - the API-facing slug and the stored value are the same
        now, so no translation happens before it reaches the WHERE clause."""
        conditions = ["v.tenant_id = ?"]
        params: list[Any] = [tenant_id]
        if status is not None:
            conditions.append("v.status = ?")
            params.append(status)
        if booking_date is not None:
            conditions.append("CAST(v.start_time AS DATE) = ?")
            params.append(booking_date)
        where = " AND ".join(conditions)

        count_sql = f"SELECT COUNT(*) AS total FROM v_booking_details v WHERE {where}"
        total_rows = query_view(self._conn, count_sql, params, label="v_booking_details")
        total = int(total_rows[0]["total"]) if total_rows else 0

        # booking_id DESC as tiebreaker: start_time can repeat, and
        # OFFSET/FETCH pagination needs a total order.
        sql = (
            DETAIL_SELECT_BASE + f" WHERE {where} ORDER BY v.start_time DESC, v.booking_id DESC "
            "OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"
        )
        rows = query_view(
            self._conn,
            sql,
            [*params, (page - 1) * page_size, page_size],
            label="v_booking_details",
        )
        return rows, total

    # -- Public storefront + tracking-code self-service ----------------------

    def create_public_booking(
        self,
        *,
        tenant_id: int,
        service_id: int,
        location_id: int,
        availability_block_id: int,
        first_name: str,
        last_name_1: str,
        last_name_2: str | None,
        email: str,
        phone: str,
        customer_notes: str | None,
    ) -> int:
        """POST /public/{slug}/bookings. Always takes the customer-contact
        branch of sp_create_booking (no `customer_id` - the public flow
        never has one, only contact info); the SP creates-or-reuses the
        customer by (tenant_id, email) internally via sp_create_customer.
        Returns the new `booking_id` (an OUTPUT param - see
        app.db.exec_sp_output)."""
        return exec_sp_output(
            self._conn,
            "sp_create_booking",
            {
                "tenant_id": tenant_id,
                "service_id": service_id,
                "location_id": location_id,
                "availability_block_id": availability_block_id,
                "customer_first_name": first_name,
                "customer_last_name_1": last_name_1,
                "customer_last_name_2": last_name_2,
                "customer_email": email,
                "customer_phone": phone,
                "customer_notes": customer_notes,
            },
            output_param="booking_id",
        )

    def get_detail_by_id(self, booking_id: int) -> dict[str, Any] | None:
        sql = _DETAIL_SELECT + " WHERE v.booking_id = ?"
        rows = query_view(self._conn, sql, [booking_id], label="v_booking_details")
        return rows[0] if rows else None

    def get_by_tracking_code(self, tracking_code: str) -> dict[str, Any] | None:
        """Uses _DETAIL_SELECT rather than a raw `SELECT * FROM
        v_booking_details WHERE tracking_code = ?`, since the view's
        real column names (booking_id, customer_name, ...) don't match the
        intermediate keys map_booking_detail expects (booking_id,
        customer_name, ...; locked by
        tests/unit/test_mappers.py::test_map_booking_detail). See
        _DETAIL_SELECT's docstring for the full rationale."""
        sql = _DETAIL_SELECT + " WHERE v.tracking_code = ?"
        rows = query_view(self._conn, sql, [tracking_code], label="v_booking_details")
        return rows[0] if rows else None

    def cancel(self, tenant_id: int, booking_id: int) -> None:
        """sp_cancel_booking's parameters are
        `@booking_id`/`@tenant_id`. No result set/OUTPUT param on this SP;
        callers re-fetch the updated detail row afterwards
        (tr_release_block_on_cancel already freed the block and the
        status flip is visible by the time this returns)."""
        exec_sp(
            self._conn,
            "sp_cancel_booking",
            {"booking_id": booking_id, "tenant_id": tenant_id},
        )

    def reschedule(self, tenant_id: int, booking_id: int, *, availability_block_id: int) -> None:
        """sp_reschedule_booking's parameters are
        `@booking_id`/`@tenant_id`/`@new_availability_block_id` - it has no
        booking_date/start_time parameters at all (like sp_create_booking,
        it takes the new block's own start_time/end_time)."""
        exec_sp(
            self._conn,
            "sp_reschedule_booking",
            {
                "booking_id": booking_id,
                "tenant_id": tenant_id,
                "new_availability_block_id": availability_block_id,
            },
        )
