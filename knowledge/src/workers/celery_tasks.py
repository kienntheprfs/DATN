import asyncio
import logging
import uuid
from celery import chain, group, chord
from celery.exceptions import SoftTimeLimitExceeded
from src.core.celery_app import celery_app
from src.core.sql_db_setup import AsyncSessionLocal
from src.core.vector_db_setup import QdrantManager
from src.repositories.document_repository import DocumentRepository
from src.repositories.faq_repository import FAQRepository
from src.services.ingestion import IngestionService
from src.services.vector_db import VectorDBService
from src.services.file_storage import get_storage
from src.services.faq_gen import FAQGeneration
from src.models.models import ProcessingStatus, FAQ, FAQQuestionVariant
from src.core.config import settings

logger = logging.getLogger(__name__)

# Config Collection Name cho FAQ
FAQ_COLLECTION_NAME = settings.FAQ_COLLECTION_NAME

# --- UTILS ---
def run_async(coro):
    """Helper chạy async code an toàn bên trong Celery Worker Sync"""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)

# --- ERROR HANDLING (ISOLATED SAGA) ---

# 1. ERROR HANDLER CHO LUỒNG TÀI LIỆU (CRITICAL)
@celery_app.task(name="ingestion.on_doc_error")
def handle_doc_ingestion_error(request, exc, traceback, version_id, metadata: dict = None):
    """
    Nếu luồng này lỗi -> Document coi như hỏng.
    Hành động: Xóa sạch Chunk, Xóa Vector Chunk, Set Status = FAILED.
    """
    async def _rollback():
        logger.error(f"🚨 DOC PIPELINE FAILED v{version_id}: {exc}")
        async with AsyncSessionLocal() as db:
            repo = DocumentRepository(db)
            
            # 1. Xác định collection name của Doc
            collection_name = metadata.get("collection_name") if metadata else None
            if not collection_name:
                v = await repo.get_version_with_details(version_id)
                if v: collection_name = f"kb_{v.document.storage_id}"

            # 2. Xóa Data Vector (Chunk Only)
            if collection_name:
                try:
                    vec_svc = VectorDBService(QdrantManager.get_client(), collection_name)
                    # Lưu ý: Method này cần filter theo version_id trong payload
                    await vec_svc.delete_vectors_by_version(version_id) 
                except Exception as e:
                    logger.error(f"Failed to cleanup Qdrant chunks: {e}")

            # 3. Xóa Data Postgres (Chunks)
            await repo.cleanup_failed_version(version_id)

            # 4. Set Status FAILED
            await repo.update_version_status(
                version_id, 
                ProcessingStatus.FAILED, 
                error_msg=f"Doc Error: {str(exc)[:500]}"
            )
            await db.commit()
    
    return run_async(_rollback())

# 2. ERROR HANDLER CHO LUỒNG FAQ (OPTIONAL)
@celery_app.task(name="ingestion.on_faq_error")
def handle_faq_ingestion_error(request, exc, traceback, version_id, metadata: dict = None):
    """
    Nếu luồng này lỗi -> Chỉ xóa FAQ rác. Document gốc vẫn sống.
    Hành động: Xóa FAQ Vector, Xóa FAQ SQL, Log Warning.
    """
    async def _rollback():
        logger.warning(f"⚠️ FAQ PIPELINE FAILED v{version_id}: {exc}. Rolling back FAQs only.")
        async with AsyncSessionLocal() as db:
            # 1. Xóa Vector FAQ (Trong collection faqs)
            try:
                vec_svc = VectorDBService(QdrantManager.get_client(), FAQ_COLLECTION_NAME)
                await vec_svc.delete_vectors_by_version(version_id)
            except Exception as e:
                logger.error(f"Failed to cleanup FAQ vectors: {e}")

            # 2. Xóa FAQ Postgres
            try:
                await FAQRepository(db).delete_by_version_id(version_id)
            except Exception as e:
                logger.error(f"Failed to cleanup FAQ Postgres: {e}")
            
            await db.commit()

    return run_async(_rollback())


# --- MAIN TASKS (DOCUMENT FLOW) ---

@celery_app.task(
    bind=True, 
    name="ingestion.extract_and_chunk",
    autoretry_for=(Exception,),
    retry_kwargs={'max_retries': 3, 'countdown': 10},
    soft_time_limit=300
)
def extract_and_chunk(self, version_id: int):
    """Bước 1: Extract & Chunk (Common Step)"""
    async def _logic():
        async with AsyncSessionLocal() as db:
            repo = DocumentRepository(db)
            version = await repo.get_version_with_details(version_id)
            if not version: raise ValueError(f"Version {version_id} not found")

            await repo.update_version_status(version_id, ProcessingStatus.PROCESSING)
            await db.commit()
            
            storage = get_storage()
            ingestion = IngestionService()
            
            async with storage.download_stream(version.file_path) as stream:
                text = await asyncio.to_thread(
                    ingestion.extract_text, 
                    stream, version.document_type, version.file_path
                )
            
            if not text or not text.strip():
                raise ValueError("Extracted text is empty")

            chunks = await ingestion.chunk_text_recursive(text)
            
            return {
                "version_id": version_id,
                "document_id": version.document_id,
                "collection_name": f"kb_{version.document.storage_id}",
                "chunks": [{"text": t, "index": i} for i, t in enumerate(chunks)]
            }
    
    try:
        return run_async(_logic())
    except SoftTimeLimitExceeded:
        raise self.retry(exc=Exception("Timeout extracting file"), countdown=10)

@celery_app.task(
    bind=True, 
    name="ingestion.process_batch",
    rate_limit='50/m',
    autoretry_for=(Exception,),
    retry_kwargs={'max_retries': 5, 'countdown': 20}
)
def process_batch(self, batch_data: list, metadata: dict):
    """Bước 2A: Embed & Upsert Document Chunk"""
    async def _logic():
        ingestion = IngestionService()
        vector_svc = VectorDBService(QdrantManager.get_client(), metadata["collection_name"])
        
        texts = [c["text"] for c in batch_data]
        embeddings = await ingestion.embed_hybrid_batch(texts)
        
        points = []
        for i, chunk in enumerate(batch_data):
            points.append({
                "dense": embeddings[i]["dense"],
                "sparse": embeddings[i]["sparse"],
                "payload": {
                    "content": chunk["text"],
                    "version_id": metadata["version_id"],
                    "document_id": metadata["document_id"],
                    "chunk_index": chunk["index"]
                }
            })
        
        point_ids = await vector_svc.upsert_hybrid_batch(points)
        
        return [{
            "chunk_index": batch_data[i]["index"],
            "content": batch_data[i]["text"],
            "embedding_id": point_ids[i]
        } for i in range(len(batch_data))]

    return run_async(_logic())

@celery_app.task(
    bind=True,
    name="ingestion.finalize",
    autoretry_for=(Exception,),
    retry_kwargs={'max_retries': 3, 'countdown': 5}
)
def finalize_ingestion(self, results: list, metadata: dict):
    """Bước 3A: Save Doc Chunks to Postgres"""
    all_chunks = [item for sublist in results for item in sublist]
    version_id = metadata["version_id"]
    
    async def _logic():
        async with AsyncSessionLocal() as db:
            repo = DocumentRepository(db)
            await repo.bulk_create_chunks([{
                "document_id": metadata["document_id"], 
                "document_version_id": version_id,
                "chunk_index": c["chunk_index"],
                "content": c["content"],
                "embedding_id": c["embedding_id"],
                "chunk_metadata": {"len": len(c["content"])}
            } for c in all_chunks])
            
            await repo.update_version_status(version_id, ProcessingStatus.COMPLETED)
            await db.commit()
            logger.info(f"✅ Doc Ingestion COMPLETED v{version_id}")

    return run_async(_logic())

# --- FAQ FLOW TASKS ---

@celery_app.task(
    bind=True, 
    name="ingestion.process_faq_batch",
    rate_limit='10/m',
    autoretry_for=(Exception,),
    retry_kwargs={'max_retries': 3, 'countdown': 15}
)
def process_faq_batch(self, batch_chunks: list, metadata: dict):
    """
    Bước 2B: Generate FAQ -> Embed -> Upsert FAQ Collection
    """
    async def _logic():
        faq_gen = FAQGeneration() # Dùng class mới
        ingestion = IngestionService()
        # [QUAN TRỌNG] Luôn dùng collection riêng cho FAQ
        vector_svc = VectorDBService(QdrantManager.get_client(), FAQ_COLLECTION_NAME)
        
        all_qdrant_points = []
        batch_pg_records = []

        for chunk in batch_chunks:
            text = chunk["text"]
            
            # 1. Gọi LLM sinh FAQ
            faqs_data = await faq_gen.generate_faq_from_text(text)
            if not faqs_data: continue

            # 2. Chuẩn bị text để Embed (Gom cả question & variants)
            texts_to_embed = []
            mapping_info = []

            for faq_item in faqs_data:
                candidates = [faq_item["question"]] + faq_item.get("variants", [])
                for txt in candidates:
                    texts_to_embed.append(txt)
                    mapping_info.append({
                        "text": txt,
                        "root_question": faq_item["question"],
                        "answer": faq_item["answer"],
                        "is_root": txt == faq_item["question"]
                    })

            if not texts_to_embed: continue

            # 3. Embed Hybrid
            embeddings = await ingestion.embed_hybrid_batch(texts_to_embed)

            # 4. Map Vector -> Data Structure
            chunk_pg_data = {} # Key: root_question

            for i, vec in enumerate(embeddings):
                info = mapping_info[i]
                unique_id = str(uuid.uuid4())

                # A. Data cho Qdrant (FAQ Collection)
                payload = {
                    "content": info["text"],
                    "answer_preview": info["answer"][:300],
                    "type": "faq",
                    "version_id": metadata["version_id"],
                    "document_id": metadata["document_id"],
                    "chunk_source_index": chunk["index"],
                    "is_variant": not info["is_root"]
                }
                
                all_qdrant_points.append({
                    "id": unique_id,
                    "dense": vec["dense"],
                    "sparse": vec["sparse"],
                    "payload": payload
                })

                # B. Data cho Postgres
                root_q = info["root_question"]
                if root_q not in chunk_pg_data:
                    chunk_pg_data[root_q] = {
                        "answer": info["answer"],
                        "variants": []
                    }
                chunk_pg_data[root_q]["variants"].append({
                    "question_text": info["text"],
                    "embedding_id": unique_id
                })
            
            batch_pg_records.append(chunk_pg_data)

        # 5. Upsert vào Collection 'faqs'
        if all_qdrant_points:
            # Bạn cần đảm bảo method upsert_faq_batch hỗ trợ nhận ID
            await vector_svc.upsert_faq_batch(all_qdrant_points)
        
        return batch_pg_records

    return run_async(_logic())

@celery_app.task(
    bind=True,
    name="ingestion.finalize_faq",
    autoretry_for=(Exception,),
    retry_kwargs={'max_retries': 3, 'countdown': 5}
)
def finalize_faq(self, results: list, metadata: dict):
    """Bước 3B: Save FAQ to Postgres"""
    flat_chunk_data = [item for sublist in results for item in sublist]
    
    async def _logic():
        async with AsyncSessionLocal() as db:
            count = 0
            for chunk_data in flat_chunk_data:
                for question_text, details in chunk_data.items():
                    # Tạo FAQ Parent
                    new_faq = FAQ(
                        document_version_id=metadata["version_id"],
                        answer=details["answer"],
                        meta_data={"generated_by": "azure_openai"}
                    )
                    db.add(new_faq)
                    await db.flush()

                    # Tạo Variants
                    for var in details["variants"]:
                        new_var = FAQQuestionVariant(
                            faq_id=new_faq.id,
                            question=var["question_text"],
                            embedding_id=var["embedding_id"]
                        )
                        db.add(new_var)
                    count += 1
            
            await db.commit()
            logger.info(f"✅ FAQ Ingestion COMPLETED v{metadata['version_id']} ({count} FAQs)")

    return run_async(_logic())

# --- ORCHESTRATION (PARALLEL EXECUTION) ---

@celery_app.task(bind=True, name="ingestion.map_batches")
def map_batches(self, payload: dict):
    """Sub-workflow: Document Chunks"""
    chunks = payload["chunks"]
    batch_size = 20
    
    metadata = {
        "version_id": payload["version_id"],
        "document_id": payload["document_id"],
        "collection_name": payload["collection_name"]
    }
    
    batches = [chunks[i:i + batch_size] for i in range(0, len(chunks), batch_size)]
    
    doc_workflow = chord(
        header=[process_batch.s(batch, metadata) for batch in batches],
        body=finalize_ingestion.s(metadata)
    )
    
    # [QUAN TRỌNG] Link error riêng cho nhánh Doc
    doc_workflow.link_error(handle_doc_ingestion_error.s(payload['version_id'], metadata))
    
    return self.replace(doc_workflow)

@celery_app.task(bind=True, name="ingestion.map_faq_batches")
def map_faq_batches(self, payload: dict):
    """Sub-workflow: FAQ Generation"""
    chunks = payload["chunks"]
    batch_size = 5 # Batch nhỏ cho LLM
    
    metadata = {
        "version_id": payload["version_id"],
        "document_id": payload["document_id"],
        # Không cần collection_name dynamic vì dùng 'faqs' cứng
    }
    
    batches = [chunks[i:i + batch_size] for i in range(0, len(chunks), batch_size)]
    
    faq_workflow = chord(
        header=[process_faq_batch.s(batch, metadata) for batch in batches],
        body=finalize_faq.s(metadata)
    )
    
    # [QUAN TRỌNG] Link error riêng cho nhánh FAQ
    faq_workflow.link_error(handle_faq_ingestion_error.s(payload['version_id'], metadata))
    
    return self.replace(faq_workflow)

def trigger_ingestion_pipeline(version_id: int, auto_generate_faq: bool = False):
    """
    Main Trigger:
    1. Extract (Common)
    2. Parallel Group: [Doc Flow] || [FAQ Flow]
    """
    # Bước 1: Extract
    extract_task = extract_and_chunk.s(version_id)
    
    # Bước 2: Song song 
    # Output của extract_task sẽ được truyền vào cả 2 task bên dưới
    tasks_in_parallel = [map_batches.s()]
    
    # Nếu chọn tạo FAQ, thêm nhánh FAQ vào group
    if auto_generate_faq:
        tasks_in_parallel.append(map_faq_batches.s())
    
    # Tạo group từ danh sách tasks
    parallel_flows = group(tasks_in_parallel)
    
    pipeline = chain(extract_task, parallel_flows)
    
    # Link error cho bước Extract (nếu bước 1 fail thì coi như Doc fail)
    return pipeline.apply_async(link_error=handle_doc_ingestion_error.s(version_id))