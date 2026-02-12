"""Schemas for authentication and authorization."""
from typing import List, Optional
from pydantic import BaseModel


class UserInfo(BaseModel):
    """User information extracted from JWT token.
    
    Stored in request.state.user by auth middleware.
    Used by fastapiDI for authorization checks.
    """
    id: str
    email: str
    roles: List[str]
    is_active: bool = True
    
    class Config:
        """Pydantic config."""
        from_attributes = True
