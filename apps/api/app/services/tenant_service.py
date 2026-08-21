from __future__ import annotations

from typing import Any

from app.repositories.tenant_repository import TenantRepository


class TenantService:
    """Pass-through orchestration for admin tenant CRUD, the owner's own
    tenant profile, and the public tenant lookup by slug."""

    def __init__(self, repo: TenantRepository) -> None:
        self._repo = repo

    def create_tenant(self, **fields: Any) -> int:
        """Returns the new tenant_id (see TenantRepository.create_tenant -
        sp_create_tenant only reports it via an OUTPUT param)."""
        return self._repo.create_tenant(**fields)

    def get_tenant(self, tenant_id: int) -> dict | None:
        return self._repo.get_by_id(tenant_id)

    def get_tenant_by_slug(self, slug: str) -> dict | None:
        return self._repo.get_by_slug(slug)

    def get_public_tenant(self, slug: str) -> dict | None:
        """GET /public/{slug}: None means "doesn't exist or isn't active" -
        the router turns that into a 404."""
        return self._repo.get_active_by_slug(slug)

    def list_tenants(self, *, page: int, page_size: int) -> tuple[list[dict], int]:
        return self._repo.list_tenants(page=page, page_size=page_size)

    def activate_tenant(self, tenant_id: int, superadmin_id: int) -> dict | None:
        return self._repo.activate(tenant_id, superadmin_id)

    def suspend_tenant(self, tenant_id: int, superadmin_id: int) -> dict | None:
        return self._repo.suspend(tenant_id, superadmin_id)

    def update_tenant(self, tenant_id: int, **fields: Any) -> dict | None:
        """PATCH /tenant/current."""
        return self._repo.update_tenant(tenant_id, **fields)
