"""Row from each reporting view -> its report schema contract.
See docs/sql-signatures.md #2 for each view's exact column list."""

from __future__ import annotations

from typing import Any


def map_dashboard(row: dict[str, Any]) -> dict[str, Any]:
    """Row from v_tenant_dashboard."""
    return {
        "tenant_id": row["tenant_id"],
        "name": row["name"],
        "total_bookings": row["total_bookings"],
        "pending_bookings": row["pending_bookings"],
        "confirmed_bookings": row["confirmed_bookings"],
        "cancelled_bookings": row["cancelled_bookings"],
        "total_customers": row["total_customers"],
        "total_active_services": row["total_active_services"],
        "total_active_locations": row["total_active_locations"],
    }


def map_daily_agenda_item(row: dict[str, Any]) -> dict[str, Any]:
    """Row from v_daily_agenda. `start_time`/`end_time` come back from
    pyodbc as full `datetime.datetime` values (DATETIME2 columns) - `.time()`
    narrows them to the DailyAgendaItemResponse.start_time/end_time (`time`)
    contract."""
    return {
        "booking_date": row["booking_date"],
        "start_time": row["start_time"].time(),
        "end_time": row["end_time"].time(),
        "service_name": row["service_name"],
        "customer_name": row["customer_name"],
        "location_name": row["location_name"],
        "status": row["status"],
    }


def map_service_demand(row: dict[str, Any]) -> dict[str, Any]:
    """Row from v_service_demand."""
    return {
        "service_id": row["service_id"],
        "service_name": row["service_name"],
        "total_bookings": row["total_bookings"],
        "last_booking_at": row.get("last_booking_at"),
    }


def map_availability_status(row: dict[str, Any]) -> dict[str, Any]:
    """Row from v_availability_status. Same `.time()` narrowing as
    map_daily_agenda_item - see its docstring."""
    return {
        "availability_block_id": row["block_id"],
        "location_id": row["location_id"],
        "location_name": row["location_name"],
        "block_date": row["block_date"],
        "start_time": row["start_time"].time(),
        "end_time": row["end_time"].time(),
        "is_active": bool(row["block_is_active"]),
        "is_reserved": bool(row["is_reserved"]),
        "booking_id": row.get("booking_id"),
    }
