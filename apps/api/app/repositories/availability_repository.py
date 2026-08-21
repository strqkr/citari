from __future__ import annotations

from datetime import date, datetime, time
from typing import Any

import pyodbc

from app.db import exec_sp_output, query_view


class AvailabilityRepository:
    """availability_blocks / v_availability_status."""

    def __init__(self, conn: pyodbc.Connection) -> None:
        self._conn = conn

    def create_block(
        self,
        *,
        tenant_id: int,
        location_id: int,
        block_date: date,
        start_time: time,
        end_time: time,
    ) -> int:
        """sp_create_availability_block's parameters are
        `@block_date` / `@start_time` / `@end_time` (the latter two
        full DATETIME2, combining block_date with start/end_time), and it
        reports the new id via `@availability_block_id OUTPUT` - see
        database/scripts/04-procedures.sql, hence exec_sp_output rather than
        exec_sp. Used by /public and /track only indirectly, as the fixture
        that creates availability blocks for the integration tests.
        """
        start_dt = datetime.combine(block_date, start_time)
        end_dt = datetime.combine(block_date, end_time)
        return exec_sp_output(
            self._conn,
            "sp_create_availability_block",
            {
                "tenant_id": tenant_id,
                "location_id": location_id,
                "block_date": block_date,
                "start_time": start_dt,
                "end_time": end_dt,
            },
            output_param="availability_block_id",
        )

    # -- /availability-blocks (owner-authenticated) --------------------------
    _OWNER_SELECT = (
        "SELECT "
        "block_id AS availability_block_id, "
        "CAST(block_date AS DATE) AS block_date, "
        "CAST(start_time AS TIME) AS start_time, "
        "CAST(end_time AS TIME) AS end_time, "
        "is_reserved "
        "FROM v_availability_status"
    )

    def get_by_id(self, tenant_id: int, block_id: int) -> dict[str, Any] | None:
        sql = self._OWNER_SELECT + " WHERE tenant_id = ? AND block_id = ?"
        rows = query_view(self._conn, sql, [tenant_id, block_id], label="v_availability_status")
        return rows[0] if rows else None

    def list_owner(
        self,
        tenant_id: int,
        *,
        page: int,
        page_size: int,
        block_date: date | None = None,
        location_id: int | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """GET /availability-blocks: paginated, with optional ?date/
        ?locationId filters."""
        conditions = ["tenant_id = ?"]
        params: list[Any] = [tenant_id]
        if block_date is not None:
            conditions.append("block_date = ?")
            params.append(block_date)
        if location_id is not None:
            conditions.append("location_id = ?")
            params.append(location_id)
        where = " AND ".join(conditions)

        total_rows = query_view(
            self._conn,
            f"SELECT COUNT(*) AS total FROM v_availability_status WHERE {where}",
            params,
            label="v_availability_status",
        )
        total = int(total_rows[0]["total"]) if total_rows else 0

        sql = (
            self._OWNER_SELECT
            + f" WHERE {where} ORDER BY block_date, start_time, block_id "
            "OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"
        )
        rows = query_view(
            self._conn,
            sql,
            [*params, (page - 1) * page_size, page_size],
            label="v_availability_status",
        )
        return rows, total

    def deactivate(self, tenant_id: int, block_id: int) -> None:
        """Soft delete: is_active = 0. No SP exists for this - callers must
        have already checked for an active reservation (see
        app.services.availability_service.AvailabilityService.delete_block)
        since this table has no CHECK against that on its own."""
        cursor = self._conn.cursor()
        try:
            cursor.execute(
                "UPDATE availability_blocks SET is_active = 0, updated_at = SYSUTCDATETIME() "
                "WHERE tenant_id = ? AND availability_block_id = ?",
                [tenant_id, block_id],
            )
            self._conn.commit()
        except Exception:
            self._conn.rollback()
            raise
        finally:
            cursor.close()

    def list_public(
        self,
        slug: str,
        *,
        block_date: date | None = None,
        location_id: int | None = None,
    ) -> list[dict[str, Any]]:
        """GET /public/{slug}/availability. v_availability_status exposes
        the tenant slug as `tenant_slug` and the block date as
        `block_date`. "Available" means
        `block_is_active = 1 AND is_reserved = 0`; the optional date/location
        filters are applied on top, and the view's real columns are aliased
        into the row shape app.mappers.availability_mapper.map_availability_block
        expects (availability_block_id/block_date/start_time/end_time/
        is_reserved - locked by tests/unit/test_mappers.py). Since this
        query already filters is_reserved = 0, `is_reserved` always comes
        back 0/false here.
        """
        conditions = ["tenant_slug = ?", "block_is_active = 1", "is_reserved = 0"]
        params: list[Any] = [slug]
        if block_date is not None:
            conditions.append("block_date = ?")
            params.append(block_date)
        if location_id is not None:
            conditions.append("location_id = ?")
            params.append(location_id)

        sql = (
            "SELECT "
            "block_id AS availability_block_id, "
            "CAST(block_date AS DATE) AS block_date, "
            "CAST(start_time AS TIME) AS start_time, "
            "CAST(end_time AS TIME) AS end_time, "
            "is_reserved, "
            "location_id "
            "FROM v_availability_status "
            "WHERE " + " AND ".join(conditions) + " "
            "ORDER BY block_date, start_time"
        )
        return query_view(self._conn, sql, params, label="v_availability_status")
