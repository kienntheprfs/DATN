from __future__ import annotations

from typing import Any, Optional, BinaryIO

import httpx

from src.core.config import settings


class LightRAGService:
    def __init__(self):
        self.base_url = (settings.LIGHTRAG_BASE_URL or "").rstrip("/")
        self.api_key = settings.LIGHTRAG_API_KEY
        self.upload_path = settings.LIGHTRAG_UPLOAD_PATH
        self.track_path = settings.LIGHTRAG_TRACK_PATH
        self.delete_path = settings.LIGHTRAG_DELETE_PATH

    @property
    def enabled(self) -> bool:
        return bool(self.base_url)

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        return headers

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    async def upload_document(
        self,
        filename: str,
        file_obj: BinaryIO,
        content_type: str = "application/octet-stream",
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                self._url(self.upload_path),
                files={"file": (filename, file_obj, content_type)},
                headers=self._headers(),
            )
            response.raise_for_status()
            return response.json()

    async def get_track_result(self, track_id: str) -> dict[str, Any]:
        path = self.track_path.format(track_id=track_id)
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(self._url(path), headers=self._headers())
            response.raise_for_status()
            return response.json()

    async def delete_document(self, doc_id: str) -> Optional[dict[str, Any]]:
        path = self.delete_path
        payload = {
            "doc_ids": [doc_id],
            "delete_file": False,
            "delete_llm_cache": False,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                "DELETE",
                self._url(path),
                headers=self._headers(),
                json=payload,
            )
            if response.status_code == 204:
                return None
            response.raise_for_status()
            if response.content:
                return response.json()
            return None

