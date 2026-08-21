from __future__ import annotations

from typing import Any

import pyodbc

from app.db import query_view


class ServiceCategoryRepository:
    """service_categories. No stored procedure exists for this table (see
    docs/sql-signatures.md) - every write here is a direct parameterized
    statement."""

    def __init__(self, conn: pyodbc.Connection) -> None:
        self._conn = conn

    def create(self, *, tenant_id: int, name: str, description: str | None) -> dict[str, Any]:
        sql = (
            "INSERT INTO service_categories (tenant_id, name, description) "
            "OUTPUT INSERTED.* VALUES (?, ?, ?)"
        )
        rows = query_view(self._conn, sql, [tenant_id, name, description])
        self._conn.commit()
        return rows[0] if rows else {}

    def get_by_id(self, tenant_id: int, category_id: int) -> dict[str, Any] | None:
        """The primary key is `category_id`. No
        `is_active` filter here (unlike list_by_tenant): a soft-deleted
        category must still be readable by id so PATCH/GET can confirm the
        delete."""
        sql = "SELECT * FROM service_categories WHERE tenant_id = ? AND category_id = ?"
        rows = query_view(self._conn, sql, [tenant_id, category_id])
        return rows[0] if rows else None

    def list_by_tenant(
        self, tenant_id: int, *, page: int, page_size: int
    ) -> tuple[list[dict[str, Any]], int]:
        total_rows = query_view(
            self._conn,
            "SELECT COUNT(*) AS total FROM service_categories WHERE tenant_id = ? AND is_active = 1",
            [tenant_id],
        )
        total = int(total_rows[0]["total"]) if total_rows else 0
        sql = (
            "SELECT * FROM service_categories WHERE tenant_id = ? AND is_active = 1 "
            "ORDER BY name, category_id OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"
        )
        rows = query_view(self._conn, sql, [tenant_id, (page - 1) * page_size, page_size])
        return rows, total

    def update(
        self,
        tenant_id: int,
        category_id: int,
        *,
        name: str | None = None,
        description: str | None = None,
        is_active: bool | None = None,
    ) -> dict[str, Any] | None:
        """PATCH /service-categories/{id} and the soft DELETE (is_active=False)
        both go through this one dynamic UPDATE - same COALESCE-by-omission
        pattern as app.repositories.tenant_repository.update_tenant."""
        columns: dict[str, Any] = {}
        if name is not None:
            columns["name"] = name
        if description is not None:
            columns["description"] = description
        if is_active is not None:
            columns["is_active"] = is_active

        if columns:
            set_clause = ", ".join(f"{column} = ?" for column in columns)
            sql = (
                f"UPDATE service_categories SET {set_clause}, updated_at = SYSUTCDATETIME() "
                "WHERE tenant_id = ? AND category_id = ?"
            )
            cursor = self._conn.cursor()
            try:
                cursor.execute(sql, [*columns.values(), tenant_id, category_id])
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise
            finally:
                cursor.close()

        return self.get_by_id(tenant_id, category_id)
