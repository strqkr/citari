"""Public, unauthenticated storefront endpoints (endpoints.public.*)."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import DbConnection
from app.errors import NotFoundError
from app.mappers.availability_mapper import map_availability_block
from app.mappers.booking_mapper import map_booking_detail
from app.mappers.service_mapper import map_service
from app.mappers.tenant_mapper import map_tenant
from app.repositories.availability_repository import AvailabilityRepository
from app.repositories.booking_repository import BookingRepository
from app.repositories.service_repository import ServiceRepository
from app.repositories.tenant_repository import TenantRepository
from app.schemas.availability import AvailabilityBlockResponse
from app.schemas.booking import BookingDetailResponse, PublicBookingCreateRequest
from app.schemas.service import ServiceResponse
from app.schemas.tenant import TenantResponse
from app.services.availability_service import AvailabilityService
from app.services.booking_service import BookingService
from app.services.service_service import ServiceService
from app.services.tenant_service import TenantService

router = APIRouter(prefix="/public", tags=["public"])


def _require_active_tenant(db: DbConnection, slug: str) -> dict:
    """Shared by GET /public/{slug} and POST /public/{slug}/bookings: both
    must 404 (not the SP's native 400) when the slug doesn't exist or the
    tenant isn't active."""
    tenant = TenantService(TenantRepository(db)).get_public_tenant(slug)
    if tenant is None:
        raise NotFoundError(f"Tenant '{slug}' not found or inactive.")
    return tenant


@router.get("/{slug}", response_model=TenantResponse)
def get_public_tenant(slug: str, db: DbConnection) -> TenantResponse:
    tenant = _require_active_tenant(db, slug)
    return TenantResponse(**map_tenant(tenant))


@router.get("/{slug}/services", response_model=list[ServiceResponse])
def get_public_services(slug: str, db: DbConnection) -> list[ServiceResponse]:
    rows = ServiceService(ServiceRepository(db)).list_public(slug)
    return [ServiceResponse(**map_service(row)) for row in rows]


@router.get("/{slug}/availability", response_model=list[AvailabilityBlockResponse])
def get_public_availability(
    slug: str,
    db: DbConnection,
    block_date: Annotated[date | None, Query(alias="date")] = None,
    location_id: Annotated[int | None, Query(alias="locationId")] = None,
) -> list[AvailabilityBlockResponse]:
    rows = AvailabilityService(AvailabilityRepository(db)).list_public(
        slug, block_date=block_date, location_id=location_id
    )
    return [AvailabilityBlockResponse(**map_availability_block(row)) for row in rows]


@router.post("/{slug}/bookings", response_model=BookingDetailResponse, status_code=201)
def create_public_booking(
    slug: str, payload: PublicBookingCreateRequest, db: DbConnection
) -> BookingDetailResponse:
    tenant = _require_active_tenant(db, slug)
    detail = BookingService(BookingRepository(db)).create_public_booking(
        tenant_id=tenant["tenant_id"],
        service_id=payload.service_id,
        location_id=payload.location_id,
        availability_block_id=payload.availability_block_id,
        first_name=payload.customer.first_name,
        last_name=payload.customer.last_name,
        email=payload.customer.email,
        phone=payload.customer.phone,
        customer_notes=payload.customer_notes,
    )
    return BookingDetailResponse(**map_booking_detail(detail))
