from __future__ import annotations

import logging
import time
from typing import Any

import pyodbc

from app.db import exec_sp, exec_sp_output, query_view

logger = logging.getLogger(__name__)


class TenantRepository:
    """tenants."""

    def __init__(self, conn: pyodbc.Connection) -> None:
        self._conn = conn

    def create_tenant(
        self,
        *,
        business_type_id: int,
        name: str,
        slug: str,
        email: str,
        phone: str | None,
        description: str | None,
        logo_url: str | None,
        public_message: str | None,
    ) -> int:
        """sp_create_tenant reports the new id via `@tenant_id OUTPUT` only
        (no final SELECT - docs/sql-signatures.md #1), so this goes through
        exec_sp_output (plain exec_sp cannot read an OUTPUT param back).
        Returns the new tenant_id; callers needing the full row should
        follow up with get_by_id (the SP always creates it in the
        'pending' state).
        """
        return exec_sp_output(
            self._conn,
            "sp_create_tenant",
            {
                "business_type_id": business_type_id,
                "name": name,
                "slug": slug,
                "email": email,
                "phone": phone,
                "description": description,
                "logo_url": logo_url,
                "public_message": public_message,
            },
            output_param="tenant_id",
        )

    def get_by_id(self, tenant_id: int) -> dict[str, Any] | None:
        """Joins tenant_statuses to also surface `status_name` (used
        by GET /admin/tenants/{id} and the admin listing - see
        app.mappers.tenant_mapper.map_tenant's conditional `status` field).
        Existing callers (GET /tenant/current, /auth) simply ignore the extra
        column, same conditional-field pattern already used for
        email/phone/logo_url.

        email/phone don't live on `tenants` (moved to
        tenant_emails/tenant_phones, 1:N) - each is resolved via an
        OUTER APPLY that takes the first-registered child row (ORDER BY the
        child table's own identity column ascending) as canonical, aliased
        back onto the row AS email/AS phone, same pattern as
        database/scripts/citari.sql."""
        sql = (
            "SELECT d.*, ed.name AS status_name, "
            "dco.email AS email, dte.phone AS phone "
            "FROM tenants d "
            "JOIN tenant_statuses ed ON ed.tenant_status_id = d.tenant_status_id "
            "OUTER APPLY ("
            "SELECT TOP 1 dc.email FROM tenant_emails dc "
            "WHERE dc.tenant_id = d.tenant_id ORDER BY dc.tenant_email_id"
            ") dco "
            "OUTER APPLY ("
            "SELECT TOP 1 dt.phone FROM tenant_phones dt "
            "WHERE dt.tenant_id = d.tenant_id ORDER BY dt.tenant_phone_id"
            ") dte "
            "WHERE d.tenant_id = ?"
        )
        rows = query_view(self._conn, sql, [tenant_id], label="tenants+tenant_statuses")
        return rows[0] if rows else None

    def get_by_slug(self, slug: str) -> dict[str, Any] | None:
        """email/phone resolved the same OUTER APPLY way as get_by_id -
        see that method's docstring."""
        sql = (
            "SELECT d.*, dco.email AS email, dte.phone AS phone "
            "FROM tenants d "
            "OUTER APPLY ("
            "SELECT TOP 1 dc.email FROM tenant_emails dc "
            "WHERE dc.tenant_id = d.tenant_id ORDER BY dc.tenant_email_id"
            ") dco "
            "OUTER APPLY ("
            "SELECT TOP 1 dt.phone FROM tenant_phones dt "
            "WHERE dt.tenant_id = d.tenant_id ORDER BY dt.tenant_phone_id"
            ") dte "
            "WHERE d.slug = ?"
        )
        rows = query_view(self._conn, sql, [slug], label="tenants")
        return rows[0] if rows else None

    def get_active_by_slug(self, slug: str) -> dict[str, Any] | None:
        """GET /public/{slug}: only returns a row when the tenant
        exists AND is active - `dbo.fn_is_tenant_active` checks both
        `tenants.is_active = 1` and `tenant_statuses.name = 'active'` (see
        docs/sql-signatures.md #3). Missing/inactive -> None -> 404 upstream.
        Column list matches app.mappers.tenant_mapper.map_tenant 1:1 (no
        aliasing needed - tenants' real column names already are
        tenant_id/slug/name/description/public_message)."""
        sql = (
            "SELECT tenant_id, slug, name, description, public_message "
            "FROM tenants d "
            "WHERE d.slug = ? AND dbo.fn_is_tenant_active(d.tenant_id) = 1"
        )
        rows = query_view(self._conn, sql, [slug], label="tenants(fn_is_tenant_active)")
        return rows[0] if rows else None

    def get_status(self, tenant_id: int) -> dict[str, Any] | None:
        """POST /auth/login's owner-tenant-active check. Joins
        tenant_statuses purely to surface a human-readable status name for
        a clear 403 detail; `is_active_status` reuses `dbo.fn_is_tenant_active`
        (docs/sql-signatures.md #3) as the single source of truth for the
        actual pass/fail so the rule never drifts from the SQL definition.
        Returns None only if the tenant_id itself doesn't exist (shouldn't
        normally happen - it always comes from a JWT's tenantId claim)."""
        sql = (
            "SELECT d.tenant_id, ed.name AS status_name, "
            "dbo.fn_is_tenant_active(d.tenant_id) AS is_active_status "
            "FROM tenants d "
            "JOIN tenant_statuses ed ON ed.tenant_status_id = d.tenant_status_id "
            "WHERE d.tenant_id = ?"
        )
        rows = query_view(self._conn, sql, [tenant_id], label="tenants+tenant_statuses")
        return rows[0] if rows else None

    def list_tenants(self, *, page: int, page_size: int) -> tuple[list[dict[str, Any]], int]:
        """GET /admin/tenants: includes `status_name` per row (same
        join as get_by_id) and a total count for the pagination envelope.
        email/phone resolved the same OUTER APPLY way as get_by_id - see
        that method's docstring."""
        total_rows = query_view(
            self._conn, "SELECT COUNT(*) AS total FROM tenants", [], label="tenants"
        )
        total = int(total_rows[0]["total"]) if total_rows else 0
        sql = (
            "SELECT d.*, ed.name AS status_name, "
            "dco.email AS email, dte.phone AS phone "
            "FROM tenants d "
            "JOIN tenant_statuses ed ON ed.tenant_status_id = d.tenant_status_id "
            "OUTER APPLY ("
            "SELECT TOP 1 dc.email FROM tenant_emails dc "
            "WHERE dc.tenant_id = d.tenant_id ORDER BY dc.tenant_email_id"
            ") dco "
            "OUTER APPLY ("
            "SELECT TOP 1 dt.phone FROM tenant_phones dt "
            "WHERE dt.tenant_id = d.tenant_id ORDER BY dt.tenant_phone_id"
            ") dte "
            "ORDER BY d.tenant_id OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"
        )
        rows = query_view(
            self._conn,
            sql,
            [(page - 1) * page_size, page_size],
            label="tenants+tenant_statuses",
        )
        return rows, total

    def activate(self, tenant_id: int, superadmin_id: int) -> dict[str, Any] | None:
        """sp_activate_tenant requires `@superadmin_id` and reports nothing
        back (pure UPDATE, no SELECT/OUTPUT), so this re-reads the tenant
        afterwards instead of trusting exec_sp's (always empty) return
        value."""
        exec_sp(
            self._conn,
            "sp_activate_tenant",
            {"tenant_id": tenant_id, "superadmin_id": superadmin_id},
        )
        return self.get_by_id(tenant_id)

    def suspend(self, tenant_id: int, superadmin_id: int) -> dict[str, Any] | None:
        """Same as activate() - see its docstring."""
        exec_sp(
            self._conn,
            "sp_suspend_tenant",
            {"tenant_id": tenant_id, "superadmin_id": superadmin_id},
        )
        return self.get_by_id(tenant_id)

    def update_tenant(
        self,
        tenant_id: int,
        *,
        name: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        description: str | None = None,
        logo_url: str | None = None,
        public_message: str | None = None,
    ) -> dict[str, Any] | None:
        """PATCH /tenant/current. docs/sql-signatures.md lists only
        sp_create_tenant / sp_activate_tenant / sp_suspend_tenant for
        `tenants` - there is no SP for a partial field update - so this
        issues a direct parameterized UPDATE, touching only the columns
        actually supplied (None means "leave unchanged", the same
        COALESCE-style contract sp_update_service uses). Column names
        never come from user input, only fixed literals from this map, so
        this stays injection-safe despite being built dynamically.
        tr_tenants_updated_at keeps `updated_at` current on its
        own (docs/sql-signatures.md #4).

        email/phone don't live on `tenants` (moved to
        tenant_emails/tenant_phones, 1:N), so they aren't part of
        this UPDATE - each is upserted into its own child table
        instead (see _upsert_email/_upsert_phone below), same
        None-means-"leave unchanged" contract as every other field here.
        """
        columns: dict[str, Any] = {}
        if name is not None:
            columns["name"] = name
        if description is not None:
            columns["description"] = description
        if logo_url is not None:
            columns["logo_url"] = logo_url
        if public_message is not None:
            columns["public_message"] = public_message

        if columns:
            set_clause = ", ".join(f"{column} = ?" for column in columns)
            sql = f"UPDATE tenants SET {set_clause} WHERE tenant_id = ?"
            cursor = self._conn.cursor()
            started = time.perf_counter()
            try:
                cursor.execute(sql, [*columns.values(), tenant_id])
                self._conn.commit()
                _log_write("UPDATE tenants", started, status="ok")
            except Exception:
                self._conn.rollback()
                _log_write("UPDATE tenants", started, status="error")
                raise
            finally:
                cursor.close()

        if email is not None:
            self._upsert_email(tenant_id, email)
        if phone is not None:
            self._upsert_phone(tenant_id, phone)

        return self.get_by_id(tenant_id)

    def _upsert_email(self, tenant_id: int, email: str) -> None:
        """Updates the canonical (first-registered, lowest
        tenant_email_id) row in tenant_emails if one exists, otherwise
        inserts a new one - mirrors the two-step INSERT pattern
        sp_create_tenant uses at creation time (database/scripts/citari.sql)."""
        cursor = self._conn.cursor()
        started = time.perf_counter()
        try:
            existing = cursor.execute(
                "SELECT TOP 1 tenant_email_id FROM tenant_emails "
                "WHERE tenant_id = ? ORDER BY tenant_email_id",
                [tenant_id],
            ).fetchone()
            if existing:
                cursor.execute(
                    "UPDATE tenant_emails SET email = ? WHERE tenant_email_id = ?",
                    [email, existing[0]],
                )
            else:
                cursor.execute(
                    "INSERT INTO tenant_emails (tenant_id, email) VALUES (?, ?)",
                    [tenant_id, email],
                )
            self._conn.commit()
            _log_write("UPSERT tenant_emails", started, status="ok")
        except Exception:
            self._conn.rollback()
            _log_write("UPSERT tenant_emails", started, status="error")
            raise
        finally:
            cursor.close()

    def _upsert_phone(self, tenant_id: int, phone: str) -> None:
        """Same upsert-by-oldest-row logic as _upsert_email, against
        tenant_phones."""
        cursor = self._conn.cursor()
        started = time.perf_counter()
        try:
            existing = cursor.execute(
                "SELECT TOP 1 tenant_phone_id FROM tenant_phones "
                "WHERE tenant_id = ? ORDER BY tenant_phone_id",
                [tenant_id],
            ).fetchone()
            if existing:
                cursor.execute(
                    "UPDATE tenant_phones SET phone = ? WHERE tenant_phone_id = ?",
                    [phone, existing[0]],
                )
            else:
                cursor.execute(
                    "INSERT INTO tenant_phones (tenant_id, phone) VALUES (?, ?)",
                    [tenant_id, phone],
                )
            self._conn.commit()
            _log_write("UPSERT tenant_phones", started, status="ok")
        except Exception:
            self._conn.rollback()
            _log_write("UPSERT tenant_phones", started, status="error")
            raise
        finally:
            cursor.close()


def _log_write(label: str, started: float, *, status: str) -> None:
    """Mirrors app.db._log_call's "sql call" log line for the one write this
    repository issues outside of exec_sp/exec_sp_output (there is no SP for
    it - see update_tenant)."""
    duration_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "sql call",
        extra={"sp": label, "duration_ms": duration_ms, "status": status},
    )
