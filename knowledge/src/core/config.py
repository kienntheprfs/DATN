from pydantic_settings import BaseSettings
from pydantic_core import MultiHostUrl
from pydantic import computed_field

class Settings(BaseSettings):
    UPLOAD_DIR: str = "./uploads"
    MAX_CONCURRENT_WORKERS: int = 10 
    BATCH_SIZE: int = 50
    
    # Azure OpenAI Settings
    AZURE_OPENAI_API_KEY: str | None = None
    AZURE_OPENAI_ENDPOINT: str | None = None

    # Qdrant
    QDRANT_URL: str | None = None
    QDRANT_API_KEY: str | None = None
    FAQ_COLLECTION_NAME: str | None = "faqs"

    # Embeddings
    EMBEDDING_MODEL: str | None = None
    EMBEDDING_DEPLOYMENT_NAME: str | None = None
    EMBEDDING_API_VERSION: str | None = None

    # Generation
    AZURE_OPENAI_ENDPOINT: str | None = None
    AZURE_OPENAI_API_VERSION: str | None = None
    AZURE_OPENAI_DEPLOYMENT_MAP: str | None = None
    AZURE_OPENAI_API_MODEL_NAME: str | None = None

    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str

    STORAGE_TYPE: str = "local"

    S3_ENDPOINT: str | None = None
    S3_ACCESS_KEY: str | None = None
    S3_SECRET_KEY: str | None = None
    S3_BUCKET: str | None = None
    S3_REGION: str | None = None

    REDIS_BROKER_URL: str = "redis://localhost:6379/0"
    REDIS_BACKEND_URL: str = "redis://localhost:6379/1"

    LLAMA_CLOUD_API_KEY: str | None = None

    @computed_field
    @property
    def DATABASE_URL(self) -> str:
        return str(MultiHostUrl.build(
            scheme="postgresql+asyncpg", # Driver cho async
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_HOST,
            port=self.POSTGRES_PORT,
            path=self.POSTGRES_DB,
        ))

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore" # Bỏ qua các biến thừa trong .env

settings = Settings()