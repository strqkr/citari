#!/bin/bash
# setup-db.sh — brings up SQL Server and creates the full schema with seed data.
# Usage: bash scripts/setup-db.sh
set -e

SQLCMD="/opt/mssql-tools18/bin/sqlcmd"
CONTAINER="db"
ENV_FILE=".env"
ENV_EXAMPLE=".env.example"

# ── 1. Check .env ───────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
    echo "[setup] .env not found. Copying from $ENV_EXAMPLE..."
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo "[setup] Edit .env with your password and rerun the script."
    exit 1
fi

source "$ENV_FILE"

if [ -z "$SQLSERVER_PASSWORD" ]; then
    echo "[ERROR] SQLSERVER_PASSWORD is not set in $ENV_FILE"
    exit 1
fi

# ── 2. Bring up the container ───────────────────────────────────────────────
echo "[setup] Bringing up the SQL Server container..."
docker compose up -d

# ── 3. Wait for healthcheck ─────────────────────────────────────────────────
echo "[setup] Waiting for SQL Server to be ready..."
ATTEMPTS=0
MAX=20
until docker inspect --format='{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null | grep -q "healthy"; do
    ATTEMPTS=$((ATTEMPTS + 1))
    if [ "$ATTEMPTS" -ge "$MAX" ]; then
        echo "[ERROR] SQL Server did not respond after $(( MAX * 5 )) seconds."
        docker compose logs db
        exit 1
    fi
    echo "  ... waiting (${ATTEMPTS}/${MAX})"
    sleep 5
done
echo "[setup] SQL Server is healthy."

# ── 4. Run the script ────────────────────────────────────────────────────────
echo "[setup] Running database/scripts/citari.sql..."
# -I: QUOTED_IDENTIFIER ON (required by the FILTERED unique index
# ux_bookings_availability_block; sqlcmd defaults it OFF, and CREATE INDEX
# on a filtered index fails without it).
docker exec -i "$CONTAINER" \
    "$SQLCMD" -S localhost -U sa -P "$SQLSERVER_PASSWORD" -C -I \
    -i "/scripts/citari.sql"

# ── 5. Done ──────────────────────────────────────────────────────────────────
echo ""
echo "[OK] Setup complete. Connect DBeaver with:"
echo "  Host:     localhost"
echo "  Port:     ${SQLSERVER_PORT:-1433}"
echo "  Database: ${SQLSERVER_DB:-citari}"
echo "  User:     sa"
echo "  Driver Properties -> trustServerCertificate = true"
