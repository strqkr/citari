from __future__ import annotations

from typing import Any

from app.repositories.location_repository import LocationRepository


class LocationService:
    def __init__(self, repo: LocationRepository) -> None:
        self._repo = repo

    def create(self, **fields: Any) -> dict:
        return self._repo.create(**fields)

    def get(self, tenant_id: int, location_id: int) -> dict | None:
        return self._repo.get_by_id(tenant_id, location_id)

    def list_locations(
        self, tenant_id: int, *, page: int, page_size: int
    ) -> tuple[list[dict], int]:
        return self._repo.list_by_tenant(tenant_id, page=page, page_size=page_size)

    def update(self, tenant_id: int, location_id: int, **fields: Any) -> dict | None:
        return self._repo.update(tenant_id, location_id, **fields)

    def delete(self, tenant_id: int, location_id: int) -> dict | None:
        return self._repo.update(tenant_id, location_id, is_active=False)
