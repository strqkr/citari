"""Owner-facing report schemas, one per reporting view. No dedicated
frontend/types file yet."""

from __future__ import annotations

from datetime import date, datetime, time

from app.schemas.common import CamelModel


class DashboardResponse(CamelModel):
    """vw_dashboard_dominio."""

    tenant_id: int
    name: str
    total_bookings: int
    pending_bookings: int
    confirmed_bookings: int
    cancelled_bookings: int
    total_customers: int
    total_active_services: int
    total_active_locations: int


class DailyAgendaItemResponse(CamelModel):
    """vw_agenda_diaria."""

    booking_date: date
    start_time: time
    end_time: time
    service_name: str
    customer_name: str
    location_name: str
    status: str


class ServiceDemandResponse(CamelModel):
    """vw_demanda_servicios."""

    service_id: int
    service_name: str
    total_bookings: int
    last_booking_at: datetime | None = None


class AvailabilityStatusResponse(CamelModel):
    """vw_estado_disponibilidad."""

    availability_block_id: int
    location_id: int
    location_name: str
    block_date: date
    start_time: time
    end_time: time
    is_active: bool
    is_reserved: bool
    booking_id: int | None = None
