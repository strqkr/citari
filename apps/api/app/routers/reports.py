"""Owner-facing reports (endpoints.reports.*), each backed by one SQL view."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import CurrentOwner, DbConnection
from app.errors import NotFoundError
from app.mappers.booking_mapper import map_booking_detail
from app.mappers.report_mapper import (
    map_availability_status,
    map_daily_agenda_item,
    map_dashboard,
    map_service_demand,
)
from app.repositories.report_repository import ReportRepository
from app.schemas.booking import BookingDetailResponse
from app.schemas.common import PageResponse
from app.schemas.report import (
    AvailabilityStatusResponse,
    DailyAgendaItemResponse,
    DashboardResponse,
    ServiceDemandResponse,
)
from app.services.report_service import ReportService

router = APIRouter(prefix="/reports", tags=["reports"])


def _service(db: DbConnection) -> ReportService:
    return ReportService(ReportRepository(db))


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(owner: CurrentOwner, db: DbConnection) -> DashboardResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    row = _service(db).dashboard(tenant_id)
    if row is None:
        raise NotFoundError(f"Tenant {tenant_id} no longer exists.")
    return DashboardResponse(**map_dashboard(row))


@router.get("/daily-agenda", response_model=list[DailyAgendaItemResponse])
def daily_agenda(
    owner: CurrentOwner,
    db: DbConnection,
    agenda_date: Annotated[date, Query(alias="date")],
) -> list[DailyAgendaItemResponse]:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    rows = _service(db).daily_agenda(tenant_id, agenda_date)
    return [DailyAgendaItemResponse(**map_daily_agenda_item(row)) for row in rows]


@router.get("/bookings-detail", response_model=PageResponse[BookingDetailResponse])
def bookings_detail(
    owner: CurrentOwner,
    db: DbConnection,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> PageResponse[BookingDetailResponse]:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    items, total = _service(db).bookings_detail(tenant_id, page=page, page_size=page_size)
    return PageResponse(
        items=[BookingDetailResponse(**map_booking_detail(row)) for row in items],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/services-demand", response_model=list[ServiceDemandResponse])
def services_demand(owner: CurrentOwner, db: DbConnection) -> list[ServiceDemandResponse]:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    rows = _service(db).services_demand(tenant_id)
    return [ServiceDemandResponse(**map_service_demand(row)) for row in rows]


@router.get("/availability-status", response_model=list[AvailabilityStatusResponse])
def availability_status(
    owner: CurrentOwner,
    db: DbConnection,
    status_date: Annotated[date, Query(alias="date")],
) -> list[AvailabilityStatusResponse]:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    rows = _service(db).availability_status(tenant_id, status_date)
    return [AvailabilityStatusResponse(**map_availability_status(row)) for row in rows]
