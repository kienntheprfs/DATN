from typing import List, Dict, Optional, Sequence
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update, desc, func
from sqlalchemy.orm import selectinload

from src.models.models import FAQ, FAQQuestionVariant, FAQSource


class FAQRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def count_all(self) -> int:
        """Get total count of all FAQs."""
        stmt = select(func.count(FAQ.id))
        result = await self.db.execute(stmt)
        return result.scalar_one() or 0

    async def create_batch_faqs(
        self, document_id: int, faq_data_list: List[Dict]
    ) -> int:
        """Ingestion: generated FAQs tied to a document (source=document)."""
        count = 0
        for data in faq_data_list:
            new_faq = FAQ(
                source=FAQSource.DOCUMENT,
                document_id=document_id,
                answer=data["answer"],
                meta_data=data.get("meta_data", {}),
            )
            self.db.add(new_faq)
            await self.db.flush()
            count += 1
            variants_objects = []
            for q_var in data["questions"]:
                variants_objects.append(
                    FAQQuestionVariant(
                        faq_id=new_faq.id,
                        question=q_var["question"],
                        embedding_id=q_var["embedding_id"],
                    )
                )
            if variants_objects:
                self.db.add_all(variants_objects)
        return count

    async def get_by_document_id(self, document_id: int) -> List[FAQ]:
        stmt = (
            select(FAQ)
            .options(selectinload(FAQ.questions))
            .where(FAQ.document_id == document_id)
            .where(FAQ.source == FAQSource.DOCUMENT)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def delete_generated_by_document_id(self, document_id: int) -> None:
        stmt = delete(FAQ).where(
            FAQ.document_id == document_id,
            FAQ.source == FAQSource.DOCUMENT,
        )
        await self.db.execute(stmt)

    # --- Manual FAQ (source=manual, document_id NULL) ---

    async def create_manual(
        self,
        answer: str,
        meta_data: Optional[dict],
        variants: List[Dict[str, str]],
    ) -> FAQ:
        """Create manual FAQ. Variants may be empty if the service fills them via replace_manual_variants."""
        faq = FAQ(
            source=FAQSource.MANUAL,
            document_id=None,
            answer=answer,
            meta_data=meta_data or {},
        )
        self.db.add(faq)
        await self.db.flush()
        for v in variants:
            self.db.add(
                FAQQuestionVariant(
                    faq_id=faq.id,
                    question=v["question"],
                    embedding_id=v["embedding_id"],
                )
            )
        if variants:
            await self.db.flush()
        return faq

    async def get_by_id(
        self, faq_id: int, source: Optional[FAQSource] = None
    ) -> Optional[FAQ]:
        stmt = select(FAQ).options(selectinload(FAQ.questions)).where(FAQ.id == faq_id)
        if source is not None:
            stmt = stmt.where(FAQ.source == source)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_manual(self, skip: int = 0, limit: int = 50) -> Sequence[FAQ]:
        stmt = (
            select(FAQ)
            .options(selectinload(FAQ.questions))
            .where(FAQ.source == FAQSource.MANUAL)
            .order_by(desc(FAQ.updated_at))
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def update_manual(
        self,
        faq_id: int,
        *,
        answer: Optional[str] = None,
        meta_data: Optional[dict] = None,
    ) -> Optional[FAQ]:
        values = {}
        if answer is not None:
            values["answer"] = answer
        if meta_data is not None:
            values["meta_data"] = meta_data
        if not values:
            stmt = (
                select(FAQ)
                .options(selectinload(FAQ.questions))
                .where(FAQ.id == faq_id)
                .where(FAQ.source == FAQSource.MANUAL)
            )
            result = await self.db.execute(stmt)
            return result.scalar_one_or_none()
        stmt = (
            update(FAQ)
            .where(FAQ.id == faq_id)
            .where(FAQ.source == FAQSource.MANUAL)
            .values(**values)
            .returning(FAQ.id)
        )
        res = await self.db.execute(stmt)
        await self.db.flush()
        if res.scalar_one_or_none() is None:
            return None
        return await self.get_by_id(faq_id, source=FAQSource.MANUAL)

    async def replace_manual_variants(
        self, faq_id: int, variants: List[Dict[str, str]]
    ) -> None:
        await self.db.execute(
            delete(FAQQuestionVariant).where(FAQQuestionVariant.faq_id == faq_id)
        )
        for v in variants:
            self.db.add(
                FAQQuestionVariant(
                    faq_id=faq_id,
                    question=v["question"],
                    embedding_id=v["embedding_id"],
                )
            )
        await self.db.flush()

    async def delete_manual(self, faq_id: int) -> bool:
        stmt = delete(FAQ).where(FAQ.id == faq_id).where(FAQ.source == FAQSource.MANUAL)
        result = await self.db.execute(stmt)
        return result.rowcount > 0

    async def list_embedding_ids_for_faq(self, faq_id: int) -> List[str]:
            stmt = select(FAQQuestionVariant.embedding_id).where(
                FAQQuestionVariant.faq_id == faq_id
            )
            result = await self.db.execute(stmt)
            return [row[0] for row in result.all()]

    # --- Unified CRUD (all sources) ---

    async def list_all(self, skip: int = 0, limit: int = 50) -> Sequence[FAQ]:
        """List all FAQs (manual + document) with pagination."""
        stmt = (
            select(FAQ)
            .options(selectinload(FAQ.questions))
            .order_by(desc(FAQ.updated_at))
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get(self, faq_id: int) -> Optional[FAQ]:
        """Get FAQ by ID (any source)."""
        stmt = select(FAQ).options(selectinload(FAQ.questions)).where(FAQ.id == faq_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def update(
        self,
        faq_id: int,
        *,
        answer: Optional[str] = None,
        meta_data: Optional[dict] = None,
    ) -> Optional[FAQ]:
        """Update FAQ (any source)."""
        values = {}
        if answer is not None:
            values["answer"] = answer
        if meta_data is not None:
            values["meta_data"] = meta_data
        if not values:
            return await self.get(faq_id)
        stmt = (
            update(FAQ)
            .where(FAQ.id == faq_id)
            .values(**values)
            .returning(FAQ.id)
        )
        res = await self.db.execute(stmt)
        await self.db.flush()
        if res.scalar_one_or_none() is None:
            return None
        return await self.get(faq_id)

    async def delete(self, faq_id: int) -> bool:
        """Delete FAQ by ID (any source). Also deletes associated question variants."""
        stmt = delete(FAQ).where(FAQ.id == faq_id)
        result = await self.db.execute(stmt)
        return result.rowcount > 0
