"""Superadmin-only audit trail (endpoints.auditLogs)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import CurrentSuperadmin, DbConnection
from app.mappers.audit_log_mapper import map_audit_log
from app.repositories.audit_log_repository import AuditLogRepository
from app.schemas.audit_log import AuditLogResponse
from app.schemas.common import PageResponse
from app.services.audit_log_service import AuditLogService

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("", response_model=PageResponse[AuditLogResponse])
def list_audit_logs(
    superadmin: CurrentSuperadmin,
    db: DbConnection,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
    tenant_id: Annotated[int | None, Query(alias="tenantId")] = None,
    action: Annotated[str | None, Query()] = None,
) -> PageResponse[AuditLogResponse]:
    items, total = AuditLogService(AuditLogRepository(db)).list_logs(
        tenant_id=tenant_id, action=action, page=page, page_size=page_size
    )
    return PageResponse(
        items=[AuditLogResponse(**map_audit_log(row)) for row in items],
        page=page,
        page_size=page_size,
        total=total,
    )
