from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql://postgres:postgres@localhost:5433/authdb"
    db_pool_size: int = 10  # Number of connections in the pool
    db_max_overflow: int = 20  # Max connections that can be created beyond pool_size
    db_pool_timeout: float = 30.0  # Seconds to wait for a connection from the pool
    db_pool_recycle: int = (
        3600  # Recycle connections after N seconds (prevent stale connections)
    )

    # Redis
    redis_url: str = "redis://localhost:6379/0"
    redis_cache_ttl: int = 300  # 5 minutes

    # OPA
    opa_url: str = "http://localhost:8181"
    opa_policy_path: str = "/v1/data/authz/allow"

    # JWT
    jwt_secret: str = "your-secret-key-change-this-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    api_gateway_host: str = "0.0.0.0"
    api_gateway_port: int = 8002

    # Downstream Services
    agent_service_url: str = "http://localhost:8080"
    knowledge_service_url: str = "http://localhost:8000"
    wayfinder_service_url: str = "http://localhost:8001"
    voice_service_url: str = "http://localhost:7860"

    # Internal Security
    internal_secret: str = "your-internal-secret-for-service-to-service-auth"

    # Google OAuth2
    google_client_id: str = ""
    google_client_secret: str = ""

    # CORS
    cors_origins: str = "*"

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @property
    def normalized_database_url(self) -> str:
        """Normalize DB URL scheme for SQLAlchemy compatibility.

        Supports providers that expose URLs as `postgres://...`.
        """
        url = self.database_url
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql://", 1)
        return url

    @property
    def database_url_async(self) -> str:
        """Return async SQLAlchemy URL for runtime engine."""
        url = self.normalized_database_url
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

        # asyncpg does not accept `sslmode`; use `ssl` instead.
        parts = urlsplit(url)
        query_items = parse_qsl(parts.query, keep_blank_values=True)
        has_ssl = any(key.lower() == "ssl" for key, _ in query_items)
        converted_items = []

        for key, value in query_items:
            if key.lower() == "sslmode":
                if not has_ssl:
                    converted_items.append(("ssl", value))
                continue
            converted_items.append((key, value))

        new_query = urlencode(converted_items, doseq=True)
        return urlunsplit(
            (parts.scheme, parts.netloc, parts.path, new_query, parts.fragment)
        )

    @property
    def database_url_sync(self) -> str:
        """Return sync SQLAlchemy URL for Alembic engine."""
        url = self.normalized_database_url
        if url.startswith("postgresql+asyncpg://"):
            return url.replace("postgresql+asyncpg://", "postgresql://", 1)
        return url

    # Application
    app_name: str = "API Gateway"
    app_version: str = "0.1.0"
    debug: bool = False


# Global settings instance
settings = Settings()
