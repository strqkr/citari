"""Row from `business_hours` -> BusinessHour contract."""

from __future__ import annotations

from typing import Any


def map_business_hour(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "business_hour_id": row["business_hour_id"],
        "location_id": row["location_id"],
        "day_of_week": row["day_of_week"],
        "open_time": row.get("open_time"),
        "close_time": row.get("close_time"),
        "is_closed": bool(row["is_closed"]),
    }
