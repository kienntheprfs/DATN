"""Database models using SQLModel (SQLAlchemy + Pydantic)."""
from datetime import datetime
from typing import Optional, List
from uuid import uuid4
from sqlmodel import SQLModel, Field, Relationship

# Export SQLModel as Base for Alembic compatibility
Base = SQLModel


# Link model for many-to-many relationship between users and roles
class UserRoleLink(SQLModel, table=True):
    """Link table for User-Role many-to-many relationship."""
    __tablename__ = "user_roles"
    
    user_id: str = Field(foreign_key="users.id", primary_key=True, max_length=36)
    role_id: str = Field(foreign_key="roles.id", primary_key=True, max_length=36)


class User(SQLModel, table=True):
    """User model combining SQLAlchemy ORM + Pydantic validation."""
    __tablename__ = "users"
    
    id: str = Field(
        default_factory=lambda: str(uuid4()),
        primary_key=True,
        max_length=36,
    )
    email: str = Field(
        unique=True,
        index=True,
        max_length=255,
    )
    hashed_password: str = Field(
        max_length=255,
    )
    is_active: bool = Field(default=True)
    is_superuser: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    roles: List["Role"] = Relationship(
        back_populates="users",
        link_model=UserRoleLink,
        sa_relationship_kwargs={"lazy": "selectin"},
    )
    threads: List["Thread"] = Relationship(
        back_populates="owner",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    
    def has_role(self, role_name: str) -> bool:
        """Check if user has a specific role."""
        return any(role.name == role_name for role in self.roles)
    
    def get_role_names(self) -> List[str]:
        """Get list of role names."""
        return [role.name for role in self.roles]


class Role(SQLModel, table=True):
    """Role model for RBAC."""
    __tablename__ = "roles"
    
    id: str = Field(
        default_factory=lambda: str(uuid4()),
        primary_key=True,
        max_length=36,
    )
    name: str = Field(
        unique=True,
        index=True,
        max_length=50,
    )
    description: Optional[str] = Field(
        default=None,
        max_length=255,
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    users: List["User"] = Relationship(
        back_populates="roles",
        link_model=UserRoleLink,
    )


class Thread(SQLModel, table=True):
    """Thread model for conversation tracking."""
    __tablename__ = "threads"
    
    id: str = Field(
        default_factory=lambda: str(uuid4()),
        primary_key=True,
        max_length=36,
    )
    user_id: str = Field(
        foreign_key="users.id",
        index=True,
        max_length=36,
    )
    agent_id: Optional[str] = Field(
        default=None,
        max_length=100,
    )
    title: Optional[str] = Field(
        default=None,
        max_length=255,
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    owner: "User" = Relationship(back_populates="threads")
    
    def is_owned_by(self, user_id: str) -> bool:
        """Check if thread is owned by given user."""
        return self.user_id == user_id


class RefreshToken(SQLModel, table=True):
    """Refresh token model for token management and revocation."""
    __tablename__ = "refresh_tokens"
    
    id: str = Field(
        default_factory=lambda: str(uuid4()),
        primary_key=True,
        max_length=36,
    )
    token: str = Field(
        unique=True,
        index=True,
        max_length=500,
        description="The JWT refresh token string",
    )
    user_id: str = Field(
        foreign_key="users.id",
        index=True,
        max_length=36,
    )
    is_revoked: bool = Field(
        default=False,
        index=True,
        description="Whether the token has been revoked",
    )
    expires_at: datetime = Field(
        index=True,
        description="Token expiration timestamp",
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    revoked_at: Optional[datetime] = Field(
        default=None,
        description="When the token was revoked",
    )
    
    # Optional metadata for tracking
    user_agent: Optional[str] = Field(
        default=None,
        max_length=500,
        description="User agent of the client that requested the token",
    )
    ip_address: Optional[str] = Field(
        default=None,
        max_length=45,  # IPv6 max length
        description="IP address of the client",
    )
    
    def revoke(self) -> None:
        """Revoke this refresh token."""
        self.is_revoked = True
        self.revoked_at = datetime.utcnow()
    
    def is_valid(self) -> bool:
        """Check if token is valid (not revoked and not expired)."""
        return not self.is_revoked and self.expires_at > datetime.utcnow()


# Export all models for Alembic autogenerate
__all__ = [
    "Base",
    "SQLModel",
    "User",
    "Role",
    "UserRoleLink",
    "Thread",
    "RefreshToken",
]




