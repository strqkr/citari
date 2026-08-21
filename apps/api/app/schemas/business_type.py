"""GET /business-types. No frontend type file exists yet for this
catalog - apps/frontend/lib/endpoints.ts only defines the path
(`businessTypes: "/business-types"`)."""

from __future__ import annotations

from app.schemas.common import CamelModel


class BusinessTypeResponse(CamelModel):
    business_type_id: int
    name: str
    description: str | None = None
