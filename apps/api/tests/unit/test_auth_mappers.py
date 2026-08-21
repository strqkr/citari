"""Mapper tests for user_mapper (owner/superadmin ->
`user` contract), business_type_mapper, and tenant_mapper's optional
email/phone/logoUrl fields (GET/PATCH /tenant/current)."""

from __future__ import annotations

from app.mappers.business_type_mapper import map_business_type
from app.mappers.tenant_mapper import map_tenant
from app.mappers.user_mapper import map_owner_user, map_superadmin_user


def test_map_owner_user_combines_both_surnames() -> None:
    row = {
        "owner_id": 7,
        "tenant_id": 3,
        "first_name": "Ana",
        "last_name_1": "Rodriguez",
        "last_name_2": "Solis",
        "email": "ana@example.com",
    }

    result = map_owner_user(row)

    assert result == {
        "id": 7,
        "first_name": "Ana",
        "last_name": "Rodriguez Solis",
        "email": "ana@example.com",
        "role": "owner",
        "tenant_id": 3,
    }


def test_map_owner_user_handles_null_second_surname() -> None:
    row = {
        "owner_id": 8,
        "tenant_id": 4,
        "first_name": "Juan",
        "last_name_1": "Ramirez",
        "last_name_2": None,
        "email": "juan@example.com",
    }

    result = map_owner_user(row)

    assert result["last_name"] == "Ramirez"


def test_map_superadmin_user_has_no_tenant_id() -> None:
    row = {
        "superadmin_id": 1,
        "first_name": "Melanie",
        "last_name_1": "Campos",
        "last_name_2": "Arias",
        "email": "melanie.campos@citari.admin",
    }

    result = map_superadmin_user(row)

    assert result == {
        "id": 1,
        "first_name": "Melanie",
        "last_name": "Campos Arias",
        "email": "melanie.campos@citari.admin",
        "role": "superadmin",
        "tenant_id": None,
    }


def test_map_business_type() -> None:
    row = {
        "business_type_id": 2,
        "name": "Salon de belleza",
        "description": "Servicios de belleza",
    }

    result = map_business_type(row)

    assert result == {
        "business_type_id": 2,
        "name": "Salon de belleza",
        "description": "Servicios de belleza",
    }


def test_map_business_type_missing_description() -> None:
    row = {"business_type_id": 5, "name": "Spa"}

    result = map_business_type(row)

    assert result["description"] is None


def test_map_tenant_surfaces_optional_contact_fields_when_present() -> None:
    """GET/PATCH /tenant/current select the full `dominios` row (unlike the
    public endpoint's narrower SELECT) - when correo/telefono/logo_url
    are present they must be surfaced as email/phone/logoUrl."""
    row = {
        "tenant_id": 1,
        "slug": "salon-bella",
        "name": "Salon Bella",
        "description": "Salon de belleza y spa",
        "public_message": "Bienvenido",
        "email": "salon@example.com",
        "phone": "8888-0000",
        "logo_url": "https://cdn.example.com/logo.png",
    }

    result = map_tenant(row)

    assert result["email"] == "salon@example.com"
    assert result["phone"] == "8888-0000"
    assert result["logo_url"] == "https://cdn.example.com/logo.png"


def test_map_tenant_omits_optional_contact_fields_when_absent() -> None:
    """Backward-compat guard: the public-endpoint row shape (no
    correo/telefono/logo_url keys) must not gain those keys."""
    row = {
        "tenant_id": 1,
        "slug": "salon-bella",
        "name": "Salon Bella",
        "description": None,
        "public_message": None,
    }

    result = map_tenant(row)

    assert "email" not in result
    assert "phone" not in result
    assert "logo_url" not in result
