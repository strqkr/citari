from __future__ import annotations

from typing import Any

import pyodbc

from app.db import query_view


class BusinessTypeRepository:
    """business_types (read-only catalog)."""

    def __init__(self, conn: pyodbc.Connection) -> None:
        self._conn = conn

    def list_business_types(self) -> list[dict[str, Any]]:
        """The active-flag column is `is_active` (rename-map row 6), not
        `esta_activo`."""
        sql = (
            "SELECT business_type_id, name, description, is_active "
            "FROM business_types WHERE is_active = 1 ORDER BY name"
        )
        return query_view(self._conn, sql, label="business_types")
