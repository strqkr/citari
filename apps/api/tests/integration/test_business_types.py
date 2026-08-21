"""Integration test for GET /api/v1/business-types: public catalog, no
auth required."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_list_business_types_returns_active_catalog_without_auth(client: TestClient) -> None:
    response = client.get("/api/v1/business-types")

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) >= 1
    sample = body[0]
    assert {"businessTypeId", "name", "description"} <= sample.keys()
