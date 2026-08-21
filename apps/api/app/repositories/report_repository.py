from __future__ import annotations

from datetime import date
from typing import Any

import pyodbc

from app.db import query_view
from app.repositories.booking_repository import DETAIL_SELECT_BASE


class ReportRepository:
    """Read-only access to the reporting views."""

    def __init__(self, conn: pyodbc.Connection) -> None:
        self._conn = conn

    def dashboard(self, tenant_id: int) -> dict[str, Any] | None:
        sql = "SELECT * FROM v_tenant_dashboard WHERE tenant_id = ?"
        rows = query_view(self._conn, sql, [tenant_id], label="v_tenant_dashboard")
        return rows[0] if rows else None

    def daily_agenda(self, tenant_id: int, agenda_date: date) -> list[dict[str, Any]]:
        """v_daily_agenda's date column is `booking_date`."""
        sql = (
            "SELECT * FROM v_daily_agenda WHERE tenant_id = ? AND booking_date = ? "
            "ORDER BY start_time"
        )
        return query_view(self._conn, sql, [tenant_id, agenda_date], label="v_daily_agenda")

    def bookings_detail(
        self, tenant_id: int, *, page: int, page_size: int
    ) -> tuple[list[dict[str, Any]], int]:
        """GET /reports/bookings-detail: same underlying view/row shape as
        GET /bookings (see app.repositories.booking_repository.
        DETAIL_SELECT_BASE), just without the status/date filters."""
        total_rows = query_view(
            self._conn,
            "SELECT COUNT(*) AS total FROM v_booking_details WHERE tenant_id = ?",
            [tenant_id],
            label="v_booking_details",
        )
        total = int(total_rows[0]["total"]) if total_rows else 0

        sql = (
            DETAIL_SELECT_BASE
            + " WHERE v.tenant_id = ? ORDER BY v.start_time DESC, v.booking_id DESC "
            "OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"
        )
        rows = query_view(
            self._conn,
            sql,
            [tenant_id, (page - 1) * page_size, page_size],
            label="v_booking_details",
        )
        return rows, total

    def services_demand(self, tenant_id: int) -> list[dict[str, Any]]:
        sql = "SELECT * FROM v_service_demand WHERE tenant_id = ? ORDER BY total_bookings DESC"
        return query_view(self._conn, sql, [tenant_id], label="v_service_demand")

    def availability_status(self, tenant_id: int, status_date: date) -> list[dict[str, Any]]:
        """v_availability_status's date column is `block_date`."""
        sql = (
            "SELECT * FROM v_availability_status WHERE tenant_id = ? AND block_date = ? "
            "ORDER BY start_time"
        )
        return query_view(self._conn, sql, [tenant_id, status_date], label="v_availability_status")
