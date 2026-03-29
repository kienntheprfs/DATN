"""Password hashing utilities."""
import bcrypt


class PasswordHandler:
    """Password hashing and verification."""
    
    MAX_PASSWORD_BYTES = 72
    
    @staticmethod
    def _truncate(password: str) -> bytes:
        """Truncate password to 72 bytes (bcrypt limit)."""
        return password.encode("utf-8")[:PasswordHandler.MAX_PASSWORD_BYTES]
    
    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password using bcrypt."""
        truncated = PasswordHandler._truncate(password)
        return bcrypt.hashpw(truncated, bcrypt.gensalt()).decode("utf-8")
    
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify a password against a hash."""
        truncated = PasswordHandler._truncate(plain_password)
        return bcrypt.checkpw(truncated, hashed_password.encode("utf-8"))


# Global instance
password_handler = PasswordHandler()
