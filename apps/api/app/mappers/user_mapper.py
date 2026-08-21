"""Row from `tenant_owners` / `superadmins` -> the `user` object
embedded in every /auth/* response (app.schemas.auth.UserResponse).

Costa Rican naming convention (two surnames): first_name + last_name_1 (+
last_name_2 optional) - same combining rule as app.mappers.customer_mapper:
    firstName = first_name
    lastName  = last_name_1                      if last_name_2 is NULL/empty
              = f"{last_name_1} {last_name_2}"    otherwise

Kept as two small, independent functions (rather than reusing
customer_mapper's helper) so this module has no coupling to the customer
domain - consistent with how booking_mapper/service_mapper each stay
self-contained in this codebase.
"""

from __future__ import annotations

from typing import Any


def _combine_last_name(last_name_1: str, last_name_2: str | None) -> str:
    if last_name_2:
        return f"{last_name_1} {last_name_2}"
    return last_name_1


def map_owner_user(row: dict[str, Any]) -> dict[str, Any]:
    """row: a tenant_owners record (must include owner_id/tenant_id)."""
    return {
        "id": row["owner_id"],
        "first_name": row["first_name"],
        "last_name": _combine_last_name(row["last_name_1"], row.get("last_name_2")),
        "email": row["email"],
        "role": "owner",
        "tenant_id": row["tenant_id"],
    }


def map_superadmin_user(row: dict[str, Any]) -> dict[str, Any]:
    """row: a superadmins record (must include superadmin_id)."""
    return {
        "id": row["superadmin_id"],
        "first_name": row["first_name"],
        "last_name": _combine_last_name(row["last_name_1"], row.get("last_name_2")),
        "email": row["email"],
        "role": "superadmin",
        "tenant_id": None,
    }
