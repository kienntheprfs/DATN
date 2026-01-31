"""OPA policy service."""
import httpx
from typing import Dict, Any, Optional
from src.config import settings


class OPAService:
    """OPA policy decision service."""
    
    @staticmethod
    async def check_policy(
        user_id: str,
        user_roles: list[str],
        resource_type: str,
        resource_id: str,
        action: str,
        owner_id: Optional[str] = None
    ) -> bool:
        """
        Check authorization using OPA policy engine.
        
        Args:
            user_id: User ID
            user_roles: List of user roles
            resource_type: Type of resource (e.g., "thread", "document")
            resource_id: Resource ID
            action: Action to perform (e.g., "read", "write", "invoke")
            owner_id: Optional owner ID of the resource
            
        Returns:
            True if authorized, False otherwise
        """
        input_data = {
            "input": {
                "user": {
                    "id": user_id,
                    "roles": user_roles,
                },
                "resource": {
                    "type": resource_type,
                    "id": resource_id,
                    "owner_id": owner_id,
                },
                "action": action,
            }
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{settings.opa_url}{settings.opa_policy_path}",
                    json=input_data,
                    timeout=5.0
                )
                
                if response.status_code == 200:
                    result = response.json()
                    return result.get("result", {}).get("allow", False)
                else:
                    # If OPA is unavailable, deny by default
                    return False
        except Exception as e:
            # Log error and deny by default
            print(f"OPA error: {e}")
            return False


# Global instance
opa_service = OPAService()
