from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


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
    
    # Internal Security
    internal_secret: str = "your-internal-secret-for-service-to-service-auth"
    
    # CORS
    cors_origins: str = "http://localhost:8501,http://localhost:3000"
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.cors_origins.split(",")]
    
    # Application
    app_name: str = "API Gateway"
    app_version: str = "0.1.0"
    debug: bool = False


# Global settings instance
settings = Settings()
