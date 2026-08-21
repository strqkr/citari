from __future__ import annotations

from typing import Any

import pyodbc

from app.db import exec_sp, exec_sp_output, query_view


class ServiceRepository:
    """services."""

    def __init__(self, conn: pyodbc.Connection) -> None:
        self._conn = conn

    def create(
        self,
        *,
        tenant_id: int,
        category_id: int,
        name: str,
        description: str | None,
        duration_minutes: int,
        price: float | None,
        show_price: bool,
    ) -> dict[str, Any]:
        """sp_create_service reports the new id via `@service_id OUTPUT`
        only - no final SELECT (docs/sql-signatures.md #5) - so this goes
        through exec_sp_output and then re-reads the full row, like every
        other OUTPUT-param SP in this codebase."""
        service_id = exec_sp_output(
            self._conn,
            "sp_create_service",
            {
                "tenant_id": tenant_id,
                "category_id": category_id,
                "name": name,
                "description": description,
                "duration_minutes": duration_minutes,
                "price": price,
                "show_price": show_price,
            },
            output_param="service_id",
        )
        return self.get_by_id(tenant_id, service_id) or {}

    def update(
        self,
        tenant_id: int,
        service_id: int,
        *,
        category_id: int | None = None,
        name: str | None = None,
        description: str | None = None,
        duration_minutes: int | None = None,
        price: float | None = None,
        show_price: bool | None = None,
        is_active: bool | None = None,
    ) -> dict[str, Any] | None:
        """PATCH /services/{id} and the soft DELETE (is_active=False) both go
        through sp_update_service (COALESCE pattern - a NULL/omitted
        parameter means "no change"). That SP has neither a final SELECT nor
        an OUTPUT parameter (docs/sql-signatures.md #6), so this re-reads
        the row afterwards instead of trusting exec_sp's (always empty)
        return value."""
        params: dict[str, Any] = {"service_id": service_id, "tenant_id": tenant_id}
        if category_id is not None:
            params["category_id"] = category_id
        if name is not None:
            params["name"] = name
        if description is not None:
            params["description"] = description
        if duration_minutes is not None:
            params["duration_minutes"] = duration_minutes
        if price is not None:
            params["price"] = price
        if show_price is not None:
            params["show_price"] = show_price
        if is_active is not None:
            params["is_active"] = is_active

        exec_sp(self._conn, "sp_update_service", params)
        return self.get_by_id(tenant_id, service_id)

    def get_by_id(self, tenant_id: int, service_id: int) -> dict[str, Any] | None:
        sql = "SELECT * FROM services WHERE tenant_id = ? AND service_id = ?"
        rows = query_view(self._conn, sql, [tenant_id, service_id])
        return rows[0] if rows else None

    def list_by_tenant(
        self, tenant_id: int, *, page: int, page_size: int, category_id: int | None = None
    ) -> tuple[list[dict[str, Any]], int]:
        """The active-flag column is `is_active`."""
        conditions = ["tenant_id = ?", "is_active = 1"]
        params: list[Any] = [tenant_id]
        if category_id is not None:
            conditions.append("category_id = ?")
            params.append(category_id)
        where = " AND ".join(conditions)

        total_rows = query_view(
            self._conn, f"SELECT COUNT(*) AS total FROM services WHERE {where}", params
        )
        total = int(total_rows[0]["total"]) if total_rows else 0

        sql = (
            f"SELECT * FROM services WHERE {where} ORDER BY name, service_id "
            "OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"
        )
        rows = query_view(self._conn, sql, [*params, (page - 1) * page_size, page_size])
        return rows, total

    def list_public_by_slug(self, slug: str) -> list[dict[str, Any]]:
        """GET /public/{slug}/services. v_public_services exposes the
        tenant slug as `tenant_slug` (docs/sql-signatures.md #2), not
        `slug`. `SELECT *` already matches
        app.mappers.service_mapper.map_service's expected keys 1:1
        (service_id/name/description/duration_minutes/price/
        show_price), so no aliasing is needed here."""
        sql = "SELECT * FROM v_public_services WHERE tenant_slug = ? ORDER BY name"
        return query_view(self._conn, sql, [slug], label="v_public_services")
