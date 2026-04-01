"""API Gateway main application.

Simplified architecture with JWT + Python-based authorization:
- No OPA (replaced with fastapiDI)
- Optional Redis (using in-memory cache)
- SQLModel for models + Pydantic DTOs
- Role-based access control (RBAC)
"""

from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import SQLAlchemyError, IntegrityError

from src.config import settings
from src.middleware.auth_middleware import AuthMiddleware
from src.routes import (
    auth,
    agent_proxy,
    knowledge_proxy,
    wayfinder_proxy,
    threads,
    voice_proxy,
    dashboard_proxy
)

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.debug else logging.DEBUG,
    format="\n%(asctime)s - %(name)s - %(levelname)s - %(message)s\n",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    print("=" * 60)
    print(f"Starting {settings.app_name} v{settings.app_version}")
    print("=" * 60)
    print(f"Database: {settings.database_url.split('@')[-1]}")
    print(f"JWT Auth: Enabled (in-memory cache)")
    print(f"Agent Service: {settings.agent_service_url}")
    print(f"Knowledge Service: {settings.knowledge_service_url}")
    print(f"Wayfinder Service: {settings.wayfinder_service_url}")
    print(f"Voice Service: {settings.voice_service_url}")
    print("=" * 60)

    yield

    # Shutdown
    print("Shutting down gracefully")


# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "API Gateway with JWT Authentication and Python-based Authorization.\n\n"
        "**Roles:**\n"
        "- **Admin**: Full access to all services\n"
        "- **User**: Access to own threads and agent service\n"
        "- **Guest**: Temporary agent invocations (no history)"
    ),
    lifespan=lifespan,
    swagger_ui_parameters={"persistAuthorization": True, "docExpansion": "list"},
)


# Custom OpenAPI schema with Bearer token
from fastapi.openapi.utils import get_openapi


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=settings.app_name,
        version=settings.app_version,
        description=app.description,
        routes=app.routes,
    )

    # Add security scheme
    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "JWT token from /auth/login endpoint",
        }
    }

    # Make security optional (for guest endpoints)
    # Specific endpoints will override this in fastapiDI
    openapi_schema["security"] = [{"BearerAuth": []}]

    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi

# Add authentication middleware (JWT validation)
app.add_middleware(AuthMiddleware)

# Add CORS middleware
logger.debug(f"CORS origins: {settings.cors_origins_list}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global Exception Handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle request validation errors with user-friendly messages."""
    logger.warning(f"Validation error on {request.url.path}: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Invalid request data",
            "errors": exc.errors(),
        },
    )


@app.exception_handler(IntegrityError)
async def integrity_exception_handler(request: Request, exc: IntegrityError):
    """Handle database integrity errors (e.g., unique constraint violations)."""
    logger.error(f"Database integrity error on {request.url.path}: {str(exc)}")
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "detail": "Data integrity error. Please check your input and try again."
        },
    )


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    """Handle general database errors."""
    logger.error(f"Database error on {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "A database error occurred. Please try again later."},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Catch-all exception handler to prevent stack trace exposure."""
    logger.error(
        f"Unhandled exception on {request.url.path}: {type(exc).__name__}: {str(exc)}",
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected error occurred. Please try again later."},
    )


# Include routers
app.include_router(auth.router)
app.include_router(threads.router)
app.include_router(agent_proxy.router)
app.include_router(knowledge_proxy.router)
app.include_router(wayfinder_proxy.router)
app.include_router(voice_proxy.router)
app.include_router(dashboard_proxy.router)
app.include_router(dashboard_proxy.router)  

@app.get(
    "/health",
    tags=["System"],
    summary="Health check",
    description="Check if API Gateway is running",
)
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "api-gateway",
        "version": settings.app_version,
        "database": "connected",
    }


@app.get(
    "/",
    tags=["System"],
    summary="Root endpoint",
    description="API Gateway information",
)
async def root():
    """Root endpoint."""
    return {
        "service": "API Gateway",
        "version": settings.app_version,
        "architecture": "JWT + Python-based Authorization",
        "endpoints": {
            "docs": "/docs",
            "health": "/health",
            "auth": "/auth",
            "threads": "/threads",
            "agent": "/agent",
            "knowledge": "/kb (admin only)",
            "wayfinder": "/wayfinder (admin only)",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.api_gateway_host,
        port=settings.api_gateway_port,
        reload=settings.debug,
    )
