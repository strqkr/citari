from __future__ import annotations

from app.repositories.customer_repository import CustomerRepository


def _split_last_name(last_name: str) -> tuple[str, str | None]:
    """Splits the frontend's single `lastName` field into the two Spanish
    surname columns sp_create_customer expects (`last_name_1` required,
    `apellido_2` optional) - same rule as
    app.services.booking_service._split_last_name/
    app.services.auth_service._split_last_name."""
    parts = last_name.split(None, 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    return last_name, None


class CustomerService:
    def __init__(self, repo: CustomerRepository) -> None:
        self._repo = repo

    def create(
        self,
        *,
        tenant_id: int,
        first_name: str,
        last_name: str,
        email: str,
        phone: str,
        notes: str | None,
    ) -> dict:
        last_name_1, last_name_2 = _split_last_name(last_name)
        return self._repo.create(
            tenant_id=tenant_id,
            first_name=first_name,
            last_name_1=last_name_1,
            last_name_2=last_name_2,
            email=email,
            phone=phone,
            notes=notes,
        )

    def get(self, tenant_id: int, customer_id: int) -> dict | None:
        return self._repo.get_by_id(tenant_id, customer_id)

    def list_customers(
        self, tenant_id: int, *, page: int, page_size: int, q: str | None = None
    ) -> tuple[list[dict], int]:
        return self._repo.list_by_tenant(tenant_id, page=page, page_size=page_size, q=q)

    def update(
        self,
        tenant_id: int,
        customer_id: int,
        *,
        first_name: str | None = None,
        last_name: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        notes: str | None = None,
    ) -> dict | None:
        last_name_1: str | None = None
        last_name_2: str | None = None
        if last_name is not None:
            last_name_1, last_name_2 = _split_last_name(last_name)
        return self._repo.update(
            tenant_id,
            customer_id,
            first_name=first_name,
            last_name_1=last_name_1,
            last_name_2=last_name_2,
            email=email,
            phone=phone,
            notes=notes,
        )

    def booking_history(self, tenant_id: int, customer_id: int) -> list[dict]:
        return self._repo.booking_history(tenant_id, customer_id)
