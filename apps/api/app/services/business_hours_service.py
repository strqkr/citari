from __future__ import annotations

from app.errors import NotFoundError
from app.repositories.business_hours_repository import BusinessHourInput, BusinessHoursRepository
from app.repositories.location_repository import LocationRepository


class BusinessHoursService:
    def __init__(self, repo: BusinessHoursRepository, location_repo: LocationRepository) -> None:
        self._repo = repo
        self._location_repo = location_repo

    def list_hours(self, tenant_id: int, *, location_id: int | None = None) -> list[dict]:
        return self._repo.list_by_tenant(tenant_id, location_id=location_id)

    def replace_week(
        self, tenant_id: int, *, location_id: int, hours: list[BusinessHourInput]
    ) -> list[dict]:
        """Validates the location belongs to the caller's tenant (cross-
        tenant -> 404, never delegated to the DB layer here since there is
        no SP to enforce it) before replacing its weekly set."""
        location = self._location_repo.get_by_id(tenant_id, location_id)
        if location is None:
            raise NotFoundError(
                f"Location {location_id} not found or does not belong to the tenant."
            )
        return self._repo.replace_week(tenant_id, location_id, hours)
