"""Mapper tests for locations, business hours, reports
(dashboard/agenda/demand/availability-status), audit logs, and the tenant
mapper's conditional `status` field."""

from __future__ import annotations

from datetime import date, datetime, time

from app.mappers.audit_log_mapper import map_audit_log
from app.mappers.hours_mapper import map_business_hour
from app.mappers.location_mapper import map_location
from app.mappers.report_mapper import (
    map_availability_status,
    map_daily_agenda_item,
    map_dashboard,
    map_service_demand,
)
from app.mappers.tenant_mapper import map_tenant


def test_map_location() -> None:
    row = {
        "location_id": 3,
        "tenant_id": 1,
        "name": "Sucursal Centro",
        "province": "San Jose",
        "canton": "Central",
        "district": "Carmen",
        "postal_code": "10101",
        "phone": "2222-0000",
        "is_main": 1,
        "is_active": 1,
    }

    result = map_location(row)

    assert result == {
        "location_id": 3,
        "name": "Sucursal Centro",
        "province": "San Jose",
        "canton": "Central",
        "district": "Carmen",
        "postal_code": "10101",
        "phone": "2222-0000",
        "is_main": True,
        "is_active": True,
    }


def test_map_business_hour_closed_day() -> None:
    row = {
        "business_hour_id": 8,
        "tenant_id": 1,
        "location_id": 3,
        "day_of_week": 7,
        "open_time": None,
        "close_time": None,
        "is_closed": 1,
    }

    result = map_business_hour(row)

    assert result["business_hour_id"] == 8
    assert result["day_of_week"] == 7
    assert result["open_time"] is None
    assert result["close_time"] is None
    assert result["is_closed"] is True


def test_map_dashboard() -> None:
    row = {
        "tenant_id": 1,
        "name": "Barberia El Colocho",
        "total_bookings": 12,
        "pending_bookings": 3,
        "confirmed_bookings": 5,
        "cancelled_bookings": 4,
        "total_customers": 9,
        "total_active_services": 6,
        "total_active_locations": 2,
    }

    result = map_dashboard(row)

    assert result == {
        "tenant_id": 1,
        "name": "Barberia El Colocho",
        "total_bookings": 12,
        "pending_bookings": 3,
        "confirmed_bookings": 5,
        "cancelled_bookings": 4,
        "total_customers": 9,
        "total_active_services": 6,
        "total_active_locations": 2,
    }


def test_map_daily_agenda_item_narrows_datetimes_to_times() -> None:
    row = {
        "tenant_id": 1,
        "booking_date": date(2032, 5, 1),
        "start_time": datetime(2032, 5, 1, 9, 0),
        "end_time": datetime(2032, 5, 1, 9, 30),
        "service_name": "Corte",
        "customer_name": "Ana Rodriguez",
        "location_name": "Centro",
        "status": "pending",
    }

    result = map_daily_agenda_item(row)

    assert result["booking_date"] == date(2032, 5, 1)
    assert result["start_time"] == time(9, 0)
    assert result["end_time"] == time(9, 30)
    assert result["status"] == "pending"


def test_map_service_demand_with_zero_bookings() -> None:
    row = {
        "service_id": 4,
        "tenant_id": 1,
        "service_name": "Manicura",
        "total_bookings": 0,
        "last_booking_at": None,
    }

    result = map_service_demand(row)

    assert result == {
        "service_id": 4,
        "service_name": "Manicura",
        "total_bookings": 0,
        "last_booking_at": None,
    }


def test_map_availability_status() -> None:
    row = {
        "block_id": 77,
        "tenant_id": 1,
        "tenant_slug": "barberia",
        "location_id": 3,
        "location_name": "Centro",
        "block_date": date(2032, 5, 1),
        "start_time": datetime(2032, 5, 1, 9, 0),
        "end_time": datetime(2032, 5, 1, 9, 30),
        "block_is_active": 0,
        "is_reserved": 1,
        "booking_id": 200,
    }

    result = map_availability_status(row)

    assert result == {
        "availability_block_id": 77,
        "location_id": 3,
        "location_name": "Centro",
        "block_date": date(2032, 5, 1),
        "start_time": time(9, 0),
        "end_time": time(9, 30),
        "is_active": False,
        "is_reserved": True,
        "booking_id": 200,
    }


def test_map_audit_log() -> None:
    row = {
        "audit_id": 501,
        "tenant_id": 1,
        "owner_id": None,
        "superadmin_id": None,
        "action": "reserva_creada",
        "entity_name": "reservaciones",
        "entity_id": 200,
        "old_value": None,
        "new_value": None,
        "created_at": datetime(2032, 5, 1, 9, 0),
    }

    result = map_audit_log(row)

    assert result["audit_id"] == 501
    assert result["tenant_id"] == 1
    assert result["action"] == "reserva_creada"
    assert result["entity_name"] == "reservaciones"
    assert result["entity_id"] == 200
    assert result["created_at"] == datetime(2032, 5, 1, 9, 0)


def test_map_tenant_surfaces_status_only_when_present() -> None:
    base_row = {
        "tenant_id": 1,
        "slug": "salon-bella",
        "name": "Salon Bella",
        "description": None,
        "public_message": None,
    }

    without_status = map_tenant(base_row)
    with_status = map_tenant({**base_row, "status_name": "suspended"})

    assert "status" not in without_status
    assert with_status["status"] == "suspended"
