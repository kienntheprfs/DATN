"""API Gateway main application."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

from src.config import settings
from src.middleware import AuthorizationMiddleware
from src.routes import auth, agent_proxy, knowledge_proxy


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup: Initialize Redis connection
    redis = Redis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True,
    )
    app.state.redis = redis
    
    print("✓ Redis connection established")
    print(f"✓ OPA URL: {settings.opa_url}")
    print(f"✓ Agent Service URL: {settings.agent_service_url}")
    print(f"✓ Knowledge Service URL: {settings.knowledge_service_url}")
    
    yield
    
    # Shutdown: Close Redis connection
    await redis.aclose()
    print("✓ Redis connection closed")


# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="API Gateway with JWT Authentication and OPA Authorization",
    lifespan=lifespan,
    swagger_ui_parameters={"persistAuthorization": True, "docExpansion": "list"},
)

# Add Bearer token authorization to Swagger UI
from fastapi.openapi.utils import get_openapi

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title=settings.app_name,
        version=settings.app_version,
        description="API Gateway with JWT Authentication and OPA Authorization",
        routes=app.routes,
    )
    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }
    }
    openapi_schema["security"] = [{"BearerAuth": []}]
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add authorization middleware
app.add_middleware(AuthorizationMiddleware)

# Include routers
app.include_router(auth.router)
app.include_router(agent_proxy.router)
app.include_router(knowledge_proxy.router)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "api-gateway",
        "version": settings.app_version,
    }


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "API Gateway",
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/health",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.api_gateway_host,
        port=settings.api_gateway_port,
        reload=True,
    )
