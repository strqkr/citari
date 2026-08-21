"""Row from `audit_logs` -> AuditLog contract. Column names per
schema-rename-dictionary.md."""

from __future__ import annotations

from typing import Any


def map_audit_log(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "audit_id": row["audit_id"],
        "tenant_id": row.get("tenant_id"),
        "owner_id": row.get("owner_id"),
        "superadmin_id": row.get("superadmin_id"),
        "action": row["action"],
        "entity_name": row["entity_name"],
        "entity_id": row["entity_id"],
        "old_value": row.get("old_value"),
        "new_value": row.get("new_value"),
        "created_at": row["created_at"],
    }
