import logging
from typing import List, Any
from qdrant_client import AsyncQdrantClient, models

logger = logging.getLogger(__name__)

class QdrantTransaction:
    """
    Context Manager quản lý transaction cho Qdrant.
    Cơ chế: "Best Effort" - Lưu snapshot trước khi xóa/ghi đè để rollback.
    """
    def __init__(self, client: AsyncQdrantClient, collection_name: str):
        self.client = client
        self.collection_name = collection_name
        self._upserted_ids: List[Any] = []  # Theo dõi các ID mới thêm vào
        self._backup_points: List[models.PointStruct] = [] # Backup các point bị xóa

    async def __aenter__(self):
        """Bắt đầu transaction"""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Kết thúc transaction: Tự động Rollback nếu có lỗi"""
        if exc_type:
            logger.error(f"Transaction failed with error: {exc_val}. Rolling back Qdrant...")
            await self.rollback()
            return False # Propagate exception ra ngoài
        
        # Nếu không lỗi -> Commit (thực ra là không làm gì vì đã upsert thật rồi)
        logger.info("Transaction committed successfully.")
        return True

    def track_upsert(self, point_ids: List[str]):
        """Ghi nhận các ID vừa được upsert để xóa nếu cần rollback"""
        self._upserted_ids.extend(point_ids)

    async def delete_with_backup(self, doc_id: int):
        """
        Xóa document nhưng lưu backup vào RAM để rollback.
        Payload từ ingestion dùng key `doc_id`.
        """
        # 1. Tìm các point sắp bị xóa
        scroll_result, _ = await self.client.scroll(
            collection_name=self.collection_name,
            scroll_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="doc_id",
                        match=models.MatchValue(value=doc_id),
                    )
                ]
            ),
            with_payload=True,
            with_vectors=True,
            limit=10000 # Cẩn thận với RAM nếu quá nhiều
        )

        if scroll_result:
            # 2. Lưu vào backup
            for point in scroll_result:
                self._backup_points.append(
                    models.PointStruct(
                        id=point.id,
                        vector=point.vector,
                        payload=point.payload
                    )
                )
            
            # 3. Xóa thật
            await self.client.delete(
                collection_name=self.collection_name,
                points_selector=models.PointIdsList(points=[p.id for p in scroll_result]),
                wait=True
            )

    async def rollback(self):
        """Khôi phục trạng thái cũ"""
        # 1. Xóa các point mới thêm vào (Undo Upsert)
        if self._upserted_ids:
            await self.client.delete(
                collection_name=self.collection_name,
                points_selector=models.PointIdsList(points=self._upserted_ids),
                wait=True
            )
            logger.info(f"Rolled back: Deleted {len(self._upserted_ids)} new points.")

        # 2. Khôi phục các point đã bị xóa (Undo Delete)
        if self._backup_points:
            await self.client.upsert(
                collection_name=self.collection_name,
                points=self._backup_points,
                wait=True
            )
            logger.info(f"Rolled back: Restored {len(self._backup_points)} deleted points.")