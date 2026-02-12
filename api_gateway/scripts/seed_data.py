"""Seed initial data for API Gateway.

Creates default roles and optionally creates an admin user.
Run this after applying Alembic migrations.

Usage:
    uv run python -m alembic upgrade head
    uv run python scripts/seed_data.py
"""
import asyncio
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlmodel import select

from src.config import settings
from src.models import Role, User
from src.shared.auth.password import password_handler


async def seed_roles(session: AsyncSession) -> None:
    """Seed default roles: admin, user, guest.
    
    RBAC roles:
    - admin: Full access to all services and resources
    - user: Access to own threads and agent service
    - guest: Temporary agent invocations only (not stored in DB)
    """
    roles_data = [
        {
            "name": "admin",
            "description": "Administrator with full access to all services",
        },
        {
            "name": "user",
            "description": "Regular user with access to own threads and agent",
        },
        {
            "name": "guest",
            "description": "Guest user with temporary agent access only",
        },
    ]
    
    for role_data in roles_data:
        # Check if role already exists
        stmt = select(Role).where(Role.name == role_data["name"])
        result = await session.execute(stmt)
        existing_role = result.scalar_one_or_none()
        
        if existing_role:
            print(f"  ⏭️  Role '{role_data['name']}' already exists")
        else:
            role = Role(**role_data)
            session.add(role)
            print(f"  ✓ Created role: {role_data['name']}")
    
    await session.commit()


async def seed_admin_user(session: AsyncSession, email: str, password: str) -> None:
    """Create admin user if not exists.
    
    Args:
        session: Database session
        email: Admin email
        password: Admin password (will be hashed)
    """
    # Check if user already exists
    stmt = select(User).where(User.email == email)
    result = await session.execute(stmt)
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        print(f"  ⏭️  Admin user '{email}' already exists")
        return
    
    # Get admin role
    stmt = select(Role).where(Role.name == "admin")
    result = await session.execute(stmt)
    admin_role = result.scalar_one_or_none()
    
    if not admin_role:
        print("  ❌ Admin role not found! Seed roles first.")
        return
    
    # Create admin user
    hashed_password = password_handler.hash_password(password)
    admin_user = User(
        email=email,
        hashed_password=hashed_password,
        is_active=True,
        is_superuser=True,
        roles=[admin_role],
    )
    
    session.add(admin_user)
    await session.commit()
    
    print(f"  ✓ Created admin user: {email}")
    print(f"  🔑 Password: {password}")


async def main():
    """Main seed function."""
    print("=" * 60)
    print("🌱 Seeding API Gateway Database")
    print("=" * 60)
    
    # Create async engine
    engine = create_async_engine(
        settings.database_url.replace("postgresql://", "postgresql+asyncpg://"),
        echo=False,
    )
    
    AsyncSessionLocal = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    try:
        async with AsyncSessionLocal() as session:
            # Seed roles
            print("\n📝 Seeding roles...")
            await seed_roles(session)
            
            # Seed admin user
            print("\n👤 Creating admin user...")
            admin_email = input("  Enter admin email (default: admin@example.com): ").strip()
            if not admin_email:
                admin_email = "admin@example.com"
            
            admin_password = input("  Enter admin password (default: admin123): ").strip()
            if not admin_password:
                admin_password = "admin123"
            
            await seed_admin_user(session, admin_email, admin_password)
        
        print("\n" + "=" * 60)
        print("✅ Seeding completed successfully!")
        print("=" * 60)
        print("\n🚀 You can now start the API Gateway:")
        print("   uv run uvicorn src.main:app --reload --port 8002")
        print("\n📖 Access Swagger UI:")
        print("   http://localhost:8002/docs")
        print("\n🔐 Login with admin credentials to get JWT token")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Error during seeding: {e}")
        raise
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
