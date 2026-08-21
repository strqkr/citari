from __future__ import annotations

from app.repositories.business_type_repository import BusinessTypeRepository


class BusinessTypeService:
    def __init__(self, repo: BusinessTypeRepository) -> None:
        self._repo = repo

    def list_business_types(self) -> list[dict]:
        return self._repo.list_business_types()
