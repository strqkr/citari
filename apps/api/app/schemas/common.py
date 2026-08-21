"""Shared base model (camelCase wire format) and pagination envelope."""

from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

T = TypeVar("T")


class CamelModel(BaseModel):
    """Base for every schema: emits/accepts camelCase over the wire while
    staying snake_case in Python."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class PageRequest(CamelModel):
    page: int = 1
    page_size: int = 20


class PageResponse(CamelModel, Generic[T]):
    items: list[T]
    page: int
    page_size: int
    total: int
