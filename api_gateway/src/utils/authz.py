"""Authorization helpers for route-based auth checks."""
import re

from src.models import User


def has_any_role(user: User, roles: list[str]) -> bool:
    """Return True when the user has at least one of the given roles."""
    user_roles = set(user.get_role_names())
    return any(role in user_roles for role in roles)


def is_admin_only_route(method: str, path: str) -> bool:
    """Return True for routes restricted to admin users."""
    if path.startswith("/kb/") or path == "/kb":
        return True

    if path.startswith("/dashboard/ratings/stats/agent/"):
        return True

    if path == "/dashboard/pinned-posts/reorder":
        return True

    if path.startswith("/dashboard/pinned-posts/admin"):
        return True

    if path == "/dashboard/pinned-posts" and method == "POST":
        return True

    if path.startswith("/dashboard/pinned-posts/") and method in {"PUT", "DELETE", "PATCH"}:
        return True

    if path in {"/auth/revoke", "/auth/revoke-all"}:
        return True

    if path.startswith("/wayfinder/") and method != "GET":
        return True

    return False


def requires_ownership_check(path: str) -> tuple[bool, str | None]:
    """Return whether the route requires ownership and the resource id if present."""
    thread_match = re.match(r"^/threads/([^/]+)$", path)
    if thread_match:
        return True, thread_match.group(1)

    history_match = re.match(r"^/agent/history/([^/]+)$", path)
    if history_match:
        return True, history_match.group(1)

    return False, None