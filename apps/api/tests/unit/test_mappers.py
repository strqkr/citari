"""Mapper tests: Spanish SQL row (dict) -> English camelCase-able dict.

Covers: happy path field translation, apellido_2 NULL handling, and accented
characters surviving untouched in the *data* (never in identifiers).
"""

from __future__ import annotations

from app.mappers.availability_mapper import map_availability_block
from app.mappers.booking_mapper import map_booking_detail
from app.mappers.customer_mapper import map_customer
from app.mappers.service_mapper import map_service, map_service_category
from app.mappers.tenant_mapper import map_tenant


def test_map_service_translates_spanish_columns() -> None:
    row = {
        "service_id": 7,
        "name": "Corte de cabello",
        "description": "Corte clasico con maquina y tijera",
        "duration_minutes": 30,
        "price": 15.50,
        "show_price": 1,
    }

    result = map_service(row)

    assert result == {
        "service_id": 7,
        "name": "Corte de cabello",
        "description": "Corte clasico con maquina y tijera",
        "duration_minutes": 30,
        "price": 15.50,
        "show_price": True,
    }


def test_map_service_optional_fields_missing() -> None:
    row = {
        "service_id": 1,
        "name": "Manicura",
        "description": None,
        "duration_minutes": 45,
        "price": None,
        "show_price": 0,
    }

    result = map_service(row)

    assert result["price"] is None
    assert result["show_price"] is False


def test_map_service_category() -> None:
    row = {
        "category_id": 3,
        "name": "Peluqueria",
        "description": "Servicios de cabello",
        "is_active": 1,
    }

    result = map_service_category(row)

    assert result == {
        "category_id": 3,
        "name": "Peluqueria",
        "description": "Servicios de cabello",
        "is_active": True,
    }


def test_map_customer_combines_both_last_names() -> None:
    row = {
        "customer_id": 42,
        "first_name": "Maria",
        "last_name_1": "Gonzalez",
        "last_name_2": "Perez",
        "email": "maria@example.com",
        "phone": "555-0100",
    }

    result = map_customer(row)

    assert result["first_name"] == "Maria"
    assert result["last_name"] == "Gonzalez Perez"
    assert result["customer_id"] == 42


def test_map_customer_handles_null_second_surname() -> None:
    row = {
        "customer_id": 43,
        "first_name": "Juan",
        "last_name_1": "Ramirez",
        "last_name_2": None,
        "email": "juan@example.com",
        "phone": "555-0101",
    }

    result = map_customer(row)

    assert result["last_name"] == "Ramirez"


def test_map_customer_handles_missing_second_surname_key() -> None:
    """apellido_2 may be entirely absent from the row (not every SP/view
    necessarily returns it as an explicit NULL column)."""
    row = {
        "customer_id": 44,
        "first_name": "Ana",
        "last_name_1": "Torres",
        "email": "ana@example.com",
        "phone": "555-0102",
    }

    result = map_customer(row)

    assert result["last_name"] == "Torres"


def test_map_customer_preserves_accented_data() -> None:
    """Accents belong in *data*, never in SQL identifiers - this asserts the
    mapper does not mangle/strip them."""
    row = {
        "customer_id": 45,
        "first_name": "Jose",
        "last_name_1": "Nunez",
        "last_name_2": "Munoz",
        "email": "jose@example.com",
        "phone": "555-0103",
        # Simulate genuinely accented data values coming back from SQL Server:
    }
    row["first_name"] = "José"
    row["last_name_1"] = "Núñez"
    row["last_name_2"] = "Muñoz"

    result = map_customer(row)

    assert result["first_name"] == "José"
    assert result["last_name"] == "Núñez Muñoz"


def test_map_tenant() -> None:
    row = {
        "tenant_id": 1,
        "slug": "salon-bella",
        "name": "Salón Bella",
        "description": "Salón de belleza y spa",
        "public_message": "¡Bienvenido!",
    }

    result = map_tenant(row)

    assert result == {
        "tenant_id": 1,
        "slug": "salon-bella",
        "name": "Salón Bella",
        "description": "Salón de belleza y spa",
        "public_message": "¡Bienvenido!",
    }


def test_map_availability_block_with_reserved_flag() -> None:
    row = {
        "availability_block_id": 9,
        "block_date": "2026-07-15",
        "start_time": "09:00:00",
        "end_time": "09:30:00",
        "is_reserved": 1,
    }

    result = map_availability_block(row)

    assert result["availability_block_id"] == 9
    assert result["is_reserved"] is True


def test_map_availability_block_without_reserved_column() -> None:
    row = {
        "availability_block_id": 10,
        "block_date": "2026-07-15",
        "start_time": "10:00:00",
        "end_time": "10:30:00",
    }

    result = map_availability_block(row)

    assert "is_reserved" not in result


def test_map_booking_detail() -> None:
    row = {
        "booking_id": 100,
        "customer_name": "María José Nuñez",
        "service_name": "Tinte y peinado",
        "booking_date": "2026-07-20",
        "start_time": "14:00:00",
        "status": "confirmed",
        "tracking_code": "ABC123",
    }

    result = map_booking_detail(row)

    assert result == {
        "booking_id": 100,
        "customer_name": "María José Nuñez",
        "service_name": "Tinte y peinado",
        "booking_date": "2026-07-20",
        "start_time": "14:00:00",
        "status": "confirmed",
        "tracking_code": "ABC123",
    }
