"""Row from `customers` -> Customer contract.

Matches apps/frontend/types/customer.ts:
    { customerId, firstName, lastName, email, phone }

Costa Rican naming convention (two surnames): first_name + last_name_1
(+ last_name_2 optional). Contract rule:
    firstName = first_name
    lastName  = last_name_1                        if last_name_2 is NULL/empty
              = f"{last_name_1} {last_name_2}"      otherwise

The `customers` email column is `email` (customer_emails, 1:N - see
database/scripts/02-create-tables.sql).
"""

from __future__ import annotations

from typing import Any


def _combine_last_name(last_name_1: str, last_name_2: str | None) -> str:
    if last_name_2:
        return f"{last_name_1} {last_name_2}"
    return last_name_1


def map_customer(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "customer_id": row["customer_id"],
        "first_name": row["first_name"],
        "last_name": _combine_last_name(row["last_name_1"], row.get("last_name_2")),
        "email": row["email"],
        "phone": row["phone"],
        "notes": row.get("notes"),
    }
