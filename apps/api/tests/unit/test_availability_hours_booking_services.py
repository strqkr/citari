"""Unit tests for service-layer logic against fake in-memory
repositories (no DB): availability soft-delete rules (404/409), the
business-hours weekly replacement (location ownership validation), the
booking list's status filter passthrough, and the customer surname split
on create/update.
"""

from __future__ import annotations

from datetime import time
from typing import Any

import pytest

from app.errors import ConflictError, NotFoundError
from app.services.availability_service import AvailabilityService
from app.services.booking_service import BookingService
from app.services.business_hours_service import BusinessHoursService
from app.services.customer_service import CustomerService

# -- availability: DELETE /availability-blocks/{id} rules ---------------------


class FakeAvailabilityRepo:
    def __init__(self, rows: dict[tuple[int, int], dict[str, Any]]) -> None:
        self._rows = rows
        self.deactivated: list[tuple[int, int]] = []

    def get_by_id(self, tenant_id: int, block_id: int) -> dict[str, Any] | None:
        return self._rows.get((tenant_id, block_id))

    def deactivate(self, tenant_id: int, block_id: int) -> None:
        self.deactivated.append((tenant_id, block_id))


def test_delete_block_deactivates_free_block() -> None:
    repo = FakeAvailabilityRepo({(1, 10): {"availability_block_id": 10, "is_reserved": 0}})
    service = AvailabilityService(repo)  # type: ignore[arg-type]

    service.delete_block(1, 10)

    assert repo.deactivated == [(1, 10)]


def test_delete_block_missing_raises_404() -> None:
    repo = FakeAvailabilityRepo({})
    service = AvailabilityService(repo)  # type: ignore[arg-type]

    with pytest.raises(NotFoundError):
        service.delete_block(1, 999)
    assert repo.deactivated == []


def test_delete_block_cross_tenant_raises_404() -> None:
    """A block that exists but belongs to tenant 2 must look identical to a
    non-existent one for tenant 1 (cross-tenant -> 404, never 403)."""
    repo = FakeAvailabilityRepo({(2, 10): {"availability_block_id": 10, "is_reserved": 0}})
    service = AvailabilityService(repo)  # type: ignore[arg-type]

    with pytest.raises(NotFoundError):
        service.delete_block(1, 10)


def test_delete_block_with_active_booking_raises_409() -> None:
    repo = FakeAvailabilityRepo({(1, 10): {"availability_block_id": 10, "is_reserved": 1}})
    service = AvailabilityService(repo)  # type: ignore[arg-type]

    with pytest.raises(ConflictError):
        service.delete_block(1, 10)
    assert repo.deactivated == []


# -- business hours: PUT /business-hours -------------------------------------


class FakeBusinessHoursRepo:
    def __init__(self) -> None:
        self.replaced: list[tuple[int, int, list]] = []

    def list_by_tenant(self, tenant_id: int, *, location_id: int | None = None) -> list[dict]:
        return []

    def replace_week(self, tenant_id: int, location_id: int, hours: list) -> list[dict]:
        self.replaced.append((tenant_id, location_id, hours))
        return [
            {
                "business_hour_id": i + 1,
                "location_id": location_id,
                "day_of_week": item["day_of_week"],
                "open_time": item["open_time"],
                "close_time": item["close_time"],
                "is_closed": item["is_closed"],
            }
            for i, item in enumerate(hours)
        ]


class FakeLocationRepo:
    def __init__(self, rows: dict[tuple[int, int], dict[str, Any]]) -> None:
        self._rows = rows

    def get_by_id(self, tenant_id: int, location_id: int) -> dict[str, Any] | None:
        return self._rows.get((tenant_id, location_id))


def _week() -> list[dict[str, Any]]:
    return [
        {"day_of_week": 1, "open_time": time(9, 0), "close_time": time(17, 0), "is_closed": False},
        {"day_of_week": 7, "open_time": None, "close_time": None, "is_closed": True},
    ]


def test_replace_week_replaces_set_for_owned_location() -> None:
    hours_repo = FakeBusinessHoursRepo()
    location_repo = FakeLocationRepo({(1, 5): {"location_id": 5}})
    service = BusinessHoursService(hours_repo, location_repo)  # type: ignore[arg-type]

    result = service.replace_week(1, location_id=5, hours=_week())  # type: ignore[arg-type]

    assert hours_repo.replaced == [(1, 5, _week())]
    assert len(result) == 2
    assert result[0]["day_of_week"] == 1


def test_replace_week_cross_tenant_location_raises_404() -> None:
    """The location exists, but under tenant 2 - tenant 1's PUT must 404 and
    never touch the business_hours table."""
    hours_repo = FakeBusinessHoursRepo()
    location_repo = FakeLocationRepo({(2, 5): {"location_id": 5}})
    service = BusinessHoursService(hours_repo, location_repo)  # type: ignore[arg-type]

    with pytest.raises(NotFoundError):
        service.replace_week(1, location_id=5, hours=_week())  # type: ignore[arg-type]
    assert hours_repo.replaced == []


# -- bookings: GET /bookings status filter passthrough ------------------------


class FakeBookingRepo:
    def __init__(self) -> None:
        self.list_calls: list[dict[str, Any]] = []

    def list_by_tenant(self, tenant_id: int, **kwargs: Any) -> tuple[list[dict], int]:
        self.list_calls.append({"tenant_id": tenant_id, **kwargs})
        return [], 0


def test_list_bookings_passes_status_filter_through() -> None:
    """booking_statuses.name is stored in English now, so the status filter
    is passed straight to the repository with no translation layer."""
    repo = FakeBookingRepo()
    service = BookingService(repo)  # type: ignore[arg-type]

    service.list_bookings(1, page=2, page_size=5, status="confirmed")

    assert repo.list_calls == [
        {
            "tenant_id": 1,
            "page": 2,
            "page_size": 5,
            "status": "confirmed",
            "booking_date": None,
        }
    ]


def test_list_bookings_passes_none_status_through() -> None:
    repo = FakeBookingRepo()
    service = BookingService(repo)  # type: ignore[arg-type]

    service.list_bookings(1, page=1, page_size=20)

    assert repo.list_calls[0]["status"] is None


# -- customers: surname split on create/update --------------------------------


class FakeCustomerRepo:
    def __init__(self) -> None:
        self.created: list[dict[str, Any]] = []
        self.updated: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> dict[str, Any]:
        self.created.append(kwargs)
        return {"customer_id": 1, **kwargs}

    def update(self, tenant_id: int, customer_id: int, **kwargs: Any) -> dict[str, Any]:
        self.updated.append({"tenant_id": tenant_id, "customer_id": customer_id, **kwargs})
        return {"customer_id": customer_id}


def test_create_customer_splits_double_last_name() -> None:
    repo = FakeCustomerRepo()
    service = CustomerService(repo)  # type: ignore[arg-type]

    service.create(
        tenant_id=1,
        first_name="Ana",
        last_name="Rodriguez Solis",
        email="ana@example.com",
        phone="8888-0000",
        notes=None,
    )

    assert repo.created[0]["last_name_1"] == "Rodriguez"
    assert repo.created[0]["last_name_2"] == "Solis"


def test_create_customer_single_last_name_leaves_second_null() -> None:
    repo = FakeCustomerRepo()
    service = CustomerService(repo)  # type: ignore[arg-type]

    service.create(
        tenant_id=1,
        first_name="Juan",
        last_name="Ramirez",
        email="juan@example.com",
        phone="8888-0001",
        notes=None,
    )

    assert repo.created[0]["last_name_1"] == "Ramirez"
    assert repo.created[0]["last_name_2"] is None


def test_update_customer_without_last_name_does_not_touch_surnames() -> None:
    repo = FakeCustomerRepo()
    service = CustomerService(repo)  # type: ignore[arg-type]

    service.update(1, 42, phone="9999-0000")

    assert repo.updated[0]["last_name_1"] is None
    assert repo.updated[0]["last_name_2"] is None
    assert repo.updated[0]["phone"] == "9999-0000"
