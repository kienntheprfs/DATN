import time
import os
from pydantic import BaseModel
from core.settings import settings

from qdrant_client import QdrantClient
from qdrant_client.http import models
from qdrant_client.http.models import (
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue
)

class Payload(BaseModel):
    doc_id: int
    doc_type: str

class QdrantConnection:
    _instance = None
    _collections_cache = None  # cache danh sách collection

    def __new__(cls, url, api_key):
        if cls._instance is None:
            cls._instance = super(QdrantConnection, cls).__new__(cls)
            cls._instance.client = QdrantClient(url=url, api_key=api_key, timeout=100)
            
            # env = os.getenv("ENV", "dev")
            # if env == "dev":
            #     if not url or not api_key:
            #         raise ValueError("Dev environment requires QDRANT_URL and QDRANT_API_KEY")
            #     cls._instance.client = QdrantClient(url=url, api_key=api_key, timeout=100)
            # else:

            #     cls._instance.client = QdrantClient(host="qdrant", port=6333)

        return cls._instance

    def get_client(self):
        return self.client

    def get_collections_cache(self):
        """Lấy danh sách collection (cache)"""
        if self._collections_cache is None:
            self.refresh_collections_cache()
        return self._collections_cache

    def refresh_collections_cache(self):
        """Gọi API thật để cập nhật cache"""
        resp = self.client.get_collections().collections
        self._collections_cache = [c.name for c in resp]
        return self._collections_cache

    def add_to_cache(self, name: str):
        """Cập nhật cache khi tạo mới"""
        if self._collections_cache is None:
            self.refresh_collections_cache()
        if name not in self._collections_cache:
            self._collections_cache.append(name)


class VectorStore:
    def __init__(self, collection_name, dense_dim: int | None = None, batch_size=50):
        self.collection_name = collection_name
        self.batch_size = batch_size
        
        # Lấy client từ singleton
        api_key = settings.QDRANT_API_KEY
        url = settings.QDRANT_URL
        self.client = QdrantConnection(url, api_key).get_client()
        
        # Tên vector quy định trong Qdrant
        self.DENSE_VECTOR_NAME = "dense_vec"
        self.SPARSE_VECTOR_NAME = "sparse_vec"

        self.init_collection(dense_dim)

    def init_collection(self, dense_dim: int | None):
        """Tạo collection hỗ trợ cả Dense và Sparse vector"""
        if self.collection_name not in QdrantConnection._instance.get_collections_cache():
            if dense_dim is None:
                raise ValueError(f"Collection '{self.collection_name}' chưa tồn tại, cần dim để tạo mới!")

            self.client.create_collection(
            collection_name=self.collection_name,
            # 1. Config Dense có tên "dense_vec"
            vectors_config={
                "dense_vec": models.VectorParams(size=dense_dim, distance=models.Distance.COSINE)
            },
            # 2. Config Sparse có tên "sparse_vec"
            sparse_vectors_config={
                "sparse_vec": models.SparseVectorParams(
                    index=models.SparseIndexParams(on_disk=False)
                )
            }
        )
            
            QdrantConnection._instance.add_to_cache(name=self.collection_name)
            print(f"Collection '{self.collection_name}' created with Hybrid support.")

            # Tạo payload index (như cũ)
            self.client.create_payload_index(self.collection_name, "doc_id", models.PayloadSchemaType.INTEGER)
            self.client.create_payload_index(self.collection_name, "doc_type", models.PayloadSchemaType.KEYWORD)
        else:
            # Optional: Logic kiểm tra xem collection cũ có đủ config sparse chưa (bỏ qua cho gọn)
            print(f"Collection '{self.collection_name}' already exists")

    def upsert(self, dense_vectors, sparse_vectors, ids, payloads):
        """
        Upsert hỗ trợ cả 2 loại vector.
        sparse_vectors: List[models.SparseVector] (Gồm indices và values)
        """
        return self.upsert_with_retry(dense_vectors, sparse_vectors, ids, payloads, self.batch_size)

    def upsert_with_retry(self, dense_vectors, sparse_vectors, ids, payloads, batch_size=50, max_retries=3):
        total = len(dense_vectors)
        
        # Validate độ dài
        if not (len(dense_vectors) == len(sparse_vectors) == len(ids) == len(payloads)):
             raise ValueError("Length of dense_vectors, sparse_vectors, ids, and payloads must match.")

        for i in range(0, total, batch_size):
            end_idx = min(i + batch_size, total)
            
            # Slice batch
            b_dense = dense_vectors[i:end_idx]
            b_sparse = sparse_vectors[i:end_idx]
            b_ids = ids[i:end_idx]
            b_payloads = payloads[i:end_idx]
            
            points = [
                PointStruct(
                    id=b_ids[j],
                    # Named Vector: Map tên vector với giá trị
                    vector={
                        self.DENSE_VECTOR_NAME: b_dense[j],
                        self.SPARSE_VECTOR_NAME: b_sparse[j]
                    },
                    payload=b_payloads[j],
                )
                for j in range(len(b_dense))
            ]
            
            # Logic Retry (Giữ nguyên logic cũ của bạn nhưng rút gọn code hiển thị ở đây)
            for retry in range(max_retries):
                try:
                    self.client.upsert(collection_name=self.collection_name, points=points, wait=True)
                    print(f"Upserted batch {i//batch_size + 1}")
                    break
                except Exception as e:
                    print(f"Retry {retry+1} failed: {e}")
                    time.sleep(1)
                    if retry == max_retries - 1: raise e

    # --- CÁC CHIẾN LƯỢC TÌM KIẾM ---

    def search_hybrid(self, query_dense, query_sparse, top_k=5, filter=None, strategy="rrf", alpha=0.5):
        """
        Dùng 100% query_points API để tránh lỗi validation của hàm search cũ.
        """
        
        # --- CHIẾN LƯỢC 1: RRF (Khuyên dùng) ---
        # Qdrant tự gộp kết quả trên Server. Nhanh, gọn, 1 request.
        if strategy == "rrf":
            prefetch = [
                # Tìm Dense
                models.Prefetch(
                    query=query_dense,  # Truyền thẳng list[float], ko cần bọc NamedVector
                    using=self.DENSE_VECTOR_NAME,
                    limit=top_k * 2,
                ),
                # Tìm Sparse
                models.Prefetch(
                    query=query_sparse, # Truyền thẳng models.SparseVector, query_points tự hiểu
                    using=self.SPARSE_VECTOR_NAME,
                    limit=top_k * 2,
                ),
            ]
            
            # Gửi 1 lệnh duy nhất lên server
            response = self.client.query_points(
                collection_name=self.collection_name,
                prefetch=prefetch,
                query=models.FusionQuery(fusion=models.Fusion.RRF), # Server tự tính RRF
                limit=top_k,
                with_payload=True
            )
            return response.points

        # --- CHIẾN LƯỢC 2: WEIGHTED SUM (Cộng có trọng số) ---
        # Vì API server chưa hỗ trợ chỉnh alpha trực tiếp, ta dùng query_points để lấy dữ liệu
        # rồi cộng tay. Cách này an toàn hơn dùng hàm search() cũ.
        elif strategy == "weighted":
            # 1. Lấy kết quả Dense bằng query_points
            resp_dense = self.client.query_points(
                collection_name=self.collection_name,
                query=query_dense,      # Input chuẩn: list[float]
                using=self.DENSE_VECTOR_NAME,
                limit=top_k * 2,
                with_payload=True
            )

            # 2. Lấy kết quả Sparse bằng query_points
            resp_sparse = self.client.query_points(
                collection_name=self.collection_name,
                query=query_sparse,     # Input chuẩn: models.SparseVector
                using=self.SPARSE_VECTOR_NAME,
                limit=top_k * 2,
                with_payload=True
            )
            
            # 3. Cộng điểm thủ công (đã viết ở bước trước)
            return self._weighted_fusion(resp_dense.points, resp_sparse.points, top_k, alpha)

        else:
            raise ValueError(f"Unknown strategy: {strategy}")


    def _weighted_fusion(self, list_a, list_b, limit, alpha):
        """
        Weighted Sum: Score = alpha * score_dense + (1 - alpha) * score_sparse
        LƯU Ý: Cần normalize score nếu score dense và sparse chênh lệch quá lớn.
        Ở đây là implement đơn giản.
        """
        scores = {}
        point_map = {}

        for p in list_a:
            scores[p.id] = scores.get(p.id, 0) + (p.score * alpha)
            point_map[p.id] = p
            
        for p in list_b:
            scores[p.id] = scores.get(p.id, 0) + (p.score * (1 - alpha))
            if p.id not in point_map: point_map[p.id] = p

        sorted_ids = sorted(scores.items(), key=lambda item: item[1], reverse=True)[:limit]
        
        results = []
        for pid, score in sorted_ids:
            p = point_map[pid]
            p.score = score
            results.append(p)
        return results

    def delete_by_doc(self, doc_id, doc_type):
        """Xóa toàn bộ vector thuộc doc_id và doc_type"""
        self.client.delete(
            collection_name=self.collection_name,
            points_selector=Filter(
                must=[
                    FieldCondition(key="doc_id", match=MatchValue(value=doc_id)),
                    FieldCondition(key="doc_type", match=MatchValue(value=doc_type)),
                ]
            ),
        )
        print(f"Deleted vectors with doc_id={doc_id}, doc_type={doc_type}")

    def count_points(self) -> int:
        """Lấy số lượng point hiện có trong collection"""
        result = self.client.count(
            collection_name=self.collection_name,
            exact=True  # exact=True để trả về con số chính xác
        )
        return result.count


class VectorStoreTransaction:

    def __init__(self, vector_store):
        self.store = vector_store
        self._added_points = [] 
        self._deleted_points = []
        self._committed = False

    # Nhận thêm tham số sparse_vectors
    def upsert(self, dense_vectors, sparse_vectors, ids, payloads):
        if self._committed: return

        points = [
            models.PointStruct(
                id=ids[i],
                # Map đúng tên vector đã config
                vector={
                    "dense_vec": dense_vectors[i],   # Phải là List[float]
                    "sparse_vec": sparse_vectors[i]  # Phải là models.SparseVector
                },
                payload=payloads[i]
            )
            for i in range(len(ids))
        ]
        
        self.store.client.upsert(
            collection_name=self.store.collection_name,
            points=points,
            wait=True
        )
        self._added_points.extend(points)

    def delete_by_doc(self, doc_id, doc_type):
        """Delete và ghi log (lưu vector bị xóa)"""
        
        if self._committed:
            print("Transaction commited, please start new transaction!")
            return
        
        # Lưu lại vectors trước khi xóa để rollback được
        results, _ = self.store.client.scroll(
            collection_name=self.store.collection_name,
            scroll_filter=Filter(
                must=[
                    FieldCondition(key="doc_id", match=MatchValue(value=doc_id)),
                    FieldCondition(key="doc_type", match=MatchValue(value=doc_type)),
                ]
            ),
            limit=1000,
            with_payload=True,
            with_vectors=True,
        )
        if results:
            self._deleted_points.extend(results)
            self.store.delete_by_doc(doc_id, doc_type)
            print(f"Deleted {len(results)} points (saved for rollback).")
        else:
            print("No points found to delete.")

    def commit(self):
        self._added_points.clear()
        self._deleted_points.clear()
        self._committed = True
        print("✅ Transaction committed.")

    def rollback(self):
        if self._committed:
            print("⚠️ Transaction already committed, cannot rollback.")
            return

        # Hủy bỏ các upsert mới
        if self._added_points:
            ids = [p.id for p in self._added_points]
            self.store.client.delete(
                collection_name=self.store.collection_name,
                points_selector=models.PointIdsList(points=ids)
            )
            print(f"Rolled back {len(ids)} upserted points (deleted).")

        # Khôi phục lại các vector bị xóa
        if self._deleted_points:
            # ✅ convert Record → PointStruct
            restore_points = [
                PointStruct(
                    id=p.id,
                    vector=p.vector,
                    payload=p.payload
                )
                for p in self._deleted_points
            ]

            self.store.client.upsert(
                collection_name=self.store.collection_name,
                points=restore_points,
                wait=True
            )
            print(f"Restored {len(restore_points)} deleted points.")

        self._added_points.clear()
        self._deleted_points.clear()
        print("↩️ Transaction rolled back.")
