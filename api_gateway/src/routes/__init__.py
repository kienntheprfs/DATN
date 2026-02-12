"""Routes package."""
from src.routes import auth, agent_proxy, knowledge_proxy, wayfinder_proxy, threads

__all__ = [
    "auth",
    "agent_proxy",
    "knowledge_proxy",
    "wayfinder_proxy",
    "threads",
]
