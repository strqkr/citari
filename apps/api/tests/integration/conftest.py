"""Shared fixtures for the integration suite: real SQL Server (the live
`db` container / `citari` database, seed already loaded - see
docs/sql-signatures.md for the conventions this mirrors).

Every test creates its own throwaway data (year-2032 availability blocks, one
fixed test-customer email) and the `cleanup_tracker` fixture removes it again
after each test in FK order (tracking_codes -> audit_logs ->
bookings -> availability_blocks, then the test customer by email),
so the suite is safely re-runnable and always leaves the seed data
untouched.

Connection target: SQLSERVER_HOST/PORT/USER/PASSWORD/DB env vars (same ones
app.config.Settings reads). `app.config.Settings` defaults to port 1433 (the
in-container port); running this suite from the HOST machine against the
dockerized instance needs SQLSERVER_PORT=11433 (docker-compose.yml's default
published port, chosen to avoid clashing with a local SQL Server on 1433). If
pyodbc cannot load "ODBC Driver 18 for SQL Server" from the host (no driver
installed on macOS), run this suite inside a container on the compose network
instead (SQLSERVER_HOST=db, SQLSERVER_PORT=1433) - see apps/api/README for
the exact command used.
"""

from __future__ import annotations

from collections.abc import Generator
from datetime import date, time

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import ConnectionFactory
from app.main import app
from app.repositories.availability_repository import AvailabilityRepository

TEST_CUSTOMER_EMAIL = "integration.tests@example.com"


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings()


@pytest.fixture(scope="session")
def db_factory(settings: Settings) -> ConnectionFactory:
    return ConnectionFactory(settings)


@pytest.fixture
def raw_conn(db_factory: ConnectionFactory) -> Generator:
    conn = db_factory.new_connection()
    try:
        yield conn
    finally:
        conn.close()


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)


# Every seed owner shares the same bcrypt hash of "bowner123", and
# every seed superadmin shares the same bcrypt hash of "Admin123" - see
# database/PASSWORDS.md.
SEED_OWNER_PASSWORD = "bowner123"
SEED_SUPERADMIN_PASSWORD = "Admin123"


@pytest.fixture(scope="session")
def seed_owner(db_factory: ConnectionFactory) -> dict:
    """One active owner (active account + active tenant) from the seed, used
    by the /auth and /tenant integration tests."""
    conn = db_factory.new_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT TOP 1 o.owner_id, o.tenant_id, oco.email, o.first_name
            FROM tenant_owners o
            OUTER APPLY (
                SELECT TOP 1 oc.email
                FROM owner_emails oc
                WHERE oc.owner_id = o.owner_id
                ORDER BY oc.owner_email_id
            ) oco
            WHERE o.is_active = 1 AND dbo.fn_is_tenant_active(o.tenant_id) = 1
            ORDER BY o.owner_id
            """
        )
        row = cursor.fetchone()
        if row is None:
            pytest.skip("seed data has no active owner with an active tenant")
        return {
            "owner_id": row.owner_id,
            "tenant_id": row.tenant_id,
            "email": row.email,
            "password": SEED_OWNER_PASSWORD,
            "first_name": row.first_name,
        }
    finally:
        conn.close()


@pytest.fixture(scope="session")
def seed_superadmin(db_factory: ConnectionFactory) -> dict:
    """One active superadmin from the seed."""
    conn = db_factory.new_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT TOP 1 s.superadmin_id, sco.email, s.first_name
            FROM superadmins s
            OUTER APPLY (
                SELECT TOP 1 sc.email
                FROM superadmin_emails sc
                WHERE sc.superadmin_id = s.superadmin_id
                ORDER BY sc.superadmin_email_id
            ) sco
            WHERE s.is_active = 1
            ORDER BY s.superadmin_id
            """
        )
        row = cursor.fetchone()
        if row is None:
            pytest.skip("seed data has no active superadmin")
        return {
            "superadmin_id": row.superadmin_id,
            "email": row.email,
            "password": SEED_SUPERADMIN_PASSWORD,
            "first_name": row.first_name,
        }
    finally:
        conn.close()


@pytest.fixture(scope="session")
def seed_business_type(db_factory: ConnectionFactory) -> dict:
    """One active business type from the seed, used by
    POST /auth/register-owner."""
    conn = db_factory.new_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT TOP 1 business_type_id, name FROM business_types "
            "WHERE is_active = 1 ORDER BY business_type_id"
        )
        row = cursor.fetchone()
        if row is None:
            pytest.skip("seed data has no active business type")
        return {"business_type_id": row.business_type_id, "name": row.name}
    finally:
        conn.close()


def owner_auth_headers(client: TestClient, *, email: str, password: str) -> dict[str, str]:
    """Logs in and returns an `Authorization: Bearer ...` header dict, for
    tests that need an authenticated owner session."""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password, "role": "owner"},
    )
    assert response.status_code == 200, response.text
    token = response.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def seed_tenant(db_factory: ConnectionFactory) -> dict:
    """Finds one active tenant from the seed with at least one active service
    and one active location."""
    conn = db_factory.new_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT TOP 1 t.tenant_id, t.slug
            FROM tenants t
            WHERE dbo.fn_is_tenant_active(t.tenant_id) = 1
              AND EXISTS (
                  SELECT 1 FROM services s
                  WHERE s.tenant_id = t.tenant_id AND s.is_active = 1
              )
              AND EXISTS (
                  SELECT 1 FROM locations l
                  WHERE l.tenant_id = t.tenant_id AND l.is_active = 1
              )
            ORDER BY t.tenant_id
            """
        )
        row = cursor.fetchone()
        if row is None:
            pytest.skip("seed data has no active tenant with an active service+location")
        tenant_id, slug = row.tenant_id, row.slug

        cursor.execute(
            "SELECT TOP 1 service_id FROM services "
            "WHERE tenant_id = ? AND is_active = 1 ORDER BY service_id",
            [tenant_id],
        )
        service_id = cursor.fetchone().service_id

        cursor.execute(
            "SELECT TOP 1 location_id FROM locations "
            "WHERE tenant_id = ? AND is_active = 1 ORDER BY location_id",
            [tenant_id],
        )
        location_id = cursor.fetchone().location_id

        cursor.close()
        return {
            "tenant_id": tenant_id,
            "slug": slug,
            "service_id": service_id,
            "location_id": location_id,
        }
    finally:
        conn.close()


@pytest.fixture
def cleanup_tracker(raw_conn) -> Generator[dict, None, None]:
    """Tests append the ids they create to `tracker["booking_ids"]` /
    `tracker["block_ids"]`; everything is deleted here afterwards, in FK
    order, regardless of whether the test passed or failed."""
    tracker: dict[str, list[int]] = {"booking_ids": [], "block_ids": []}
    yield tracker

    cursor = raw_conn.cursor()
    booking_ids = tracker["booking_ids"]
    block_ids = tracker["block_ids"]

    if booking_ids:
        placeholders = ",".join("?" for _ in booking_ids)
        cursor.execute(
            f"DELETE FROM tracking_codes WHERE booking_id IN ({placeholders})",
            booking_ids,
        )
        cursor.execute(
            "DELETE FROM audit_logs WHERE entity_name = 'bookings' "
            f"AND entity_id IN ({placeholders})",
            booking_ids,
        )
        cursor.execute(
            f"DELETE FROM bookings WHERE booking_id IN ({placeholders})",
            booking_ids,
        )

    if block_ids:
        placeholders = ",".join("?" for _ in block_ids)
        cursor.execute(
            "DELETE FROM availability_blocks "
            f"WHERE availability_block_id IN ({placeholders})",
            block_ids,
        )

    cursor.execute(
        "SELECT customer_id FROM customer_emails WHERE email = ?", [TEST_CUSTOMER_EMAIL]
    )
    test_customer_ids = [row.customer_id for row in cursor.fetchall()]
    if test_customer_ids:
        placeholders = ",".join("?" for _ in test_customer_ids)
        cursor.execute(
            f"DELETE FROM customer_emails WHERE customer_id IN ({placeholders})",
            test_customer_ids,
        )
        cursor.execute(
            f"DELETE FROM customer_phones WHERE customer_id IN ({placeholders})",
            test_customer_ids,
        )
        cursor.execute(
            f"DELETE FROM customers WHERE customer_id IN ({placeholders})",
            test_customer_ids,
        )
    raw_conn.commit()
    cursor.close()


def make_block(
    db_factory: ConnectionFactory,
    seed_tenant: dict,
    *,
    block_date: date,
    start_time: time = time(9, 0),
    end_time: time = time(9, 30),
) -> int:
    """Creates one throwaway availability block via
    sp_create_availability_block (through
    AvailabilityRepository.create_block) on its own short-lived connection.
    Callers must record the returned id in `cleanup_tracker["block_ids"]`.
    """
    conn = db_factory.new_connection()
    try:
        repo = AvailabilityRepository(conn)
        return repo.create_block(
            tenant_id=seed_tenant["tenant_id"],
            location_id=seed_tenant["location_id"],
            block_date=block_date,
            start_time=start_time,
            end_time=end_time,
        )
    finally:
        conn.close()


def booking_payload(*, service_id: int, location_id: int, availability_block_id: int) -> dict:
    return {
        "serviceId": service_id,
        "locationId": location_id,
        "availabilityBlockId": availability_block_id,
        "customer": {
            "firstName": "Ana",
            "lastName": "Rodriguez Solis",
            "email": TEST_CUSTOMER_EMAIL,
            "phone": "8888-0000",
        },
        "customerNotes": "integration-test",
    }
