"""JWT token handler."""
from datetime import datetime, timedelta
from typing import Optional
import jwt
from src.config import settings
from src.schemas.auth import TokenPayload


class JWTHandler:
    """JWT token creation and validation."""
    
    @staticmethod
    def create_access_token(
        user_id: str,
        email: str,
        roles: list[str],
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """Create access token."""
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
        
        payload = {
            "sub": user_id,
            "email": email,
            "roles": roles,
            "exp": expire,
            "type": "access",
        }
        
        return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    
    @staticmethod
    def create_refresh_token(
        user_id: str,
        email: str,
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """Create refresh token."""
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
        
        payload = {
            "sub": user_id,
            "email": email,
            "exp": expire,
            "type": "refresh",
        }
        
        return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    
    @staticmethod
    def decode_token(token: str) -> TokenPayload:
        """Decode and validate token."""
        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=[settings.jwt_algorithm]
            )
            return TokenPayload(**payload)
        except jwt.ExpiredSignatureError:
            raise ValueError("Token has expired")
        except jwt.InvalidTokenError:
            raise ValueError("Invalid token")
    
    @staticmethod
    def verify_token_type(token_payload: TokenPayload, expected_type: str) -> bool:
        """Verify token type (access or refresh)."""
        return token_payload.type == expected_type


# Global instance
jwt_handler = JWTHandler()
