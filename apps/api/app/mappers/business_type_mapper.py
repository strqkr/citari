"""Row from `business_types` -> GET /business-types contract
(app.schemas.business_type.BusinessTypeResponse)."""

from __future__ import annotations

from typing import Any


def map_business_type(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "business_type_id": row["business_type_id"],
        "name": row["name"],
        "description": row.get("description"),
    }
