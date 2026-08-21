"""Base fixtures for Citari's black-box E2E validation.

These tests run from the HOST against the real docker compose API (the
`api` service on localhost:8000). They don't use pyodbc: database checks and
cleanup go through `docker exec sqlcmd` against the `db` container (the
`citari` database).

Requirements: stack up (docker compose up -d db db-init api) and a `.env` at
the repo root with SQLSERVER_PASSWORD.

Run with: make test-e2e  (or: apps/api/.venv/bin/pytest tests/e2e -q)
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import httpx
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
API_BASE = os.environ.get("E2E_API_BASE", "http://localhost:8000")
API_V1 = f"{API_BASE}/api/v1"

# Seed credentials documented in database/docs/PASSWORDS.md
OWNER_PASSWORD = "bowner123"
SUPERADMIN_PASSWORD = "Admin123"


def _sqlserver_password() -> str:
    env_file = REPO_ROOT / ".env"
    for line in env_file.read_text().splitlines():
        if line.startswith("SQLSERVER_PASSWORD="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("SQLSERVER_PASSWORD not found in .env")


def run_sql(query: str) -> str:
    """Runs a query against the citari database via docker exec sqlcmd.

    Returns raw stdout (space-separated -W format). For single-value
    queries use sql_scalar().
    """
    cmd = [
        "docker", "exec", "db",
        "/opt/mssql-tools18/bin/sqlcmd",
        "-S", "localhost", "-U", "sa", "-P", _sqlserver_password(),
        "-C", "-I", "-b", "-d", "citari", "-W", "-h", "-1",
        "-Q", f"SET NOCOUNT ON; {query}",
    ]
    # -b: without this flag, sqlcmd exits 0 even when the engine rejected the
    # statement (e.g. an FK violation) - the error only shows up in
    # stdout/stderr, silent to anyone just checking the exit code. With -b,
    # a T-SQL error DOES produce a non-zero exit code.
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise RuntimeError(f"sqlcmd failed: {result.stderr or result.stdout}")
    return result.stdout.strip()


def sql_scalar(query: str) -> str:
    out = run_sql(query)
    lines = [ln.strip() for ln in out.splitlines() if ln.strip()]
    return lines[0] if lines else ""


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "e2e: black-box end-to-end validation against the real API")


@pytest.fixture(scope="session")
def client() -> httpx.Client:
    with httpx.Client(base_url=API_V1, timeout=30.0) as c:
        yield c


@pytest.fixture(scope="session", autouse=True)
def stack_available(client: httpx.Client) -> None:
    """Aborts the whole session if the stack isn't up."""
    try:
        r = httpx.get(f"{API_BASE}/ready", timeout=10.0)
    except httpx.HTTPError as exc:
        pytest.exit(f"API not available at {API_BASE}: {exc}", returncode=3)
    if r.status_code != 200:
        pytest.exit(f"/ready returned {r.status_code}; bring the stack up with make up", returncode=3)


def login(client: httpx.Client, email: str, password: str, role: str) -> dict:
    r = client.post("/auth/login", json={"email": email, "password": password, "role": role})
    assert r.status_code == 200, f"{role} login {email} failed: {r.status_code} {r.text}"
    return r.json()


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def seed_identities() -> dict:
    """Dynamically resolves seed identities (no hardcoded names/emails)."""
    owner1 = sql_scalar(
        "SELECT TOP 1 email FROM owner_emails "
        "WHERE owner_id = (SELECT owner_id FROM tenant_owners WHERE tenant_id = 1) "
        "ORDER BY owner_email_id"
    )
    owner2 = sql_scalar(
        "SELECT TOP 1 email FROM owner_emails "
        "WHERE owner_id = (SELECT owner_id FROM tenant_owners WHERE tenant_id = 2) "
        "ORDER BY owner_email_id"
    )
    slug1 = sql_scalar("SELECT slug FROM tenants WHERE tenant_id = 1")
    slug2 = sql_scalar("SELECT slug FROM tenants WHERE tenant_id = 2")
    superadmin = sql_scalar(
        "SELECT TOP 1 email FROM superadmin_emails "
        "WHERE superadmin_id = 1 ORDER BY superadmin_email_id"
    )
    return {
        "owner1_email": owner1, "owner2_email": owner2,
        "slug1": slug1, "slug2": slug2,
        "superadmin_email": superadmin,
    }


@pytest.fixture(scope="session")
def owner1_token(client: httpx.Client, seed_identities: dict) -> str:
    return login(client, seed_identities["owner1_email"], OWNER_PASSWORD, "owner")["accessToken"]


@pytest.fixture(scope="session")
def owner2_token(client: httpx.Client, seed_identities: dict) -> str:
    return login(client, seed_identities["owner2_email"], OWNER_PASSWORD, "owner")["accessToken"]


@pytest.fixture(scope="session")
def superadmin_token(client: httpx.Client, seed_identities: dict) -> str:
    return login(client, seed_identities["superadmin_email"], SUPERADMIN_PASSWORD, "superadmin")["accessToken"]


@pytest.fixture()
def cleanup_sql():
    """Registers cleanup statements that run at teardown (LIFO order).

    Usage: cleanup_sql(f"DELETE FROM bookings WHERE booking_id = {bid}")
    The DB must be back to seed state when each test finishes.
    """
    statements: list[str] = []

    def register(stmt: str) -> None:
        statements.append(stmt)

    yield register
    for stmt in reversed(statements):
        run_sql(stmt)
