"""Row from `services` / v_public_services -> Service contract.

Matches apps/frontend/types/service.ts:
    { serviceId, name, description, durationMinutes, price?, showPrice }
"""

from __future__ import annotations

from typing import Any


def map_service(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "service_id": row["service_id"],
        "name": row["name"],
        "description": row.get("description"),
        "duration_minutes": row["duration_minutes"],
        "price": row.get("price"),
        "show_price": bool(row["show_price"]),
    }


def map_service_category(row: dict[str, Any]) -> dict[str, Any]:
    """Row from `service_categories` -> ServiceCategory-shaped dict.

    The PK/active-flag columns are `category_id`/`is_active` (see
    database/scripts/02-create-tables.sql).
    """
    return {
        "category_id": row["category_id"],
        "name": row["name"],
        "description": row.get("description"),
        "is_active": bool(row["is_active"]),
    }
