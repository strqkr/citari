"""Row from `availability_blocks` / v_availability_status ->
AvailabilityBlock contract.

Matches apps/frontend/types/availability.ts:
    { availabilityBlockId, blockDate, startTime, endTime, isReserved? }
"""

from __future__ import annotations

from typing import Any


def map_availability_block(row: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {
        "availability_block_id": row["availability_block_id"],
        "block_date": row["block_date"],
        "start_time": row["start_time"],
        "end_time": row["end_time"],
    }
    if "is_reserved" in row:
        result["is_reserved"] = bool(row["is_reserved"])
    if "location_id" in row:
        result["location_id"] = row["location_id"]
    return result
