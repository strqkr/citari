"""Location schemas. No dedicated frontend/types file yet.

`locations` has no free-text address column - the territorial division
(province/canton/district/postal_code) lives in the `addresses` catalog, so
location address data is exposed as those four structured fields (wire
format: camelCase via CamelModel, e.g. `postalCode`) rather than a flat
`address: str`. `canton` has no English equivalent (Costa Rican
administrative division), kept as-is."""

from __future__ import annotations

from app.schemas.common import CamelModel


class LocationResponse(CamelModel):
    location_id: int
    name: str
    province: str
    canton: str
    district: str
    postal_code: str
    phone: str | None = None
    is_main: bool = False
    is_active: bool = True


class LocationCreateRequest(CamelModel):
    name: str
    province: str
    canton: str
    district: str
    postal_code: str
    phone: str | None = None
    is_main: bool = False


class LocationUpdateRequest(CamelModel):
    name: str | None = None
    province: str | None = None
    canton: str | None = None
    district: str | None = None
    postal_code: str | None = None
    phone: str | None = None
    is_main: bool | None = None
    is_active: bool | None = None
