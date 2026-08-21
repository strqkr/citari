"""Service category schemas (no direct frontend type file; derived from the
Service list grouping used by apps/frontend)."""

from __future__ import annotations

from app.schemas.common import CamelModel


class ServiceCategoryResponse(CamelModel):
    category_id: int
    name: str
    description: str | None = None
    is_active: bool = True


class ServiceCategoryCreateRequest(CamelModel):
    name: str
    description: str | None = None


class ServiceCategoryUpdateRequest(CamelModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
