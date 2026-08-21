"""Owner CRUD for customers (endpoints.customers)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import CurrentOwner, DbConnection
from app.errors import NotFoundError
from app.mappers.booking_mapper import map_booking_detail
from app.mappers.customer_mapper import map_customer
from app.repositories.customer_repository import CustomerRepository
from app.schemas.booking import BookingResponse
from app.schemas.common import PageResponse
from app.schemas.customer import CustomerCreateRequest, CustomerResponse, CustomerUpdateRequest
from app.services.customer_service import CustomerService

router = APIRouter(prefix="/customers", tags=["customers"])


def _service(db: DbConnection) -> CustomerService:
    return CustomerService(CustomerRepository(db))


def _require(service: CustomerService, tenant_id: int, customer_id: int) -> dict:
    row = service.get(tenant_id, customer_id)
    if row is None:
        raise NotFoundError(f"Customer {customer_id} not found or does not belong to the tenant.")
    return row


@router.get("", response_model=PageResponse[CustomerResponse])
def list_customers(
    owner: CurrentOwner,
    db: DbConnection,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
    q: Annotated[str | None, Query()] = None,
) -> PageResponse[CustomerResponse]:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    items, total = _service(db).list_customers(tenant_id, page=page, page_size=page_size, q=q)
    return PageResponse(
        items=[CustomerResponse(**map_customer(row)) for row in items],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("", response_model=CustomerResponse, status_code=201)
def create_customer(
    payload: CustomerCreateRequest, owner: CurrentOwner, db: DbConnection
) -> CustomerResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    customer = _service(db).create(
        tenant_id=tenant_id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        phone=payload.phone,
        notes=payload.notes,
    )
    return CustomerResponse(**map_customer(customer))


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer(customer_id: int, owner: CurrentOwner, db: DbConnection) -> CustomerResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    customer = _require(_service(db), tenant_id, customer_id)
    return CustomerResponse(**map_customer(customer))


@router.patch("/{customer_id}", response_model=CustomerResponse)
def update_customer(
    customer_id: int, payload: CustomerUpdateRequest, owner: CurrentOwner, db: DbConnection
) -> CustomerResponse:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    service = _service(db)
    _require(service, tenant_id, customer_id)
    customer = service.update(
        tenant_id,
        customer_id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        phone=payload.phone,
        notes=payload.notes,
    )
    return CustomerResponse(**map_customer(customer or {}))


@router.get("/{customer_id}/bookings", response_model=list[BookingResponse])
def get_customer_bookings(
    customer_id: int, owner: CurrentOwner, db: DbConnection
) -> list[BookingResponse]:
    tenant_id = owner.tenant_id
    assert tenant_id is not None  # enforced by app.deps.get_current_owner
    service = _service(db)
    _require(service, tenant_id, customer_id)
    rows = service.booking_history(tenant_id, customer_id)
    return [BookingResponse(**map_booking_detail(row)) for row in rows]
