# src/repositories/faq_repository.py
from typing import List, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from src.models.models import FAQ, FAQQuestionVariant

class FAQRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_batch_faqs(self, version_id: int, faq_data_list: List[Dict]) -> int:
        """
        Tạo hàng loạt FAQ và các câu hỏi biến thể (Variants) của chúng.
        Sử dụng session.flush() để lấy ID cha gán cho con mà không cần commit sớm.
        
        Input structure:
        [
            {
                "answer": "...",
                "meta_data": {...},
                "questions": [
                    {"question": "...", "embedding_id": "..."},
                    ...
                ]
            },
            ...
        ]
        Returns: Số lượng FAQ cha đã tạo.
        """
        count = 0
        for data in faq_data_list:
            # 1. Tạo FAQ Parent
            new_faq = FAQ(
                document_version_id=version_id,
                answer=data["answer"],
                meta_data=data.get("meta_data", {})
            )
            self.db.add(new_faq)
            
            # QUAN TRỌNG: Flush để DB sinh ID cho new_faq ngay lập tức
            # (nhưng vẫn nằm trong transaction, chưa commit hẳn ra ngoài)
            await self.db.flush() 
            
            count += 1

            # 2. Tạo Variants (Children) linked với FAQ Parent
            variants_objects = []
            for q_var in data["questions"]:
                variants_objects.append(FAQQuestionVariant(
                    faq_id=new_faq.id, # Lấy ID vừa flush
                    question=q_var["question"],
                    embedding_id=q_var["embedding_id"]
                ))
            
            if variants_objects:
                self.db.add_all(variants_objects)
        
        # Lưu ý: Repository thường không commit(), để Service/Task quản lý transaction.
        # Nhưng nếu bạn muốn repo tự chủ (Unit of Work nhỏ), có thể commit ở đây.
        # Ở đây tôi KHÔNG commit để Celery task quyết định lúc nào xong hết mới commit.
        return count

    async def get_by_version_id(self, version_id: int) -> List[FAQ]:
        """
        Lấy tất cả FAQ của 1 version (kèm theo variants).
        Dùng cho việc xem lại hoặc kiểm tra.
        """
        stmt = (
            select(FAQ)
            .options(selectinload(FAQ.questions)) # Eager load variants
            .where(FAQ.document_version_id == version_id)
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def delete_by_version_id(self, version_id: int):
        """
        SAGA ROLLBACK: Xóa sạch FAQ của version này nếu pipeline lỗi.
        Do cấu hình Cascade Delete trong models.py, xóa FAQ cha thì Variants tự bay màu.
        """
        stmt = delete(FAQ).where(FAQ.document_version_id == version_id)
        await self.db.execute(stmt)