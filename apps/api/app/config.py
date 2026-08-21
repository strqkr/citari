"""Application settings loaded from environment variables (pydantic-settings).

Mirrors the variables already defined in the repo-root .env.example plus the
API-specific ones (JWT_SECRET, JWT_EXPIRES_MIN, CORS_ORIGINS, LOG_FORMAT).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # SQL Server connection
    sqlserver_host: str = "localhost"
    sqlserver_port: int = 1433
    sqlserver_user: str = "sa"
    sqlserver_password: str = ""
    sqlserver_db: str = "citari"
    sqlserver_driver: str = "ODBC Driver 18 for SQL Server"

    # Auth
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expires_min: int = 60

    # HTTP
    cors_origins: str = "http://localhost:3000"

    # Logging: "dev" or "json" (default)
    log_format: str = "json"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def connection_string(self) -> str:
        return (
            f"DRIVER={{{self.sqlserver_driver}}};"
            f"SERVER={self.sqlserver_host},{self.sqlserver_port};"
            f"DATABASE={self.sqlserver_db};"
            f"UID={self.sqlserver_user};"
            f"PWD={self.sqlserver_password};"
            "TrustServerCertificate=yes;"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
