from __future__ import annotations

from datetime import date
from typing import Any

from app.errors import ConflictError, NotFoundError
from app.repositories.availability_repository import AvailabilityRepository


class AvailabilityService:
    def __init__(self, repo: AvailabilityRepository) -> None:
        self._repo = repo

    def create_block(self, **fields: Any) -> int:
        """Returns the new `availability_block_id` (see
        AvailabilityRepository.create_block - the SP reports it via an
        OUTPUT param, not a result-set row)."""
        return self._repo.create_block(**fields)

    def get(self, tenant_id: int, block_id: int) -> dict | None:
        return self._repo.get_by_id(tenant_id, block_id)

    def list_owner(
        self,
        tenant_id: int,
        *,
        page: int,
        page_size: int,
        block_date: date | None = None,
        location_id: int | None = None,
    ) -> tuple[list[dict], int]:
        return self._repo.list_owner(
            tenant_id,
            page=page,
            page_size=page_size,
            block_date=block_date,
            location_id=location_id,
        )

    def delete_block(self, tenant_id: int, block_id: int) -> None:
        """DELETE /availability-blocks/{id}: soft delete (is_active = 0), 404 if
        the block does not exist/belong to this tenant, 409 if it currently
        has an active (non-cancelled) reservation."""
        row = self._repo.get_by_id(tenant_id, block_id)
        if row is None:
            raise NotFoundError(f"Availability block {block_id} not found or does not belong to the tenant.")
        if row.get("is_reserved"):
            raise ConflictError(
                f"Availability block {block_id} has an active booking and cannot be deleted."
            )
        self._repo.deactivate(tenant_id, block_id)

    def list_public(
        self, slug: str, *, block_date: date | None = None, location_id: int | None = None
    ) -> list[dict]:
        return self._repo.list_public(slug, block_date=block_date, location_id=location_id)
