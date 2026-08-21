from __future__ import annotations

from app.repositories.service_category_repository import ServiceCategoryRepository


class ServiceCategoryService:
    def __init__(self, repo: ServiceCategoryRepository) -> None:
        self._repo = repo

    def create(self, *, tenant_id: int, name: str, description: str | None) -> dict:
        return self._repo.create(tenant_id=tenant_id, name=name, description=description)

    def get(self, tenant_id: int, category_id: int) -> dict | None:
        return self._repo.get_by_id(tenant_id, category_id)

    def list_categories(
        self, tenant_id: int, *, page: int, page_size: int
    ) -> tuple[list[dict], int]:
        return self._repo.list_by_tenant(tenant_id, page=page, page_size=page_size)

    def update(
        self,
        tenant_id: int,
        category_id: int,
        *,
        name: str | None = None,
        description: str | None = None,
        is_active: bool | None = None,
    ) -> dict | None:
        return self._repo.update(
            tenant_id, category_id, name=name, description=description, is_active=is_active
        )

    def delete(self, tenant_id: int, category_id: int) -> dict | None:
        """Soft delete: is_active = 0 (DELETE endpoints never hard-delete)."""
        return self._repo.update(tenant_id, category_id, is_active=False)
