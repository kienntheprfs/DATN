"""Utilities for building headers forwarded to downstream services."""

from typing import Any
from fastapi import Request

from src.config import settings


def build_downstream_headers(request: Request, user: Any | None = None) -> dict[str, str]:
    """Build sanitized downstream headers with internal auth and optional user context."""
    headers = dict(request.headers)
    headers.pop("host", None)
    headers["X-Internal-Secret"] = settings.internal_secret

    if user is None:
        user = getattr(request.state, "user", None)

    if user is not None:
        user_id = getattr(user, "id", None)
        user_email = getattr(user, "email", None)
        user_roles = getattr(user, "roles", None) or []

        if user_id:
            headers["X-User-Id"] = str(user_id)
        if user_email:
            headers["X-User-Email"] = str(user_email)
        if user_roles:
            headers["X-User-Roles"] = ",".join(map(str, user_roles))

    return headers
