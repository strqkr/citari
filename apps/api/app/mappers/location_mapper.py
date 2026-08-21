"""Row from `locations` (joined to `addresses`, OUTER APPLY'd against
`location_phones`) -> Location contract.

No dedicated frontend/types file yet (see app.schemas.location). There are no
free-text address/phone columns on `locations`. LocationRepository's
SELECT (get_by_id/list_by_tenant) JOINs `addresses` (via address_id) for
province/canton/district/postal_code, and OUTER APPLYs
`location_phones` for phone - see that repository's `_SELECT_SQL`.
"""

from __future__ import annotations

from typing import Any


def map_location(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "location_id": row["location_id"],
        "name": row["name"],
        "province": row["province"],
        "canton": row["canton"],
        "district": row["district"],
        "postal_code": row["postal_code"],
        "phone": row.get("phone"),
        "is_main": bool(row["is_main"]),
        "is_active": bool(row["is_active"]),
    }
