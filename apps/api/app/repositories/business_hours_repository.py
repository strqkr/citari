from __future__ import annotations

from datetime import time
from typing import Any, TypedDict

import pyodbc

from app.db import query_view


class BusinessHourInput(TypedDict):
    day_of_week: int
    open_time: time | None
    close_time: time | None
    is_closed: bool


class BusinessHoursRepository:
    """business_hours. No stored procedure exists for this table - PUT
    /business-hours replaces one location's entire weekly set inside a
    single DELETE + INSERT transaction."""

    def __init__(self, conn: pyodbc.Connection) -> None:
        self._conn = conn

    def list_by_tenant(
        self, tenant_id: int, *, location_id: int | None = None
    ) -> list[dict[str, Any]]:
        conditions = ["tenant_id = ?"]
        params: list[Any] = [tenant_id]
        if location_id is not None:
            conditions.append("location_id = ?")
            params.append(location_id)
        sql = (
            f"SELECT * FROM business_hours WHERE {' AND '.join(conditions)} "
            "ORDER BY location_id, day_of_week"
        )
        return query_view(self._conn, sql, params)

    def replace_week(
        self, tenant_id: int, location_id: int, hours: list[BusinessHourInput]
    ) -> list[dict[str, Any]]:
        """Deletes the previous weekly set for this location, then inserts
        the new one - all in one transaction (single commit/rollback pair)."""
        cursor = self._conn.cursor()
        try:
            cursor.execute(
                "DELETE FROM business_hours WHERE tenant_id = ? AND location_id = ?",
                [tenant_id, location_id],
            )
            for item in hours:
                cursor.execute(
                    "INSERT INTO business_hours "
                    "(tenant_id, location_id, day_of_week, open_time, close_time, is_closed) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    [
                        tenant_id,
                        location_id,
                        item["day_of_week"],
                        item["open_time"],
                        item["close_time"],
                        item["is_closed"],
                    ],
                )
            self._conn.commit()
        except Exception:
            self._conn.rollback()
            raise
        finally:
            cursor.close()

        return self.list_by_tenant(tenant_id, location_id=location_id)
