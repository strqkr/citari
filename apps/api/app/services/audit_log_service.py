from __future__ import annotations

from app.repositories.audit_log_repository import AuditLogRepository


class AuditLogService:
    def __init__(self, repo: AuditLogRepository) -> None:
        self._repo = repo

    def list_logs(
        self,
        *,
        tenant_id: int | None = None,
        action: str | None = None,
        page: int,
        page_size: int,
    ) -> tuple[list[dict], int]:
        return self._repo.list_logs(
            tenant_id=tenant_id, action=action, page=page, page_size=page_size
        )
