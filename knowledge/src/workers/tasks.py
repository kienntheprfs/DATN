import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, List, Tuple

from src.core.sql_db_setup import AsyncSessionLocal
from src.core.vector_db_setup import QdrantManager
from src.core.config import settings
from src.core.transaction import QdrantTransaction
from src.models.models import ProcessingStatus
from src.services.ingestion import IngestionService
from src.services.vector_db import VectorDBService
from src.repositories.document_repository import DocumentRepository
from src.services.file_storage import get_storage
from src.services.semantic_cache_notifier import semantic_cache_notifier

logger = logging.getLogger(__name__)


async def process_batch_safe(
    batch_chunks: list[dict],
    document_id: int,
    ingestion_svc: IngestionService,
    vector_svc: VectorDBService,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    try:
        texts = [c["text"] for c in batch_chunks]
        embeddings_data = await ingestion_svc.embed_hybrid_batch(texts)

        points_data = []
        for i, chunk_data in enumerate(batch_chunks):
            points_data.append(
                {
                    "dense": embeddings_data[i]["dense"],
                    "sparse": embeddings_data[i]["sparse"],
                    "payload": {
                        "content": chunk_data["text"],
                        "doc_id": document_id,
                        "chunk_index": chunk_data["index"],
                        "type": "chunk",
                        "metadata": chunk_data.get("metadata", {}),
                    },
                }
            )

        new_point_ids = await vector_svc.upsert_hybrid_batch(points_data)

        pg_rows = []
        for i, point_id in enumerate(new_point_ids):
            pg_rows.append(
                {
                    "document_id": document_id,
                    "chunk_index": batch_chunks[i]["index"],
                    "content": batch_chunks[i]["text"],
                    "embedding_id": point_id,
                    "chunk_metadata": {"length": len(batch_chunks[i]["text"])},
                }
            )

        return pg_rows, new_point_ids

    except Exception as e:
        logger.error(f"Error processing batch for document {document_id}: {str(e)}")
        raise e


async def batch_worker(
    name: str,
    queue: asyncio.Queue,
    document_id: int,
    ingestion: IngestionService,
    vector_db: VectorDBService,
    results: list,
    errors: list,
):
    while True:
        batch = await queue.get()
        if batch is None:
            queue.task_done()
            break

        try:
            pg_chunks, qdrant_ids = await process_batch_safe(
                batch, document_id, ingestion, vector_db
            )
            results.append((pg_chunks, qdrant_ids))
        except Exception as e:
            logger.exception(f"[{name}] Batch failed")
            errors.append(e)
        finally:
            queue.task_done()


async def background_index_document(document_id: int):
    async with AsyncSessionLocal() as session:
        repo = DocumentRepository(session)
        storage = get_storage()
        doc_row = await repo.get_for_ingestion(document_id)
        if not doc_row:
            logger.error(f"Document {document_id} not found")
            return

        collection_name = f"kb_{doc_row.storage_id}"

        doc_row.processing_status = ProcessingStatus.PROCESSING
        doc_row.processing_started_at = datetime.now()
        await session.commit()
        file_path = doc_row.file_path
        doc_type = doc_row.document_type

    qdrant_client = QdrantManager.get_client()

    try:
        ingestion = IngestionService()
        vector_db = VectorDBService(qdrant_client, collection_name)

        await vector_db.ensure_hybrid_collection()

        logger.info(f"[Document {document_id}] Extracting...")

        async with storage.download_stream(file_path) as file_stream:
            raw_text = await asyncio.to_thread(
                ingestion.extract_text,
                file_stream=file_stream,
                doc_type=doc_type,
                filename=file_path,
            )

        if not raw_text or len(raw_text.strip()) == 0:
            raise ValueError("Document is empty or text could not be extracted")

        logger.info(f"[Document {document_id}] Chunking...")
        text_chunks = await ingestion.chunk_text_recursive(raw_text)

        if not text_chunks:
            raise RuntimeError("No chunks extracted")

        formatted_chunks = [{"text": text, "index": i} for i, text in enumerate(text_chunks)]

        batch_size = settings.BATCH_SIZE
        batches = [
            formatted_chunks[i : i + batch_size]
            for i in range(0, len(formatted_chunks), batch_size)
        ]

        logger.info(f"[Document {document_id}] Processing {len(batches)} batches...")

        async with QdrantTransaction(qdrant_client, collection_name) as trx:
            await trx.delete_with_backup(doc_id=document_id)

            queue: asyncio.Queue = asyncio.Queue()
            results: list = []
            errors: list = []

            for batch in batches:
                queue.put_nowait(batch)

            num_workers = settings.MAX_CONCURRENT_WORKERS
            for _ in range(num_workers):
                queue.put_nowait(None)

            workers = [
                asyncio.create_task(
                    batch_worker(
                        name=f"Worker-{i}",
                        queue=queue,
                        document_id=document_id,
                        ingestion=ingestion,
                        vector_db=vector_db,
                        results=results,
                        errors=errors,
                    )
                )
                for i in range(num_workers)
            ]

            await queue.join()
            await asyncio.gather(*workers)

            if errors:
                raise RuntimeError(f"Indexing failed with {len(errors)} batch errors.")

            all_pg_rows: List[Dict[str, Any]] = []
            all_qdrant_ids: List[str] = []

            for pg_list, q_ids in results:
                all_pg_rows.extend(pg_list)
                all_qdrant_ids.extend(q_ids)

            trx.track_upsert(all_qdrant_ids)

            async with AsyncSessionLocal() as db_session:
                doc_repo = DocumentRepository(db_session)
                await doc_repo.bulk_create_chunks(all_pg_rows)
                await doc_repo.update_processing_status(
                    document_id, ProcessingStatus.COMPLETED
                )
                await db_session.commit()

        logger.info(f"[Document {document_id}] DONE. Indexed {len(all_pg_rows)} chunks.")
        # Cache invalidation AFTER the KB is actually updated (vectors/chunks written).
        try:
            await semantic_cache_notifier.notify_kb_changed(
                namespace=collection_name,
                doc_ids=[str(document_id)],
            )
        except Exception as e:
            logger.warning("Failed to notify semantic cache invalidation: %s", e)

    except Exception as e:
        logger.exception(f"[Document {document_id}] FAILED")

        async with AsyncSessionLocal() as session:
            doc_repo = DocumentRepository(session)
            await doc_repo.update_processing_status(
                document_id,
                ProcessingStatus.FAILED,
                error_msg=str(e)[:1000],
            )
            await session.commit()


# ===============================

# import asyncio
# import logging
# from datetime import datetime
# from typing import List, Tuple

# from qdrant_client import AsyncQdrantClient

# from src.core.sql_db_setup import AsyncSessionLocal
# from src.core.vector_db_setup import QdrantManager
# from src.core.config import settings
# from src.core.transaction import QdrantTransaction
# from src.models.models import Chunk, ProcessingStatus, DocumentVersion
# from src.services.ingestion import IngestionService
# from src.services.vector_db import VectorDBService
# from src.repositories.document_repository import DocumentRepository

# logger = logging.getLogger(__name__)

# # SEMAPHORE: Giới hạn số lượng batch chạy embedding/upsert CÙNG LÚC.
# # Nếu user upload file 1000 trang -> 1000 chunks -> 50 batches.
# # Chỉ 5 batches được chạy song song tại 1 thời điểm. 
# # Các batches còn lại sẽ nằm chờ trong queue của asyncio.
# batch_semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_WORKERS)

# async def process_batch_safe(
#     batch_chunks: list[dict], 
#     version_id: int, 
#     document_id: int,
#     ingestion_svc: IngestionService,
#     vector_svc: VectorDBService
# ) -> Tuple[List[Chunk], List[str]]:
#     """
#     Xử lý 1 batch an toàn với Semaphore.
#     Flow: Embed (Hybrid) -> Upsert Qdrant -> Tạo PG Models
#     """
#     async with batch_semaphore:
#         try:
#             texts = [c["text"] for c in batch_chunks]
            
#             # 1. Hybrid Embedding (I/O Dense + CPU Sparse non-blocking)
#             embeddings_data = await ingestion_svc.embed_hybrid_batch(texts)
            
#             # 2. Prepare Payload
#             points_data = []
#             for i, chunk_data in enumerate(batch_chunks):
#                 points_data.append({
#                     "dense": embeddings_data[i]["dense"],
#                     "sparse": embeddings_data[i]["sparse"],
#                     "payload": {
#                         "content": chunk_data["text"],
#                         "document_id": document_id,
#                         "version_id": version_id,
#                         "chunk_index": chunk_data["index"],
#                         "metadata": chunk_data.get("metadata", {})
#                     }
#                 })

#             # 3. Upsert Qdrant (Trả về list UUIDs)
#             new_point_ids = await vector_svc.upsert_hybrid_batch(points_data)

#             # 4. Tạo Postgres Model Objects (Chưa save)
#             pg_chunks = []
#             for i, point_id in enumerate(new_point_ids):
#                 pg_chunks.append(Chunk(
#                     document_id=document_id,
#                     document_version_id=version_id,
#                     chunk_index=batch_chunks[i]["index"],
#                     content=batch_chunks[i]["text"],
#                     embedding_id=point_id,
#                     chunk_metadata={"length": len(batch_chunks[i]["text"])}
#                 ))
            
#             return pg_chunks, new_point_ids

#         except Exception as e:
#             # Log lỗi chi tiết để debug
#             logger.error(f"Error processing batch for version {version_id}: {str(e)}")
#             raise e
        
# async def batch_worker(
#     name: str,
#     queue: asyncio.Queue,
#     version_id: int,
#     document_id: int,
#     ingestion: IngestionService,
#     vector_db: VectorDBService,
#     results: list,
#     errors: list,
# ):
#     while True:
#         batch = await queue.get()
#         if batch is None:
#             queue.task_done()
#             break

#         try:
#             pg_chunks, qdrant_ids = await process_batch_safe(
#                 batch,
#                 version_id,
#                 document_id,
#                 ingestion,
#                 vector_db
#             )
#             results.append((pg_chunks, qdrant_ids))
#         except Exception as e:
#             logger.exception(f"[Worker {name}] Batch failed")
#             errors.append(e)
#         finally:
#             queue.task_done()

# async def background_index_document(version_id: int):
#     """
#     Background task production-grade:
#     - Tách DB / CPU / I/O rõ ràng
#     - Worker pool + queue
#     - Rollback vector DB nếu fail
#     """

#     # =========================
#     # PHASE 1 — PREPARE (DB)
#     # =========================
#     async with AsyncSessionLocal() as session:
#         repo = DocumentRepository(session)

#         version = await repo.get_version_with_details(version_id)
#         if not version:
#             logger.error(f"Version {version_id} not found")
#             return

#         document_id = version.document_id
#         collection_name = f"kb_{version.document.storage_id}"

#         version.processing_status = ProcessingStatus.PROCESSING
#         version.processing_started_at = datetime.now()
#         await session.commit()

#     # =========================
#     # PHASE 2 — PROCESSING
#     # =========================
#     qdrant_client = None
#     try:
#         ingestion = IngestionService()

#         qdrant_client = QdrantManager.get_client()

#         vector_db = VectorDBService(qdrant_client, collection_name)

#         # ---- Extract
#         logger.info(f"[Version {version_id}] Extracting content")
#         raw_text = ingestion.extract_text(
#             version.file_path,
#             version.document_type
#         )

#         # ---- Chunk
#         logger.info(f"[Version {version_id}] Chunking content")
#         text_chunks = await ingestion.chunk_text(raw_text)

#         if not text_chunks:
#             raise RuntimeError("No chunks extracted")

#         formatted_chunks = [
#             {"text": text, "index": i}
#             for i, text in enumerate(text_chunks)
#         ]

#         # ---- Create batches
#         batch_size = settings.BATCH_SIZE
#         batches = [
#             formatted_chunks[i:i + batch_size]
#             for i in range(0, len(formatted_chunks), batch_size)
#         ]

#         logger.info(
#             f"[Version {version_id}] "
#             f"{len(text_chunks)} chunks → {len(batches)} batches"
#         )

#         # =========================
#         # PHASE 2.5 — VECTOR TX
#         # =========================
#         async with QdrantTransaction(
#             qdrant_client,
#             collection_name
#         ) as trx:

#             # Clean old data
#             await trx.delete_with_backup(doc_id=document_id)

#             # ---- Worker pool
#             queue: asyncio.Queue = asyncio.Queue()
#             results: list = []
#             errors: list = []

#             # Push batches
#             for batch in batches:
#                 await queue.put(batch)

#             # Sentinel for workers
#             num_workers = settings.MAX_CONCURRENT_WORKERS
#             for _ in range(num_workers):
#                 await queue.put(None)

#             # Start workers
#             workers = [
#                 asyncio.create_task(
#                     batch_worker(
#                         name=f"W{i}",
#                         queue=queue,
#                         version_id=version_id,
#                         document_id=document_id,
#                         ingestion=ingestion,
#                         vector_db=vector_db,
#                         results=results,
#                         errors=errors,
#                     )
#                 )
#                 for i in range(num_workers)
#             ]

#             await queue.join()

#             # Ensure worker exit
#             for w in workers:
#                 await w

#             # ---- Error handling
#             if errors:
#                 raise RuntimeError(
#                     f"{len(errors)} batch(es) failed"
#                 )

#             # ---- Aggregate results
#             all_pg_chunks: List[Chunk] = []
#             all_qdrant_ids: List[str] = []

#             for pg_list, q_ids in results:
#                 all_pg_chunks.extend(pg_list)
#                 all_qdrant_ids.extend(q_ids)

#             trx.track_upsert(all_qdrant_ids)

#             # =========================
#             # PHASE 3 — SAVE DB
#             # =========================
#             async with AsyncSessionLocal() as db_session:
#                 db_session.add_all(all_pg_chunks)

#                 v_update = await db_session.get(
#                     DocumentVersion,
#                     version_id
#                 )
#                 v_update.processing_status = ProcessingStatus.COMPLETED
#                 v_update.processing_completed_at = datetime.now()

#                 await db_session.commit()

#         logger.info(
#             f"[Version {version_id}] SUCCESS — "
#             f"Indexed {len(all_pg_chunks)} chunks"
#         )

#     # =========================
#     # FAILURE HANDLING
#     # =========================
#     except Exception as e:
#         logger.exception(
#             f"[Version {version_id}] INDEXING FAILED"
#         )

#         async with AsyncSessionLocal() as session:
#             v = await session.get(DocumentVersion, version_id)
#             if v:
#                 v.processing_status = ProcessingStatus.FAILED
#                 v.processing_error = str(e)[:500]
#                 await session.commit()

#     finally:
#         # FIX: Đóng connection thủ công ở đây
#         if qdrant_client:
#             await qdrant_client.close()
# # async def background_index_document(version_id: int):
# #     """
# #     Orchestrator chính chạy trong Background Task.
# #     """
# #     # --- GIAI ĐOẠN 1: PREPARE (DB Interaction) ---
# #     async with AsyncSessionLocal() as session:
# #         doc_repo = DocumentRepository(session)
        
# #         # Hàm này bạn cần đảm bảo đã viết trong Repo (dùng joinedload)
# #         version = await doc_repo.get_version_with_details(version_id)
        
# #         if not version:
# #             logger.error(f"Version {version_id} not found.")
# #             return

# #         doc_id = version.document_id
# #         # Collection name theo Storage ID (Multi-tenancy đơn giản)
# #         collection_name = f"kb_{version.document.storage_id}"

# #         # Đánh dấu đang xử lý
# #         version.processing_status = ProcessingStatus.PROCESSING
# #         version.processing_started_at = datetime.now()
# #         await session.commit()
    
# #     # Đóng session DB ngay để nhả connection pool trong lúc làm việc nặng bên dưới

# #     try:
# #         # --- GIAI ĐOẠN 2: PROCESSING (CPU & I/O Heavy) ---
        
# #         # Init Services
# #         # IngestionService là Singleton, init rất nhanh sau lần đầu
# #         ingestion = IngestionService()
        
# #         qdrant_client = AsyncQdrantClient(url=settings.QDRANT_URL, api_key=settings.QDRANT_API_KEY)
# #         vector_db = VectorDBService(qdrant_client, collection_name)

# #         # 1. Extract Text
# #         # extract_text có thể tốn CPU nếu file PDF lớn, nhưng tạm thời chạy sync cũng ổn
# #         # nếu muốn tối ưu hơn nữa thì bọc asyncio.to_thread như chunking
# #         logger.info(f"Extracting content for version {version_id}...")
# #         raw_text = ingestion.extract_text(version.file_path, version.document_type)

# #         # 2. Chunking (Đã cập nhật gọi hàm async chunk_text mới)
# #         logger.info(f"Chunking content (Recursive)...")
# #         # Hàm này giờ đã dùng asyncio.to_thread bên trong -> Non-blocking main thread
# #         text_chunks = await ingestion.chunk_text(raw_text)
        
# #         if not text_chunks:
# #             logger.warning(f"No chunks extracted for version {version_id}")
# #             # Có thể handle finish sớm ở đây
            
# #         # Format chunks kèm index
# #         formatted_chunks = [{"text": t, "index": i} for i, t in enumerate(text_chunks)]
        
# #         # Chia nhỏ thành các Batches
# #         batch_size = settings.BATCH_SIZE
# #         batches = [formatted_chunks[i:i + batch_size] for i in range(0, len(formatted_chunks), batch_size)]
        
# #         logger.info(f"Total: {len(text_chunks)} chunks -> {len(batches)} batches.")

# #         # 3. Distributed Transaction & Parallel Execution
# #         async with QdrantTransaction(qdrant_client, collection_name) as trx:
            
# #             # A. Clean data cũ (nếu re-index)
# #             await trx.delete_with_backup(doc_id=doc_id)

# #             # B. Execute Batches (Parallel)
# #             # Tạo list coroutines, chưa chạy ngay
# #             tasks = [
# #                 process_batch_safe(
# #                     batch, version_id, doc_id, ingestion, vector_db
# #                 )
# #                 for batch in batches
# #             ]
            
# #             # Chạy song song (được kiểm soát bởi semaphore)
# #             results = await asyncio.gather(*tasks)

# #             # C. Aggregate Results
# #             all_pg_chunks = []
# #             all_qdrant_ids = []
            
# #             for pg_list, q_ids in results:
# #                 all_pg_chunks.extend(pg_list)
# #                 all_qdrant_ids.extend(q_ids)

# #             # D. Track ID vào Transaction (Để rollback Qdrant nếu bước sau lỗi)
# #             trx.track_upsert(all_qdrant_ids)

# #             # --- GIAI ĐOẠN 3: SAVE & FINISH (DB Interaction) ---
# #             async with AsyncSessionLocal() as db_session:
# #                 doc_repo_new = DocumentRepository(db_session)
                
# #                 # Bulk Insert vào Postgres
# #                 # (Lưu ý: session.add_all rất nhanh, nhưng commit mới lâu)
# #                 db_session.add_all(all_pg_chunks)
                
# #                 # Update Status thành công
# #                 # Phải fetch lại object version vì đang ở session mới
# #                 v_update = await db_session.get(DocumentVersion, version_id)
# #                 v_update.processing_status = ProcessingStatus.COMPLETED
# #                 v_update.processing_completed_at = datetime.now()
                
# #                 # Commit Transaction DB
# #                 # Nếu lỗi tại đây -> Exception -> context 'trx' exit -> Qdrant Rollback
# #                 await db_session.commit()

# #         logger.info(f"Indexing SUCCESS for version {version_id}. Indexed {len(all_pg_chunks)} chunks.")

# #     except Exception as e:
# #         logger.exception(f"Indexing FAILED for version {version_id}")
        
# #         # Qdrant tự động rollback nhờ 'async with QdrantTransaction'
        
# #         # Ghi nhận lỗi vào DB
# #         async with AsyncSessionLocal() as err_session:
# #             v_err = await err_session.get(DocumentVersion, version_id)
# #             if v_err:
# #                 v_err.processing_status = ProcessingStatus.FAILED
# #                 v_err.processing_error = str(e)[:500] # Cắt ngắn lỗi nếu quá dài
# #                 await err_session.commit()