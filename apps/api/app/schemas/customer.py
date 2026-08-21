"""Matches apps/frontend/types/customer.ts."""

from __future__ import annotations

from app.schemas.common import CamelModel


class CustomerResponse(CamelModel):
    customer_id: int
    first_name: str
    last_name: str
    email: str
    phone: str
    notes: str | None = None


class CustomerCreateRequest(CamelModel):
    first_name: str
    last_name: str
    email: str
    phone: str
    notes: str | None = None


class CustomerUpdateRequest(CamelModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    notes: str | None = None
