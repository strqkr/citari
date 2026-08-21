from __future__ import annotations

from datetime import date

from app.repositories.report_repository import ReportRepository


class ReportService:
    def __init__(self, repo: ReportRepository) -> None:
        self._repo = repo

    def dashboard(self, tenant_id: int) -> dict | None:
        return self._repo.dashboard(tenant_id)

    def daily_agenda(self, tenant_id: int, agenda_date: date) -> list[dict]:
        return self._repo.daily_agenda(tenant_id, agenda_date)

    def bookings_detail(
        self, tenant_id: int, *, page: int, page_size: int
    ) -> tuple[list[dict], int]:
        return self._repo.bookings_detail(tenant_id, page=page, page_size=page_size)

    def services_demand(self, tenant_id: int) -> list[dict]:
        return self._repo.services_demand(tenant_id)

    def availability_status(self, tenant_id: int, status_date: date) -> list[dict]:
        return self._repo.availability_status(tenant_id, status_date)
