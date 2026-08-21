from __future__ import annotations

from typing import Any

from app.repositories.service_repository import ServiceRepository


class ServiceService:
    def __init__(self, repo: ServiceRepository) -> None:
        self._repo = repo

    def create(self, **fields: Any) -> dict:
        return self._repo.create(**fields)

    def update(self, tenant_id: int, service_id: int, **fields: Any) -> dict | None:
        return self._repo.update(tenant_id, service_id, **fields)

    def delete(self, tenant_id: int, service_id: int) -> dict | None:
        """Soft delete: is_active = 0, via sp_update_service."""
        return self._repo.update(tenant_id, service_id, is_active=False)

    def get(self, tenant_id: int, service_id: int) -> dict | None:
        return self._repo.get_by_id(tenant_id, service_id)

    def list_services(
        self, tenant_id: int, *, page: int, page_size: int, category_id: int | None = None
    ) -> tuple[list[dict], int]:
        return self._repo.list_by_tenant(
            tenant_id, page=page, page_size=page_size, category_id=category_id
        )

    def list_public(self, slug: str) -> list[dict]:
        return self._repo.list_public_by_slug(slug)
