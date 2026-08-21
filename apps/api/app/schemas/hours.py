"""Business-hours schemas. No dedicated frontend/types file yet."""

from __future__ import annotations

from datetime import time

from app.schemas.common import CamelModel


class BusinessHourResponse(CamelModel):
    business_hour_id: int
    location_id: int
    day_of_week: int
    open_time: time | None = None
    close_time: time | None = None
    is_closed: bool = False


class BusinessHourItem(CamelModel):
    """One day's row within a PUT /business-hours full-week replacement."""

    day_of_week: int
    open_time: time | None = None
    close_time: time | None = None
    is_closed: bool = False


class BusinessHourReplaceRequest(CamelModel):
    """PUT /business-hours body: replaces the entire weekly set for one
    location (see app.repositories.business_hours_repository.replace_week)."""

    location_id: int
    hours: list[BusinessHourItem]
