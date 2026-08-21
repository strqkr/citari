from __future__ import annotations

from typing import Any

import pyodbc

from app.db import query_view


class SuperadminRepository:
    """superadmins."""

    def __init__(self, conn: pyodbc.Connection) -> None:
        self._conn = conn

    def get_by_email(self, email: str) -> dict[str, Any] | None:
        """The column is `email` (rename-map row 20), not something else.

        `email` doesn't live on `superadmins` directly - it's normalized
        into the 1:N child table `superadmin_emails` (see
        database/scripts/citari.sql's OUTER APPLY pattern, reused here) -
        so the email lookup itself must JOIN against that child table
        instead of filtering `superadmins.email` directly. `sc.email` is
        re-selected AS `email` so the row shape app.mappers.user_mapper.
        map_superadmin_user expects (`row["email"]`) still holds."""
        sql = (
            "SELECT s.*, sc.email AS email FROM superadmins s "
            "JOIN superadmin_emails sc ON sc.superadmin_id = s.superadmin_id "
            "AND sc.email = ?"
        )
        rows = query_view(self._conn, sql, [email], label="superadmins")
        return rows[0] if rows else None

    def get_by_id(self, superadmin_id: int) -> dict[str, Any] | None:
        """`email` doesn't live on `superadmins` - it's resolved from
        `superadmin_emails` (1:N) the same way
        database/scripts/citari.sql resolves `customer_emails`
        for v_booking_details: take the first-registered row as the
        canonical email. Aliased AS `email` so the row shape app.mappers.
        user_mapper.map_superadmin_user expects (`row["email"]`) still
        holds."""
        sql = (
            "SELECT s.*, sco.email AS email "
            "FROM superadmins s "
            "OUTER APPLY ("
            "SELECT TOP 1 sc.email FROM superadmin_emails sc "
            "WHERE sc.superadmin_id = s.superadmin_id "
            "ORDER BY sc.superadmin_email_id"
            ") sco "
            "WHERE s.superadmin_id = ?"
        )
        rows = query_view(self._conn, sql, [superadmin_id], label="superadmins")
        return rows[0] if rows else None
