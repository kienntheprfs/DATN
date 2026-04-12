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
from src.repositories.formal_document_repository import FormalDocumentRepository
from src.services.ingestion import IngestionService
from src.services.vector_db import VectorDBService
from src.services.file_storage import get_storage
from src.services.faq_gen import FAQGeneration
from src.services.lightrag_service import LightRAGService
from src.models.models import ProcessingStatus, FAQ, FAQQuestionVariant, FAQSource
from src.core.config import settings

logger = logging.getLogger(__name__)

FAQ_COLLECTION_NAME = settings.FAQ_COLLECTION_NAME


def run_async(coro):
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


@celery_app.task(name="ingestion.on_doc_error")
def handle_doc_ingestion_error(
    request, exc, traceback, document_id: int, metadata: dict | None = None
):
    async def _rollback():
        logger.error(f"🚨 DOC PIPELINE FAILED doc={document_id}: {exc}")
        async with AsyncSessionLocal() as db:
            repo = DocumentRepository(db)
            collection_name = metadata.get("collection_name") if metadata else None
            if not collection_name:
                d = await repo.get_for_ingestion(document_id)
                if d:
                    collection_name = f"kb_{d.storage_id}"

            if collection_name:
                try:
                    vec_svc = VectorDBService(
                        QdrantManager.get_client(), collection_name
                    )
                    await vec_svc.delete_vectors_by_document(document_id)
                except Exception as e:
                    logger.error(f"Failed to cleanup Qdrant chunks: {e}")

            await repo.cleanup_failed_document(document_id)
            await repo.update_processing_status(
                document_id,
                ProcessingStatus.FAILED,
                error_msg=f"Doc Error: {str(exc)[:500]}",
            )
            await db.commit()

    return run_async(_rollback())


@celery_app.task(name="ingestion.on_faq_error")
def handle_faq_ingestion_error(
    request, exc, traceback, document_id: int, metadata: dict | None = None
):
    async def _rollback():
        logger.warning(
            f"⚠️ FAQ PIPELINE FAILED doc={document_id}: {exc}. Rolling back generated FAQs only."
        )
        async with AsyncSessionLocal() as db:
            try:
                vec_svc = VectorDBService(
                    QdrantManager.get_client(), FAQ_COLLECTION_NAME
                )
                await vec_svc.delete_vectors_by_document(document_id)
            except Exception as e:
                logger.error(f"Failed to cleanup FAQ vectors: {e}")

            try:
                await FAQRepository(db).delete_generated_by_document_id(document_id)
            except Exception as e:
                logger.error(f"Failed to cleanup FAQ Postgres: {e}")

            await db.commit()

    return run_async(_rollback())


@celery_app.task(
    bind=True,
    name="ingestion.extract_and_chunk",
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 10},
    soft_time_limit=300,
)
def extract_and_chunk(self, document_id: int):
    async def _logic():
        async with AsyncSessionLocal() as db:
            repo = DocumentRepository(db)
            doc = await repo.get_for_ingestion(document_id)
            if not doc:
                raise ValueError(f"Document {document_id} not found")

            await repo.update_processing_status(
                document_id, ProcessingStatus.PROCESSING
            )
            await db.commit()

            storage = get_storage()
            ingestion = IngestionService()

            async with storage.download_stream(doc.file_path) as stream:
                text = await asyncio.to_thread(
                    ingestion.extract_text,
                    stream,
                    doc.document_type,
                    doc.file_path,
                )

            if not text or not text.strip():
                raise ValueError("Extracted text is empty")

            chunks = await ingestion.chunk_text_recursive(text)

            return {
                "document_id": document_id,
                "collection_name": f"kb_{doc.storage_id}",
                "chunks": [{"text": t, "index": i} for i, t in enumerate(chunks)],
            }

    try:
        return run_async(_logic())
    except SoftTimeLimitExceeded:
        raise self.retry(exc=Exception("Timeout extracting file"), countdown=10)


@celery_app.task(
    bind=True,
    name="ingestion.process_batch",
    rate_limit="50/m",
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 5, "countdown": 20},
)
def process_batch(self, batch_data: list, metadata: dict):
    async def _logic():
        ingestion = IngestionService()
        vector_svc = VectorDBService(
            QdrantManager.get_client(), metadata["collection_name"]
        )

        texts = [c["text"] for c in batch_data]
        embeddings = await ingestion.embed_hybrid_batch(texts)

        points = []
        for i, chunk in enumerate(batch_data):
            points.append(
                {
                    "dense": embeddings[i]["dense"],
                    "sparse": embeddings[i]["sparse"],
                    "payload": {
                        "content": chunk["text"],
                        "doc_id": metadata["document_id"],
                        "chunk_index": chunk["index"],
                        "type": "chunk",
                    },
                }
            )

        point_ids = await vector_svc.upsert_hybrid_batch(points)

        return [
            {
                "chunk_index": batch_data[i]["index"],
                "content": batch_data[i]["text"],
                "embedding_id": point_ids[i],
            }
            for i in range(len(batch_data))
        ]

    return run_async(_logic())


@celery_app.task(
    bind=True,
    name="ingestion.finalize",
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 5},
)
def finalize_ingestion(self, results: list, metadata: dict):
    all_chunks = [item for sublist in results for item in sublist]
    document_id = metadata["document_id"]

    async def _logic():
        async with AsyncSessionLocal() as db:
            repo = DocumentRepository(db)
            await repo.bulk_create_chunks(
                [
                    {
                        "document_id": document_id,
                        "chunk_index": c["chunk_index"],
                        "content": c["content"],
                        "embedding_id": c["embedding_id"],
                        "chunk_metadata": {"len": len(c["content"])},
                    }
                    for c in all_chunks
                ]
            )

            await repo.update_processing_status(document_id, ProcessingStatus.COMPLETED)
            await db.commit()
            logger.info(f"✅ Doc Ingestion COMPLETED document_id={document_id}")

    return run_async(_logic())


@celery_app.task(
    bind=True,
    name="ingestion.process_faq_batch",
    rate_limit="10/m",
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 15},
)
def process_faq_batch(self, batch_chunks: list, metadata: dict):
    async def _logic():
        faq_gen = FAQGeneration()
        ingestion = IngestionService()
        vector_svc = VectorDBService(QdrantManager.get_client(), FAQ_COLLECTION_NAME)

        all_qdrant_points = []
        batch_pg_records = []

        for chunk in batch_chunks:
            text = chunk["text"]
            faqs_data = await faq_gen.generate_faq_from_text(text)
            if not faqs_data:
                continue

            texts_to_embed = []
            mapping_info = []

            for faq_item in faqs_data:
                candidates = [faq_item["question"]] + faq_item.get("variants", [])
                for txt in candidates:
                    texts_to_embed.append(txt)
                    mapping_info.append(
                        {
                            "text": txt,
                            "root_question": faq_item["question"],
                            "answer": faq_item["answer"],
                            "is_root": txt == faq_item["question"],
                        }
                    )

            if not texts_to_embed:
                continue

            embeddings = await ingestion.embed_hybrid_batch(texts_to_embed)
            chunk_pg_data: dict = {}

            for i, vec in enumerate(embeddings):
                info = mapping_info[i]
                unique_id = str(uuid.uuid4())

                payload = {
                    "content": info["text"],
                    "answer_preview": info["answer"][:300],
                    "type": "faq",
                    "doc_id": metadata["document_id"],
                    "chunk_source_index": chunk["index"],
                    "is_variant": not info["is_root"],
                    "faq_source": "document",
                }

                all_qdrant_points.append(
                    {
                        "id": unique_id,
                        "dense": vec["dense"],
                        "sparse": vec["sparse"],
                        "payload": payload,
                    }
                )

                root_q = info["root_question"]
                if root_q not in chunk_pg_data:
                    chunk_pg_data[root_q] = {"answer": info["answer"], "variants": []}
                chunk_pg_data[root_q]["variants"].append(
                    {"question_text": info["text"], "embedding_id": unique_id}
                )

            batch_pg_records.append(chunk_pg_data)

        if all_qdrant_points:
            await vector_svc.upsert_faq_batch(all_qdrant_points)

        return batch_pg_records

    return run_async(_logic())


@celery_app.task(
    bind=True,
    name="ingestion.finalize_faq",
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 5},
)
def finalize_faq(self, results: list, metadata: dict):
    flat_chunk_data = [item for sublist in results for item in sublist]

    async def _logic():
        async with AsyncSessionLocal() as db:
            count = 0
            for chunk_data in flat_chunk_data:
                for _question_text, details in chunk_data.items():
                    new_faq = FAQ(
                        source=FAQSource.DOCUMENT,
                        document_id=metadata["document_id"],
                        answer=details["answer"],
                        meta_data={"generated_by": "azure_openai"},
                    )
                    db.add(new_faq)
                    await db.flush()

                    for var in details["variants"]:
                        new_var = FAQQuestionVariant(
                            faq_id=new_faq.id,
                            question=var["question_text"],
                            embedding_id=var["embedding_id"],
                        )
                        db.add(new_var)
                    count += 1

            await db.commit()
            logger.info(
                f"✅ FAQ Ingestion COMPLETED doc={metadata['document_id']} ({count} FAQs)"
            )

    return run_async(_logic())


@celery_app.task(bind=True, name="ingestion.map_batches")
def map_batches(self, payload: dict):
    chunks = payload["chunks"]
    batch_size = 20

    metadata = {
        "document_id": payload["document_id"],
        "collection_name": payload["collection_name"],
    }

    batches = [chunks[i : i + batch_size] for i in range(0, len(chunks), batch_size)]

    doc_workflow = chord(
        header=[process_batch.s(batch, metadata) for batch in batches],
        body=finalize_ingestion.s(metadata),
    )

    doc_workflow.link_error(
        handle_doc_ingestion_error.s(payload["document_id"], metadata)
    )

    return self.replace(doc_workflow)


@celery_app.task(bind=True, name="ingestion.map_faq_batches")
def map_faq_batches(self, payload: dict):
    chunks = payload["chunks"]
    batch_size = 5

    metadata = {
        "document_id": payload["document_id"],
    }

    batches = [chunks[i : i + batch_size] for i in range(0, len(chunks), batch_size)]

    faq_workflow = chord(
        header=[process_faq_batch.s(batch, metadata) for batch in batches],
        body=finalize_faq.s(metadata),
    )

    faq_workflow.link_error(
        handle_faq_ingestion_error.s(payload["document_id"], metadata)
    )

    return self.replace(faq_workflow)


def trigger_ingestion_pipeline(document_id: int, auto_generate_faq: bool = False):
    extract_task = extract_and_chunk.s(document_id)
    tasks_in_parallel = [map_batches.s()]

    if auto_generate_faq:
        tasks_in_parallel.append(map_faq_batches.s())

    parallel_flows = group(tasks_in_parallel)
    pipeline = chain(extract_task, parallel_flows)

    return pipeline.apply_async(link_error=handle_doc_ingestion_error.s(document_id))


FORMAL_DOC_SYNC_MAX_RETRIES = 20
FORMAL_DOC_SYNC_INITIAL_DELAY = 60
FORMAL_DOC_SYNC_MAX_DELAY = 1800


@celery_app.task(
    bind=True,
    name="formal_doc.sync_lightrag_doc_id",
    autoretry_for=(Exception,),
    retry_kwargs={
        "max_retries": FORMAL_DOC_SYNC_MAX_RETRIES,
        "countdown": FORMAL_DOC_SYNC_INITIAL_DELAY,
    },
    soft_time_limit=60,
    acks_late=True,
)
def sync_formal_document_task(self, formal_doc_id: int):
    async def _logic():
        async with AsyncSessionLocal() as db:
            repo = FormalDocumentRepository(db)
            lightrag = LightRAGService()

            doc = await repo.get_by_id(formal_doc_id)
            if not doc:
                logger.warning(
                    f"Formal document {formal_doc_id} not found, skipping sync"
                )
                return {"status": "skipped", "reason": "not_found"}

            if doc.lightrag_doc_id:
                logger.info(
                    f"Formal doc {formal_doc_id} already has lightrag_doc_id, skipping"
                )
                return {"status": "skipped", "reason": "already_synced"}

            if not doc.lightrag_track_id:
                logger.warning(f"Formal doc {formal_doc_id} has no track_id, skipping")
                return {"status": "skipped", "reason": "no_track_id"}

            try:
                track_result = await lightrag.get_track_result(doc.lightrag_track_id)
            except Exception as e:
                logger.warning(
                    f"Failed to get track result for formal doc {formal_doc_id}: {e}"
                )
                raise

            documents = (
                track_result.get("documents", [])
                if isinstance(track_result, dict)
                else []
            )

            if not documents:
                remaining_retries = self.request.retries
                if remaining_retries > 0:
                    delay = min(
                        FORMAL_DOC_SYNC_INITIAL_DELAY
                        * (2 ** (FORMAL_DOC_SYNC_MAX_RETRIES - remaining_retries)),
                        FORMAL_DOC_SYNC_MAX_DELAY,
                    )
                    raise self.retry(
                        exc=Exception("LightRAG doc_id not ready yet"),
                        countdown=int(delay),
                    )
                else:
                    logger.warning(
                        f"Formal doc {formal_doc_id}: max retries reached, doc_id still not available"
                    )
                    return {
                        "status": "pending",
                        "reason": "max_retries_reached",
                        "track_id": doc.lightrag_track_id,
                    }

            inferred_doc_id = documents[0].get("id")
            if not inferred_doc_id:
                remaining_retries = self.request.retries
                if remaining_retries > 0:
                    delay = min(
                        FORMAL_DOC_SYNC_INITIAL_DELAY
                        * (2 ** (FORMAL_DOC_SYNC_MAX_RETRIES - remaining_retries)),
                        FORMAL_DOC_SYNC_MAX_DELAY,
                    )
                    raise self.retry(
                        exc=Exception("LightRAG doc_id is null"),
                        countdown=int(delay),
                    )
                else:
                    return {
                        "status": "pending",
                        "reason": "null_doc_id_in_response",
                        "track_id": doc.lightrag_track_id,
                    }

            await repo.update(formal_doc_id, {"lightrag_doc_id": str(inferred_doc_id)})
            await db.commit()

            logger.info(
                f"✅ Formal doc {formal_doc_id} synced with lightrag_doc_id={inferred_doc_id}"
            )
            return {
                "status": "success",
                "lightrag_doc_id": str(inferred_doc_id),
            }

    return run_async(_logic())


def trigger_formal_doc_sync(formal_doc_id: int):
    return sync_formal_document_task.apply_async(args=[formal_doc_id])
