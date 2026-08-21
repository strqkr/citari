"""Audit trail schema (registros). No dedicated frontend/types file yet."""

from __future__ import annotations

from datetime import datetime

from app.schemas.common import CamelModel


class AuditLogResponse(CamelModel):
    audit_id: int
    tenant_id: int | None = None
    owner_id: int | None = None
    superadmin_id: int | None = None
    action: str
    entity_name: str
    entity_id: int
    old_value: str | None = None
    new_value: str | None = None
    created_at: datetime
