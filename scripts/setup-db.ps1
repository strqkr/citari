# setup-db.ps1 — brings up SQL Server and creates the full schema with seed data.
# Usage: .\scripts\setup-db.ps1
#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$SQLCMD   = "/opt/mssql-tools18/bin/sqlcmd"
$CONTAINER = "db"
$ENV_FILE  = ".env"
$ENV_EXAMPLE = ".env.example"

# ── 1. Check .env ───────────────────────────────────────────────────────────
if (-not (Test-Path $ENV_FILE)) {
    Write-Host "[setup] .env not found. Copying from $ENV_EXAMPLE..."
    Copy-Item $ENV_EXAMPLE $ENV_FILE
    Write-Host "[setup] Edit .env with your password and rerun the script."
    exit 1
}

# Load variables from .env
Get-Content $ENV_FILE | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
}

$SA_PASSWORD = [Environment]::GetEnvironmentVariable("SQLSERVER_PASSWORD", "Process")
$SA_PORT     = [Environment]::GetEnvironmentVariable("SQLSERVER_PORT", "Process")
$SA_DB       = [Environment]::GetEnvironmentVariable("SQLSERVER_DB", "Process")

if (-not $SA_PASSWORD) {
    Write-Error "[ERROR] SQLSERVER_PASSWORD is not set in $ENV_FILE"
    exit 1
}

# ── 2. Bring up the container ───────────────────────────────────────────────
Write-Host "[setup] Bringing up the SQL Server container..."
docker compose up -d

# ── 3. Wait for healthcheck ─────────────────────────────────────────────────
Write-Host "[setup] Waiting for SQL Server to be ready..."
$attempts = 0
$max = 20
do {
    Start-Sleep -Seconds 5
    $attempts++
    $status = docker inspect --format='{{.State.Health.Status}}' $CONTAINER 2>$null
    Write-Host "  ... waiting ($attempts/$max)"
    if ($attempts -ge $max) {
        Write-Error "[ERROR] SQL Server did not respond after $($max * 5) seconds."
        docker compose logs db
        exit 1
    }
} until ($status -eq "healthy")
Write-Host "[setup] SQL Server is healthy."

# ── 4. Run the script ────────────────────────────────────────────────────────
Write-Host "[setup] Running database/scripts/citari.sql..."
# -I: QUOTED_IDENTIFIER ON (required by the FILTERED unique index
# ux_bookings_availability_block; sqlcmd defaults it OFF, and CREATE INDEX
# on a filtered index fails without it).
docker exec -i $CONTAINER `
    $SQLCMD -S localhost -U sa -P "$SA_PASSWORD" -C -I `
    -i "/scripts/citari.sql"

# ── 5. Done ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Setup complete. Connect DBeaver with:"
Write-Host "  Host:     localhost"
Write-Host "  Port:     $($SA_PORT ?? '1433')"
Write-Host "  Database: $($SA_DB ?? 'citari')"
Write-Host "  User:     sa"
Write-Host "  Driver Properties -> trustServerCertificate = true"
