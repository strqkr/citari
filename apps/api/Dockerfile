FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY pyproject.toml README.md ./
COPY app ./app

# Install the Microsoft ODBC Driver 18 for SQL Server (msodbcsql18) + unixodbc,
# plus the build toolchain pyodbc needs to compile against unixodbc headers.
# The build-only packages (gcc/g++/curl/gnupg2/unixodbc-dev) are purged again
# once the project is installed so the runtime image only keeps what it
# actually needs to run (msodbcsql18 + unixodbc runtime libs).
# libgssapi-krb5-2 must be installed EXPLICITLY (marked manual): msodbcsql18
# dlopens it at connect time without declaring it as a package dependency,
# and --auto-remove would otherwise purge it, breaking the driver with a
# misleading "file not found" error.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        gnupg2 \
        apt-transport-https \
        ca-certificates \
        gcc \
        g++ \
        unixodbc-dev \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && curl -fsSL https://packages.microsoft.com/config/debian/12/prod.list -o /etc/apt/sources.list.d/mssql-release.list \
    && sed -i 's#deb \[arch=amd64,armhf,arm64\]#deb [arch=amd64,armhf,arm64 signed-by=/usr/share/keyrings/microsoft-prod.gpg]#g' /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 unixodbc libgssapi-krb5-2 \
    && pip install --no-cache-dir -e . \
    && apt-get purge -y --auto-remove curl gnupg2 apt-transport-https gcc g++ unixodbc-dev \
    && rm -rf /var/lib/apt/lists/* /usr/share/doc /usr/share/man

# Installed in editable mode (-e): with the docker-compose.yml bind mount,
# the code in the container IS the host's code, and --reload picks up
# changes just by saving the file, with no image rebuild needed (see the
# dev profile in docker-compose.yml).

EXPOSE 8000

# --no-access-log: RequestContextMiddleware already logs every request as a
# structured JSON line (method/path/status/duration); uvicorn's own access
# log is plain text and was mixing with the JSON stream in `docker logs`.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
