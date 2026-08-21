from __future__ import annotations

from typing import Any

import pyodbc

from app.db import exec_sp_output, query_view


class TenantOwnerRepository:
    """tenant_owners."""

    def __init__(self, conn: pyodbc.Connection) -> None:
        self._conn = conn

    def create_owner(
        self,
        *,
        tenant_id: int,
        first_name: str,
        last_name_1: str,
        last_name_2: str | None,
        email: str,
        password_hash: str,
        phone: str | None,
    ) -> int:
        """sp_create_owner reports the new id via `@owner_id OUTPUT` only (no
        final SELECT - docs/sql-signatures.md #2), so this goes through
        exec_sp_output (plain exec_sp has no way to read an OUTPUT param
        back). Its real parameter names are
        first_name/last_name_1/last_name_2/email/password_hash/phone.
        Returns the new owner_id.
        """
        return exec_sp_output(
            self._conn,
            "sp_create_owner",
            {
                "tenant_id": tenant_id,
                "first_name": first_name,
                "last_name_1": last_name_1,
                "last_name_2": last_name_2,
                "email": email,
                "password_hash": password_hash,
                "phone": phone,
            },
            output_param="owner_id",
        )

    def get_by_email(self, email: str) -> dict[str, Any] | None:
        """`email` doesn't live on `tenant_owners` directly - it's
        normalized into the 1:N child table `owner_emails`
        (see database/scripts/citari.sql's OUTER APPLY pattern, reused
        here) - so the email lookup itself must JOIN against that child
        table instead of filtering
        `tenant_owners.email` directly. `dc.email` is re-selected AS
        `email` so the row shape app.mappers.user_mapper.map_owner_user
        expects (`row["email"]`) still holds. (Owner phone is not needed
        here: app.mappers.user_mapper.map_owner_user never reads
        `row["phone"]`, and app.schemas.auth.UserResponse has no phone
        field.)"""
        sql = (
            "SELECT d.*, dc.email AS email FROM tenant_owners d "
            "JOIN owner_emails dc ON dc.owner_id = d.owner_id "
            "AND dc.email = ?"
        )
        rows = query_view(self._conn, sql, [email], label="tenant_owners")
        return rows[0] if rows else None

    def get_by_id(self, owner_id: int) -> dict[str, Any] | None:
        """`email` doesn't live on `tenant_owners` - it's resolved
        from `owner_emails` (1:N) the same way
        database/scripts/citari.sql resolves `customer_emails` for
        v_booking_details: take the first-registered row as the
        canonical email. Aliased AS `email` so the row shape
        app.mappers.user_mapper.map_owner_user expects (`row["email"]`)
        still holds."""
        sql = (
            "SELECT d.*, dco.email AS email "
            "FROM tenant_owners d "
            "OUTER APPLY ("
            "SELECT TOP 1 dc.email FROM owner_emails dc "
            "WHERE dc.owner_id = d.owner_id "
            "ORDER BY dc.owner_email_id"
            ") dco "
            "WHERE d.owner_id = ?"
        )
        rows = query_view(self._conn, sql, [owner_id], label="tenant_owners")
        return rows[0] if rows else None
