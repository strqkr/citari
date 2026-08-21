from __future__ import annotations

from typing import Any

import pyodbc

from app.db import exec_sp_output, query_view


class CustomerRepository:
    """customers."""

    def __init__(self, conn: pyodbc.Connection) -> None:
        self._conn = conn

    def create(
        self,
        *,
        tenant_id: int,
        first_name: str,
        last_name_1: str,
        last_name_2: str | None,
        email: str,
        phone: str,
        notes: str | None,
    ) -> dict[str, Any]:
        """sp_create_customer's email parameter is `@email`, and the SP
        reports the (possibly reused - see database/scripts/04-procedures.sql)
        id via `@customer_id OUTPUT` only, no final SELECT - so this goes
        through exec_sp_output and then re-reads the full row."""
        customer_id = exec_sp_output(
            self._conn,
            "sp_create_customer",
            {
                "tenant_id": tenant_id,
                "first_name": first_name,
                "last_name_1": last_name_1,
                "last_name_2": last_name_2,
                "email": email,
                "phone": phone,
                "notes": notes,
            },
            output_param="customer_id",
        )
        return self.get_by_id(tenant_id, customer_id) or {}

    def get_by_id(self, tenant_id: int, customer_id: int) -> dict[str, Any] | None:
        """email/phone don't live on `customers` (moved to
        customer_emails/customer_phones, 1:N) - each is resolved
        via an OUTER APPLY that takes the first-registered child row (ORDER
        BY the child table's own identity column ascending) as canonical,
        aliased back onto the row AS email/AS phone so
        app.mappers.customer_mapper.map_customer's `row["email"]`/
        `row["phone"]` keep working unchanged. Same pattern as
        database/scripts/06-views.sql's v_booking_details."""
        sql = (
            "SELECT c.*, cco.email AS email, cte.phone AS phone "
            "FROM customers c "
            "OUTER APPLY ("
            "SELECT TOP 1 cc.email FROM customer_emails cc "
            "WHERE cc.customer_id = c.customer_id ORDER BY cc.customer_email_id"
            ") cco "
            "OUTER APPLY ("
            "SELECT TOP 1 ct.phone FROM customer_phones ct "
            "WHERE ct.customer_id = c.customer_id ORDER BY ct.customer_phone_id"
            ") cte "
            "WHERE c.tenant_id = ? AND c.customer_id = ?"
        )
        rows = query_view(self._conn, sql, [tenant_id, customer_id])
        return rows[0] if rows else None

    def list_by_tenant(
        self, tenant_id: int, *, page: int, page_size: int, q: str | None = None
    ) -> tuple[list[dict[str, Any]], int]:
        """GET /customers: paginated, with an optional `?q` search over
        first_name/email. email doesn't live on `customers` (moved to
        customer_emails, 1:N), so the `?q` match against it is an EXISTS
        subquery instead of a flat LIKE column - matches against any of the
        customer's registered emails, not just the canonical
        (first-registered) one."""
        conditions = ["c.tenant_id = ?"]
        params: list[Any] = [tenant_id]
        if q:
            conditions.append(
                "(c.first_name LIKE ? OR EXISTS ("
                "SELECT 1 FROM customer_emails cc "
                "WHERE cc.customer_id = c.customer_id AND cc.email LIKE ?"
                "))"
            )
            like = f"%{q}%"
            params.extend([like, like])
        where = " AND ".join(conditions)

        total_rows = query_view(
            self._conn, f"SELECT COUNT(*) AS total FROM customers c WHERE {where}", params
        )
        total = int(total_rows[0]["total"]) if total_rows else 0

        sql = (
            "SELECT c.*, cco.email AS email, cte.phone AS phone "
            "FROM customers c "
            "OUTER APPLY ("
            "SELECT TOP 1 cc.email FROM customer_emails cc "
            "WHERE cc.customer_id = c.customer_id ORDER BY cc.customer_email_id"
            ") cco "
            "OUTER APPLY ("
            "SELECT TOP 1 ct.phone FROM customer_phones ct "
            "WHERE ct.customer_id = c.customer_id ORDER BY ct.customer_phone_id"
            ") cte "
            f"WHERE {where} ORDER BY c.first_name, c.customer_id "
            "OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"
        )
        rows = query_view(self._conn, sql, [*params, (page - 1) * page_size, page_size])
        return rows, total

    def update(
        self,
        tenant_id: int,
        customer_id: int,
        *,
        first_name: str | None = None,
        last_name_1: str | None = None,
        last_name_2: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any] | None:
        """PATCH /customers/{id}. No SP exists for this - direct
        parameterized UPDATE, same COALESCE-by-omission pattern as
        app.repositories.tenant_repository.update_tenant. `last_name_1`
        being given is the signal to also (over)write `last_name_2`, even to
        NULL, since both surname columns always change together (see
        app.services.customer_service.CustomerService.update).

        email/phone don't live on `customers` (moved to
        customer_emails/customer_phones, 1:N), so they aren't part of
        this UPDATE - each is upserted into its own child table
        instead (see _upsert_email/_upsert_phone below). `email`/`phone`
        being None keeps the existing convention used for every other field
        here: None means "not supplied, leave unchanged", not "clear it" -
        so a None value leaves whatever child row already exists untouched
        rather than deleting/blanking it."""
        columns: dict[str, Any] = {}
        if first_name is not None:
            columns["first_name"] = first_name
        if last_name_1 is not None:
            columns["last_name_1"] = last_name_1
            columns["last_name_2"] = last_name_2
        if notes is not None:
            columns["notes"] = notes

        if columns:
            set_clause = ", ".join(f"{column} = ?" for column in columns)
            sql = (
                f"UPDATE customers SET {set_clause}, updated_at = SYSUTCDATETIME() "
                "WHERE tenant_id = ? AND customer_id = ?"
            )
            cursor = self._conn.cursor()
            try:
                cursor.execute(sql, [*columns.values(), tenant_id, customer_id])
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise
            finally:
                cursor.close()

        if email is not None:
            self._upsert_email(customer_id, email)
        if phone is not None:
            self._upsert_phone(customer_id, phone)

        return self.get_by_id(tenant_id, customer_id)

    def _upsert_email(self, customer_id: int, email: str) -> None:
        """Updates the canonical (first-registered, lowest
        customer_email_id) row in customer_emails if one exists, otherwise
        inserts a new one - mirrors the two-step INSERT pattern
        sp_create_customer uses at creation time (04-procedures.sql)."""
        cursor = self._conn.cursor()
        try:
            existing = cursor.execute(
                "SELECT TOP 1 customer_email_id FROM customer_emails "
                "WHERE customer_id = ? ORDER BY customer_email_id",
                [customer_id],
            ).fetchone()
            if existing:
                cursor.execute(
                    "UPDATE customer_emails SET email = ? WHERE customer_email_id = ?",
                    [email, existing[0]],
                )
            else:
                cursor.execute(
                    "INSERT INTO customer_emails (customer_id, email) VALUES (?, ?)",
                    [customer_id, email],
                )
            self._conn.commit()
        except Exception:
            self._conn.rollback()
            raise
        finally:
            cursor.close()

    def _upsert_phone(self, customer_id: int, phone: str) -> None:
        """Same upsert-by-oldest-row logic as _upsert_email, against
        customer_phones."""
        cursor = self._conn.cursor()
        try:
            existing = cursor.execute(
                "SELECT TOP 1 customer_phone_id FROM customer_phones "
                "WHERE customer_id = ? ORDER BY customer_phone_id",
                [customer_id],
            ).fetchone()
            if existing:
                cursor.execute(
                    "UPDATE customer_phones SET phone = ? WHERE customer_phone_id = ?",
                    [phone, existing[0]],
                )
            else:
                cursor.execute(
                    "INSERT INTO customer_phones (customer_id, phone) VALUES (?, ?)",
                    [customer_id, phone],
                )
            self._conn.commit()
        except Exception:
            self._conn.rollback()
            raise
        finally:
            cursor.close()

    def booking_history(self, tenant_id: int, customer_id: int) -> list[dict[str, Any]]:
        """GET /customers/{id}/bookings, per v_customer_booking_history.
        That view alone lacks a tracking
        code, so this joins tracking_codes by booking_id (every booking
        always has exactly one - inserted by tr_bookings_generate_tracking)
        and aliases everything into the same intermediate row shape
        app.mappers.booking_mapper.map_booking_detail expects, so the
        response reuses that one mapper/BookingResponse contract."""
        sql = (
            "SELECT "
            "h.booking_id      AS booking_id, "
            "h.customer_name  AS customer_name, "
            "h.service_name AS service_name, "
            "CAST(h.start_time AS DATE) AS booking_date, "
            "CAST(h.start_time AS TIME) AS start_time, "
            "h.status          AS status, "
            "cr.tracking_code AS tracking_code "
            "FROM v_customer_booking_history h "
            "JOIN tracking_codes cr ON cr.booking_id = h.booking_id "
            "WHERE h.tenant_id = ? AND h.customer_id = ? "
            "ORDER BY h.start_time DESC"
        )
        return query_view(
            self._conn,
            sql,
            [tenant_id, customer_id],
            label="v_customer_booking_history",
        )
