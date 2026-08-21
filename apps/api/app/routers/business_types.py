"""Read-only catalog (endpoints.businessTypes). Public - no auth required."""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import DbConnection
from app.mappers.business_type_mapper import map_business_type
from app.repositories.business_type_repository import BusinessTypeRepository
from app.schemas.business_type import BusinessTypeResponse
from app.services.business_type_service import BusinessTypeService

router = APIRouter(prefix="/business-types", tags=["business-types"])


@router.get("", response_model=list[BusinessTypeResponse])
def list_business_types(db: DbConnection) -> list[BusinessTypeResponse]:
    rows = BusinessTypeService(BusinessTypeRepository(db)).list_business_types()
    return [BusinessTypeResponse(**map_business_type(row)) for row in rows]
