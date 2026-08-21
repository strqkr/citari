"""Matches apps/frontend/types/availability.ts."""

from __future__ import annotations

from datetime import date, time

from app.schemas.common import CamelModel


class AvailabilityBlockResponse(CamelModel):
    availability_block_id: int
    block_date: date
    start_time: time
    end_time: time
    is_reserved: bool | None = None
    location_id: int | None = None


class AvailabilityBlockCreateRequest(CamelModel):
    location_id: int
    block_date: date
    start_time: time
    end_time: time
