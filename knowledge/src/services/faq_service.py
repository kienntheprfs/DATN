from __future__ import annotations

import logging
import uuid
from typing import List

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.vector_db_setup import QdrantManager
from src.models.models import FAQSource
from src.repositories.faq_repository import FAQRepository
from src.schemas.faq import ManualFAQCreate, ManualFAQUpdate
from src.services.ingestion import IngestionService
from src.services.vector_db import VectorDBService

logger = logging.getLogger(__name__)


class FAQService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = FAQRepository(db)

    async def _faq_vector_service(self) -> VectorDBService:
        svc = VectorDBService(QdrantManager.get_client(), settings.FAQ_COLLECTION_NAME)
        await svc.ensure_hybrid_collection()
        return svc

    async def list_manual(self, skip: int = 0, limit: int = 50) -> List:
        return list(await self.repo.list_manual(skip=skip, limit=limit))

    async def get_manual(self, faq_id: int):
        faq = await self.repo.get_by_id(faq_id, source=FAQSource.MANUAL)
        if not faq:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found")
        return faq

    async def create_manual(self, payload: ManualFAQCreate):
        ingestion = IngestionService()
        vec = await self._faq_vector_service()

        texts = [q.strip() for q in payload.questions if q and q.strip()]
        if not texts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one non-empty question is required",
            )

        embeddings = await ingestion.embed_hybrid_batch(texts)
        point_ids = [str(uuid.uuid4()) for _ in texts]

        faq = await self.repo.create_manual(
            answer=payload.answer,
            meta_data=payload.meta_data,
            variants=[],  # populated after vectors
        )
        await self.db.flush()

        points = []
        variants = []
        for i, qtext in enumerate(texts):
            pid = point_ids[i]
            variants.append({"question": qtext, "embedding_id": pid})
            points.append(
                {
                    "id": pid,
                    "dense": embeddings[i]["dense"],
                    "sparse": embeddings[i]["sparse"],
                    "payload": {
                        "content": qtext,
                        "answer_preview": payload.answer[:300],
                        "type": "faq",
                        "faq_source": "manual",
                        "faq_id": faq.id,
                    },
                }
            )

        await vec.upsert_faq_batch(points)
        await self.repo.replace_manual_variants(faq.id, variants)

        await self.db.commit()
        await self.db.refresh(faq)
        return await self.repo.get_by_id(faq.id, source=FAQSource.MANUAL)

    async def update_manual(self, faq_id: int, payload: ManualFAQUpdate):
        faq = await self.repo.get_by_id(faq_id, source=FAQSource.MANUAL)
        if not faq:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found")

        if (
            payload.questions is None
            and payload.answer is None
            and payload.meta_data is None
        ):
            return faq

        vec = await self._faq_vector_service()

        if payload.questions is not None:
            texts = [q.strip() for q in payload.questions if q and q.strip()]
            if not texts:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="At least one non-empty question is required",
                )
            old_ids = await self.repo.list_embedding_ids_for_faq(faq_id)
            await vec.delete_points_by_ids(old_ids)

            ingestion = IngestionService()
            embeddings = await ingestion.embed_hybrid_batch(texts)
            point_ids = [str(uuid.uuid4()) for _ in texts]

            answer = payload.answer if payload.answer is not None else faq.answer
            points = []
            variants = []
            for i, qtext in enumerate(texts):
                pid = point_ids[i]
                variants.append({"question": qtext, "embedding_id": pid})
                points.append(
                    {
                        "id": pid,
                        "dense": embeddings[i]["dense"],
                        "sparse": embeddings[i]["sparse"],
                        "payload": {
                            "content": qtext,
                            "answer_preview": answer[:300],
                            "type": "faq",
                            "faq_source": "manual",
                            "faq_id": faq.id,
                        },
                    }
                )
            await vec.upsert_faq_batch(points)
            await self.repo.replace_manual_variants(faq_id, variants)
        elif payload.answer is not None and faq.questions:
            old_ids = await self.repo.list_embedding_ids_for_faq(faq_id)
            await vec.delete_points_by_ids(old_ids)
            texts = [v.question for v in faq.questions]
            ingestion = IngestionService()
            embeddings = await ingestion.embed_hybrid_batch(texts)
            variants = []
            points = []
            for i, qtext in enumerate(texts):
                pid = str(uuid.uuid4())
                variants.append({"question": qtext, "embedding_id": pid})
                points.append(
                    {
                        "id": pid,
                        "dense": embeddings[i]["dense"],
                        "sparse": embeddings[i]["sparse"],
                        "payload": {
                            "content": qtext,
                            "answer_preview": payload.answer[:300],
                            "type": "faq",
                            "faq_source": "manual",
                            "faq_id": faq.id,
                        },
                    }
                )
            await vec.upsert_faq_batch(points)
            await self.repo.replace_manual_variants(faq_id, variants)

        if payload.answer is not None or payload.meta_data is not None:
            await self.repo.update_manual(
                faq_id,
                answer=payload.answer,
                meta_data=payload.meta_data,
            )

        await self.db.commit()
        return await self.repo.get_by_id(faq_id, source=FAQSource.MANUAL)

    async def delete_manual(self, faq_id: int) -> None:
        faq = await self.repo.get_by_id(faq_id, source=FAQSource.MANUAL)
        if not faq:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found")

        vec = await self._faq_vector_service()
        ids = await self.repo.list_embedding_ids_for_faq(faq_id)
        await vec.delete_points_by_ids(ids)
        await self.repo.delete_manual(faq_id)
        await self.db.commit()
