"""Owner-managed weekly business hours (endpoints.businessHours)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import CurrentOwner, DbConnection
from app.mappers.hours_mapper import map_business_hour
from app.repositories.business_hours_repository import BusinessHourInput, BusinessHoursRepository
from app.repositories.location_repository import LocationRepository
from app.schemas.hours import BusinessHourReplaceRequest, BusinessHourResponse
from app.services.business_hours_service import BusinessHoursService

router = APIRouter(prefix="/business-hours", tags=["business-hours"])


def _service(db: DbConnection) -> BusinessHoursService:
    return BusinessHoursService(BusinessHoursRepository(db), LocationRepository(db))


@router.get("", response_model=list[BusinessHourResponse])
def list_business_hours(
    owner: CurrentOwner,
    db: DbConnection,
    location_id: Annotated[int | None, Query(alias="locationId")] = None,
) -> list[BusinessHourResponse]:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    rows = _service(db).list_hours(tenant_id, location_id=location_id)
    return [BusinessHourResponse(**map_business_hour(row)) for row in rows]


@router.put("", response_model=list[BusinessHourResponse])
def replace_business_hours(
    payload: BusinessHourReplaceRequest, owner: CurrentOwner, db: DbConnection
) -> list[BusinessHourResponse]:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    rows = _service(db).replace_week(
        tenant_id,
        location_id=payload.location_id,
        hours=[
            BusinessHourInput(
                day_of_week=item.day_of_week,
                open_time=item.open_time,
                close_time=item.close_time,
                is_closed=item.is_closed,
            )
            for item in payload.hours
        ],
    )
    return [BusinessHourResponse(**map_business_hour(row)) for row in rows]
