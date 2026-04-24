"""User schemas."""
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional


class RoleBase(BaseModel):
    """Base role schema."""
    name: str
    description: Optional[str] = None


class RoleRead(RoleBase):
    """Role read schema."""
    id: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class UserBase(BaseModel):
    """Base user schema."""
    email: EmailStr


class UserCreate(UserBase):
    """User creation schema."""
    password: str = Field(..., min_length=8)
    roles: list[str] = ["user"]  # Default role


class UserRead(UserBase):
    """User read schema (public representation)."""
    id: str
    is_active: bool
    is_superuser: bool
    created_at: datetime
    auth_provider: str = "local"
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    roles: list[RoleRead] = []
    
    class Config:
        from_attributes = True
