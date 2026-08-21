from __future__ import annotations

from typing import Any

import pyodbc

from app.db import query_view


class LocationRepository:
    """locations. No stored procedure exists for this table - every write
    here is a direct parameterized statement."""

    def __init__(self, conn: pyodbc.Connection) -> None:
        self._conn = conn

    # addresses is a reutilizable catalog (province/canton/district/
    # postal_code) but locations treats it as append-only: every
    # create/address-update INSERTs a fresh addresses row and points
    # locations.address_id at it. No matching/dedup.
    _SELECT_SQL = (
        "SELECT l.*, a.province, a.canton, a.district, a.postal_code, lp.phone "
        "FROM locations l "
        "JOIN addresses a ON a.address_id = l.address_id "
        "OUTER APPLY ("
        "    SELECT TOP 1 p.phone "
        "    FROM location_phones p "
        "    WHERE p.location_id = l.location_id "
        "    ORDER BY p.location_phone_id"
        ") lp "
    )

    def create(
        self,
        *,
        tenant_id: int,
        name: str,
        province: str,
        canton: str,
        district: str,
        postal_code: str,
        phone: str | None,
        is_main: bool,
    ) -> dict[str, Any]:
        """The is-main-location column is `is_main` (see database/scripts/02-create-tables.sql).

        `locations` has no address/phone columns directly - the
        territorial division lives in the `addresses` catalog
        (address_id FK) and the phone in the 1:N `location_phones`
        table. Mirrors the insert-parent/get-id/insert-children pattern used
        by sp_create_owner/sp_create_customer in database/scripts/04-procedures.sql,
        translated to pyodbc since no stored procedure exists for this table.
        """
        try:
            address_rows = query_view(
                self._conn,
                "INSERT INTO addresses (province, canton, district, postal_code) "
                "OUTPUT INSERTED.address_id VALUES (?, ?, ?, ?)",
                [province, canton, district, postal_code],
            )
            address_id = address_rows[0]["address_id"]

            location_rows = query_view(
                self._conn,
                "INSERT INTO locations (tenant_id, address_id, name, is_main) "
                "OUTPUT INSERTED.* VALUES (?, ?, ?, ?)",
                [tenant_id, address_id, name, is_main],
            )
            location = location_rows[0] if location_rows else {}
            location_id = location.get("location_id")

            if phone and location_id is not None:
                query_view(
                    self._conn,
                    "INSERT INTO location_phones (location_id, phone) VALUES (?, ?)",
                    [location_id, phone],
                )

            self._conn.commit()
        except Exception:
            self._conn.rollback()
            raise

        if location_id is None:
            return {}
        return self.get_by_id(tenant_id, location_id) or {}

    def get_by_id(self, tenant_id: int, location_id: int) -> dict[str, Any] | None:
        sql = self._SELECT_SQL + "WHERE l.tenant_id = ? AND l.location_id = ?"
        rows = query_view(self._conn, sql, [tenant_id, location_id])
        return rows[0] if rows else None

    def list_by_tenant(
        self, tenant_id: int, *, page: int, page_size: int
    ) -> tuple[list[dict[str, Any]], int]:
        """The active-flag column is `is_active`."""
        total_rows = query_view(
            self._conn,
            "SELECT COUNT(*) AS total FROM locations WHERE tenant_id = ? AND is_active = 1",
            [tenant_id],
        )
        total = int(total_rows[0]["total"]) if total_rows else 0
        sql = (
            self._SELECT_SQL + "WHERE l.tenant_id = ? AND l.is_active = 1 "
            "ORDER BY l.name, l.location_id OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"
        )
        rows = query_view(self._conn, sql, [tenant_id, (page - 1) * page_size, page_size])
        return rows, total

    def update(
        self,
        tenant_id: int,
        location_id: int,
        *,
        name: str | None = None,
        province: str | None = None,
        canton: str | None = None,
        district: str | None = None,
        postal_code: str | None = None,
        phone: str | None = None,
        is_main: bool | None = None,
        is_active: bool | None = None,
    ) -> dict[str, Any] | None:
        """PATCH /locations/{id} and the soft DELETE (is_active=False) both
        go through this dynamic UPDATE - same COALESCE-by-omission pattern
        as app.repositories.tenant_repository.update_tenant.

        Address fields (province/canton/district/postal_code) don't live
        on `locations` directly. `addresses` is append-only (no dedup),
        so any address-field change INSERTs a brand-new `addresses` row
        (merged with the current
        values for the fields left unset) and repoints
        `locations.address_id` at it. Phone is upserted into
        `location_phones`: the oldest existing row is updated in
        place, else one is inserted.
        """
        columns: dict[str, Any] = {}
        if name is not None:
            columns["name"] = name
        if is_main is not None:
            columns["is_main"] = is_main
        if is_active is not None:
            columns["is_active"] = is_active

        address_changed = any(
            value is not None for value in (province, canton, district, postal_code)
        )

        try:
            if address_changed:
                current = self.get_by_id(tenant_id, location_id)
                if current is None:
                    return None
                address_rows = query_view(
                    self._conn,
                    "INSERT INTO addresses (province, canton, district, postal_code) "
                    "OUTPUT INSERTED.address_id VALUES (?, ?, ?, ?)",
                    [
                        province if province is not None else current["province"],
                        canton if canton is not None else current["canton"],
                        district if district is not None else current["district"],
                        postal_code if postal_code is not None else current["postal_code"],
                    ],
                )
                columns["address_id"] = address_rows[0]["address_id"]

            if columns:
                set_clause = ", ".join(f"{column} = ?" for column in columns)
                sql = (
                    f"UPDATE locations SET {set_clause}, updated_at = SYSUTCDATETIME() "
                    "WHERE tenant_id = ? AND location_id = ?"
                )
                cursor = self._conn.cursor()
                cursor.execute(sql, [*columns.values(), tenant_id, location_id])
                cursor.close()

            if phone is not None:
                self._upsert_phone(location_id, phone)

            self._conn.commit()
        except Exception:
            self._conn.rollback()
            raise

        return self.get_by_id(tenant_id, location_id)

    def _upsert_phone(self, location_id: int, phone: str) -> None:
        """Same 1:N upsert shape other repositories use for their own
        *_phones child tables: update the oldest existing row if one
        exists, else insert a new one."""
        existing = query_view(
            self._conn,
            "SELECT TOP 1 location_phone_id FROM location_phones "
            "WHERE location_id = ? ORDER BY location_phone_id",
            [location_id],
        )
        if existing:
            query_view(
                self._conn,
                "UPDATE location_phones SET phone = ? WHERE location_phone_id = ?",
                [phone, existing[0]["location_phone_id"]],
            )
        else:
            query_view(
                self._conn,
                "INSERT INTO location_phones (location_id, phone) VALUES (?, ?)",
                [location_id, phone],
            )
