"""Pydantic schemas: the JSON contract boundary.

Fields are English snake_case (matching the mappers' output keys) with
alias_generator=to_camel + populate_by_name=True, so every model both accepts
and emits camelCase JSON identical to apps/frontend/types/*.ts, while staying
idiomatic snake_case in Python.
"""
