"""Matches apps/frontend/types/service.ts."""

from __future__ import annotations

from app.schemas.common import CamelModel


class ServiceResponse(CamelModel):
    service_id: int
    name: str
    description: str | None = None
    duration_minutes: int
    price: float | None = None
    show_price: bool


class ServiceCreateRequest(CamelModel):
    category_id: int
    name: str
    description: str | None = None
    duration_minutes: int
    price: float | None = None
    show_price: bool = False


class ServiceUpdateRequest(CamelModel):
    category_id: int | None = None
    name: str | None = None
    description: str | None = None
    duration_minutes: int | None = None
    price: float | None = None
    show_price: bool | None = None
