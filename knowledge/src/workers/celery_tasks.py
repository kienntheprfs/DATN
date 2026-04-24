"""
Celery Tasks for Document Ingestion Pipeline.

This module defines the asynchronous task workflow for processing documents:
1. Extract text from uploaded files
2. Chunk text into manageable pieces
3. Generate embeddings (dense + sparse hybrid)
4. Upsert vectors to Qdrant with transaction support
5. Generate FAQs from document content
6. Persist metadata to PostgreSQL

Transaction Safety:
    All Qdrant write operations are wrapped in QdrantTransaction for:
    - Automatic rollback on error
    - Tracking of upserted point IDs
    - Backup of existing points before deletion

    If any step fails, previously completed operations are rolled back
    to maintain consistency between Qdrant and PostgreSQL.

Error Handling Strategy:
    1. SoftTimeLimitExceeded: Retry with countdown
    2. Transient errors (network, rate limits): Automatic retry with backoff
    3. Permanent errors: Mark document as FAILED, rollback Qdrant changes
    4. FAQ generation failures: Continue processing other chunks, rollback on finalization failure

Task Flow (Normal Document):
    extract_and_chunk
        → map_batches
            → process_batch (parallel, n batches)
                → finalize

    With FAQ generation (if enabled):
        extract_and_chunk
            → map_batches (document chunks)
            → map_faq_batches (FAQ generation)

Error Recovery Flow:
    Any task failure → error_handler
        → Rollback Qdrant vectors
        → Cleanup PostgreSQL chunks
        → Mark document as FAILED
"""

import asyncio
import logging
import uuid
from typing import List, Dict, Any, Optional, Set
from celery import chain, group, chord
from celery.exceptions import SoftTimeLimitExceeded

from src.core.celery_app import celery_app
from src.core.sql_db_setup import AsyncSessionLocal
from src.core.vector_db_setup import QdrantManager
from src.core.transaction import QdrantTransaction
from src.repositories.document_repository import DocumentRepository
from src.repositories.faq_repository import FAQRepository
from src.services.ingestion import IngestionService
from src.services.vector_db import VectorDBService
from src.services.file_storage import get_storage
from src.services.faq_gen import FAQGeneration
from src.models.models import ProcessingStatus, FAQ, FAQQuestionVariant, FAQSource, DocumentStatus
from src.core.config import settings

logger = logging.getLogger(__name__)

# Collection names
FAQ_COLLECTION_NAME = settings.FAQ_COLLECTION_NAME


# ============================================================================
# Utility Functions
# ============================================================================


def run_async(coro):
    """
    Bridge synchronous Celery context to async code.

    Celery workers run synchronously, but our code uses async/await.
    This function creates/retrieves an event loop and runs the coroutine.

    Args:
        coro: Async coroutine to execute

    Returns:
        Result of the coroutine execution
    """
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


# ============================================================================
# Error Handlers
# ============================================================================


@celery_app.task(
    name="ingestion.on_doc_error",
    bind=False,  # Error handlers don't need binding
)
def handle_doc_ingestion_error(
    request,
    exc: Exception,
    traceback: str,
    document_id: int,
    metadata: Optional[Dict[str, Any]] = None,
):
    """
    Error handler for document ingestion pipeline failures.

    This handler is triggered when any task in the document pipeline fails.
    It performs cleanup to maintain consistency:
    1. Deletes any Qdrant vectors that were upserted for this document
    2. Cleans up PostgreSQL chunks (if any were created)
    3. Marks the document status as FAILED with error message

    Args:
        request: Celery request object (contains task info)
        exc: The exception that was raised
        traceback: Exception traceback string
        document_id: ID of the document being processed
        metadata: Additional context (collection_name, etc.)
    """

    async def _handle_error():
        logger.error(
            f"DOC PIPELINE FAILED document_id={document_id}: {exc}\n"
            f"Traceback: {traceback[-500:] if traceback else 'N/A'}"
        )

        async with AsyncSessionLocal() as db:
            repo = DocumentRepository(db)
            qdrant_client = QdrantManager.get_client()

            # Determine collection name
            collection_name = None
            if metadata and "collection_name" in metadata:
                collection_name = metadata["collection_name"]

            if not collection_name:
                doc = await repo.get_for_ingestion(document_id)
                if doc:
                    collection_name = f"kb_{doc.storage_id}"

            # Cleanup Qdrant vectors if collection is known
            if collection_name:
                try:
                    vec_svc = VectorDBService(qdrant_client, collection_name)
                    await vec_svc.delete_vectors_by_document(document_id)
                    logger.info(
                        f"Cleaned up Qdrant vectors for document_id={document_id}"
                    )
                except Exception as qdrant_error:
                    logger.error(
                        f"Failed to cleanup Qdrant vectors: {qdrant_error}. "
                        f"Manual cleanup may be required."
                    )

            # Cleanup PostgreSQL (delete any partially created chunks)
            try:
                await repo.cleanup_failed_document(document_id)
                logger.info(
                    f"Cleaned up PostgreSQL chunks for document_id={document_id}"
                )
            except Exception as pg_error:
                logger.error(f"Failed to cleanup PostgreSQL chunks: {pg_error}")

            # Mark document as failed
            error_msg = f"Doc Ingestion Error: {str(exc)[:500]}"
            try:
                await repo.update_processing_status(
                    document_id,
                    ProcessingStatus.FAILED,
                    error_msg=error_msg,
                )
                await db.commit()
                logger.info(f"Marked document_id={document_id} as FAILED")
            except Exception as status_error:
                logger.error(f"Failed to update document status: {status_error}")
                await db.rollback()

    run_async(_handle_error())


@celery_app.task(
    name="ingestion.on_faq_error",
    bind=False,
)
def handle_faq_ingestion_error(
    request,
    exc: Exception,
    traceback: str,
    document_id: int,
    metadata: Optional[Dict[str, Any]] = None,
):
    """
    Error handler for FAQ generation pipeline failures.

    This handler rolls back only FAQ-related changes, not document chunks.
    This allows the document to remain processed even if FAQ generation fails.

    Args:
        request: Celery request object
        exc: The exception that was raised
        traceback: Exception traceback string
        document_id: ID of the document whose FAQs failed
        metadata: Additional context (batch_ids for tracking, etc.)
    """

    async def _handle_error():
        logger.warning(
            f"FAQ PIPELINE FAILED document_id={document_id}: {exc}\n"
            f"Rolling back generated FAQs only. Document chunks will remain."
        )

        async with AsyncSessionLocal() as db:
            qdrant_client = QdrantManager.get_client()

            # Step 1: Delete FAQ vectors from Qdrant
            try:
                vec_svc = VectorDBService(qdrant_client, FAQ_COLLECTION_NAME)
                await vec_svc.delete_vectors_by_document(document_id)
                logger.info(
                    f"Rolled back FAQ vectors from Qdrant for document_id={document_id}"
                )
            except Exception as qdrant_error:
                logger.error(
                    f"Failed to rollback FAQ vectors from Qdrant: {qdrant_error}"
                )

            # Step 2: Delete generated FAQs from PostgreSQL
            try:
                faq_repo = FAQRepository(db)
                await faq_repo.delete_generated_by_document_id(document_id)
                await db.commit()
                logger.info(
                    f"Rolled back FAQ records from PostgreSQL for document_id={document_id}"
                )
            except Exception as pg_error:
                logger.error(
                    f"Failed to rollback FAQ records from PostgreSQL: {pg_error}"
                )
                await db.rollback()

    run_async(_handle_error())


# ============================================================================
# Core Ingestion Tasks
# ============================================================================


@celery_app.task(
    bind=True,
    name="ingestion.extract_and_chunk",
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 10},
    soft_time_limit=300,
    acks_late=True,  # Acknowledge only after successful completion
)
def extract_and_chunk(self, document_id: int) -> Dict[str, Any]:
    """
    Extract text from document and chunk it for processing.

    This task:
    1. Fetches document metadata from PostgreSQL
    2. Downloads file from storage
    3. Extracts text (supports PDF, TXT, MD)
    4. Chunks text using RecursiveCharacterTextSplitter
    5. Returns chunks for downstream processing

    Args:
        document_id: ID of the document to process

    Returns:
        Dict containing:
        - document_id: Document ID
        - collection_name: Target Qdrant collection
        - chunks: List of chunk dicts with text and index

    Raises:
        ValueError: If document not found or text extraction fails
        SoftTimeLimitExceeded: If processing exceeds 5 minutes
    """

    async def _logic() -> Dict[str, Any]:
        async with AsyncSessionLocal() as db:
            repo = DocumentRepository(db)

            # Fetch document metadata
            doc = await repo.get_for_ingestion(document_id)
            if not doc:
                raise ValueError(f"Document {document_id} not found in database")

            # Update status to PROCESSING
            await repo.update_processing_status(
                document_id, ProcessingStatus.PROCESSING
            )
            await db.commit()
            logger.info(f"Started processing document_id={document_id}")

            # Prepare extraction
            storage = get_storage()
            ingestion = IngestionService()

            # Extract text from file
            try:
                async with storage.download_stream(doc.file_path) as stream:
                    text = await asyncio.to_thread(
                        ingestion.extract_text,
                        stream,
                        doc.document_type,
                        doc.file_path,
                    )
            except Exception as extract_error:
                logger.error(
                    f"Text extraction failed for document_id={document_id}: {extract_error}"
                )
                raise ValueError(f"Failed to extract text: {extract_error}")

            # Validate extracted text
            if not text or not text.strip():
                raise ValueError(
                    f"Extracted text is empty for document_id={document_id}. "
                    "The file may be corrupted or contain no extractable text."
                )

            logger.debug(
                f"Extracted {len(text)} characters from document_id={document_id}"
            )

            # Chunk the text
            chunks = await ingestion.chunk_text_recursive(text)

            if not chunks:
                raise ValueError(
                    f"No chunks generated from document_id={document_id}. "
                    "Text may be too short or chunking configuration may be invalid."
                )

            logger.info(
                f"Extracted and chunked document_id={document_id}: "
                f"{len(text)} chars → {len(chunks)} chunks"
            )

            return {
                "document_id": document_id,
                "collection_name": f"kb_{doc.storage_id}",
                "chunks": [{"text": t, "index": i} for i, t in enumerate(chunks)],
            }

    try:
        return run_async(_logic())
    except SoftTimeLimitExceeded:
        logger.error(
            f"SoftTimeLimitExceeded for extract_and_chunk document_id={document_id}"
        )
        raise self.retry(
            exc=Exception("Timeout extracting and chunking file"), countdown=30
        )


@celery_app.task(
    bind=True,
    name="ingestion.process_batch",
    rate_limit="50/m",  # Rate limit: 50 batches per minute
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 5, "countdown": 20},
    acks_late=True,
)
def process_batch(
    self, batch_data: List[Dict[str, Any]], metadata: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    Process a batch of chunks: generate embeddings and upsert to Qdrant.

    This task performs the core vectorization:
    1. Extract text from chunks
    2. Generate hybrid embeddings (dense + sparse)
    3. Prepare Qdrant points with metadata
    4. Upsert to Qdrant with transaction tracking

    Transaction Safety:
        Each batch is upserted with tracking. If a later operation fails,
        all upserted points from this batch can be rolled back.

    Args:
        batch_data: List of chunk dicts with 'text', 'index' keys
        metadata: Dict containing:
            - document_id: ID of the parent document
            - collection_name: Target Qdrant collection
            - tracked_ids: Optional list of IDs from previous batches (for cumulative tracking)

    Returns:
        List of processed chunk results with embedding_ids for finalize

    Raises:
        Exception: On embedding or upsert failure (will retry)
    """

    async def _logic() -> List[Dict[str, Any]]:
        document_id = metadata["document_id"]
        collection_name = metadata["collection_name"]

        ingestion = IngestionService()
        qdrant_client = QdrantManager.get_client()
        vector_svc = VectorDBService(qdrant_client, collection_name)

        # Ensure collection exists before upserting
        await vector_svc.ensure_hybrid_collection()

        # Extract texts from batch
        texts = [c["text"] for c in batch_data]

        # Generate hybrid embeddings (dense + sparse in parallel)
        try:
            embeddings = await ingestion.embed_hybrid_batch(texts)
        except Exception as embed_error:
            logger.error(
                f"Embedding failed for batch in document_id={document_id}: {embed_error}"
            )
            raise

        # Prepare points for Qdrant
        points = []
        for i, chunk in enumerate(batch_data):
            points.append(
                {
                    "dense": embeddings[i]["dense"],
                    "sparse": embeddings[i]["sparse"],
                    "payload": {
                        "content": chunk["text"],
                        "doc_id": document_id,
                        "chunk_index": chunk["index"],
                        "type": "chunk",
                    },
                }
            )

        # Transaction-aware upsert
        async with QdrantTransaction(qdrant_client, collection_name) as txn:
            # Upsert and track IDs for potential rollback
            point_ids = await vector_svc.upsert_hybrid_batch(points, transaction=txn)

            # Transaction will auto-rollback on exception, commit on success
            logger.debug(
                f"Upserted {len(point_ids)} points for batch in document_id={document_id}"
            )

        # Build result with embedding IDs for finalize task
        results = [
            {
                "chunk_index": batch_data[i]["index"],
                "content": batch_data[i]["text"],
                "embedding_id": point_ids[i],
                "qdrant_ids": point_ids,  # Include for cumulative tracking
            }
            for i in range(len(batch_data))
        ]

        return results

    return run_async(_logic())


@celery_app.task(
    bind=True,
    name="ingestion.finalize",
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 5},
    acks_late=True,
)
def finalize_ingestion(
    self, results: List[List[Dict[str, Any]]], metadata: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Finalize document ingestion: save chunks to PostgreSQL and update status.

    This task is called after all batches are processed successfully.
    It:
    1. Flattens results from all batches
    2. Saves chunk metadata to PostgreSQL
    3. Updates document status to COMPLETED

    IMPORTANT: If PostgreSQL commit fails, the document status won't be updated,
    but Qdrant already has the vectors. A subsequent retry or manual intervention
    would be needed.

    Args:
        results: List of batch results (each is a list of chunk results)
        metadata: Dict containing document_id

    Returns:
        Dict with completion summary
    """
    # Flatten results from all batches
    all_chunks = [item for sublist in results for item in sublist]
    document_id = metadata["document_id"]

    async def _logic() -> Dict[str, Any]:
        async with AsyncSessionLocal() as db:
            repo = DocumentRepository(db)

            # Bulk create chunks in PostgreSQL
            await repo.bulk_create_chunks(
                [
                    {
                        "document_id": document_id,
                        "chunk_index": c["chunk_index"],
                        "content": c["content"],
                        "embedding_id": c["embedding_id"],
                        "chunk_metadata": {
                            "len": len(c["content"]),
                        },
                    }
                    for c in all_chunks
                ]
            )

            # Update document status to COMPLETED
            await repo.update_processing_status(document_id, ProcessingStatus.COMPLETED)
            await db.commit()

            logger.info(
                f"✅ Document ingestion COMPLETED: "
                f"document_id={document_id}, chunks={len(all_chunks)}"
            )

            return {
                "document_id": document_id,
                "status": "completed",
                "chunks_created": len(all_chunks),
            }

    return run_async(_logic())


# ============================================================================
# FAQ Generation Tasks
# ============================================================================


@celery_app.task(
    bind=True,
    name="ingestion.process_faq_batch",
    rate_limit="10/m",  # FAQ generation is slower (LLM calls)
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 15},
    acks_late=True,
)
def process_faq_batch(
    self, batch_chunks: List[Dict[str, Any]], metadata: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    Generate FAQs from document chunks and upsert to Qdrant.

    This task:
    1. Takes chunks from document processing
    2. Generates FAQs using Azure OpenAI GPT-4o
    3. Embeds FAQ questions (hybrid embedding)
    4. Upserts FAQ vectors to Qdrant

    Transaction Safety:
        FAQ vectors are upserted with transaction tracking. If finalization
        fails, all FAQ vectors for this batch can be rolled back.

    Error Handling:
        Individual chunk failures are logged but don't fail the entire batch.
        Only complete failure (e.g., Qdrant connection) triggers retry.

    Args:
        batch_chunks: List of chunk dicts with 'text', 'index' keys
        metadata: Dict containing document_id

    Returns:
        List of FAQ data for PostgreSQL persistence
    """

    async def _logic() -> List[Dict[str, Any]]:
        document_id = metadata["document_id"]

        faq_gen = FAQGeneration()
        ingestion = IngestionService()
        qdrant_client = QdrantManager.get_client()
        vector_svc = VectorDBService(qdrant_client, FAQ_COLLECTION_NAME)

        # Ensure FAQ collection exists
        await vector_svc.ensure_hybrid_collection()

        all_qdrant_points = []
        batch_pg_records = []
        failed_chunks = []

        # Process each chunk for FAQ generation
        for chunk in batch_chunks:
            text = chunk["text"]

            try:
                # Generate FAQs from text chunk
                faqs_data = await faq_gen.generate_faq_from_text(text)

                if not faqs_data:
                    logger.debug(
                        f"No FAQs generated for chunk {chunk['index']} "
                        f"in document_id={document_id}"
                    )
                    continue

                # Prepare texts for embedding (question + variants)
                texts_to_embed = []
                mapping_info = []

                for faq_item in faqs_data:
                    # Main question + variants (for better recall)
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

                # Generate embeddings for all questions
                embeddings = await ingestion.embed_hybrid_batch(texts_to_embed)

                # Prepare Qdrant points and PG records
                chunk_pg_data = {}

                for i, vec in enumerate(embeddings):
                    info = mapping_info[i]
                    unique_id = str(uuid.uuid4())

                    payload = {
                        "content": info["text"],
                        "answer_preview": info["answer"][:300],  # Truncate for storage
                        "type": "faq",
                        "doc_id": document_id,
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

                    # Group by root question for PG record
                    root_q = info["root_question"]
                    if root_q not in chunk_pg_data:
                        chunk_pg_data[root_q] = {
                            "answer": info["answer"],
                            "variants": [],
                        }
                    chunk_pg_data[root_q]["variants"].append(
                        {
                            "question_text": info["text"],
                            "embedding_id": unique_id,
                        }
                    )

                if chunk_pg_data:
                    batch_pg_records.append(chunk_pg_data)

            except Exception as chunk_error:
                # Log but don't fail - continue with other chunks
                logger.warning(
                    f"Failed to generate FAQs for chunk {chunk['index']} "
                    f"in document_id={document_id}: {chunk_error}"
                )
                failed_chunks.append(chunk["index"])
                continue

        # Upsert all FAQ vectors with transaction
        if all_qdrant_points:
            async with QdrantTransaction(qdrant_client, FAQ_COLLECTION_NAME) as txn:
                await vector_svc.upsert_with_explicit_ids(
                    all_qdrant_points, transaction=txn
                )
                logger.debug(
                    f"Upserted {len(all_qdrant_points)} FAQ points for "
                    f"{len(batch_pg_records)} FAQs in document_id={document_id}"
                )

        logger.info(
            f"Processed FAQ batch for document_id={document_id}: "
            f"{len(batch_pg_records)} FAQs, {len(failed_chunks)} failed chunks"
        )

        return {
            "pg_records": batch_pg_records,
            "failed_chunks": failed_chunks,
            "faq_count": len(batch_pg_records),
        }

    return run_async(_logic())


@celery_app.task(
    bind=True,
    name="ingestion.finalize_faq",
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 5},
    acks_late=True,
)
def finalize_faq(
    self, results: List[Dict[str, Any]], metadata: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Finalize FAQ generation: persist FAQs to PostgreSQL.

    This task is called after all FAQ batches are processed.
    It:
    1. Collects results from all batches
    2. Creates FAQ and FAQQuestionVariant records in PostgreSQL
    3. Logs completion

    IMPORTANT: On PostgreSQL failure, FAQ vectors are already in Qdrant.
    The on_faq_error handler can clean them up if needed.

    Args:
        results: List of batch results (PG records)
        metadata: Dict containing document_id

    Returns:
        Dict with FAQ generation summary
    """
    document_id = metadata["document_id"]

    async def _logic() -> Dict[str, Any]:
        async with AsyncSessionLocal() as db:
            total_faqs = 0
            total_variants = 0

            for batch_result in results:
                pg_records = batch_result.get("pg_records", [])

                for chunk_data in pg_records:
                    for question_text, details in chunk_data.items():
                        # Create FAQ record
                        new_faq = FAQ(
                            source=FAQSource.DOCUMENT,
                            document_id=document_id,
                            answer=details["answer"],
                            meta_data={"generated_by": "azure_openai"},
                        )
                        db.add(new_faq)
                        await db.flush()

                        # Create question variant records
                        for var in details["variants"]:
                            new_var = FAQQuestionVariant(
                                faq_id=new_faq.id,
                                question=var["question_text"],
                                embedding_id=var["embedding_id"],
                            )
                            db.add(new_var)
                            total_variants += 1

                        total_faqs += 1

            await db.commit()

            logger.info(
                f"✅ FAQ generation COMPLETED: "
                f"document_id={document_id}, FAQs={total_faqs}, variants={total_variants}"
            )

            return {
                "document_id": document_id,
                "status": "completed",
                "faqs_created": total_faqs,
                "variants_created": total_variants,
            }

    return run_async(_logic())


# ============================================================================
# Batch Mapping Tasks
# ============================================================================


@celery_app.task(
    bind=True,
    name="ingestion.map_batches",
    acks_late=True,
)
def map_batches(self, payload: Dict[str, Any]):
    """
    Map chunks to batches and create parallel processing workflow.

    This task:
    1. Splits chunks into batches (default 20 chunks per batch)
    2. Creates a chord workflow for parallel batch processing
    3. Attaches error handler for rollback on failure

    The chord workflow ensures:
    - All batches process in parallel
    - Finalize runs only after ALL batches complete
    - Error handler triggers if ANY batch fails

    Args:
        payload: Dict containing:
            - document_id: Document ID
            - collection_name: Target collection
            - chunks: List of chunk dicts

    Returns:
        Celery chord workflow (will replace this task)
    """
    chunks = payload["chunks"]
    batch_size = 20

    metadata = {
        "document_id": payload["document_id"],
        "collection_name": payload["collection_name"],
    }

    # Split into batches
    batches = [chunks[i : i + batch_size] for i in range(0, len(chunks), batch_size)]

    logger.info(
        f"Mapping document_id={payload['document_id']} "
        f"into {len(batches)} batches of max {batch_size} chunks"
    )

    # Create chord: parallel batches → finalize on completion
    doc_workflow = chord(
        header=[process_batch.s(batch, metadata) for batch in batches],
        body=finalize_ingestion.s(metadata),
    )

    # Attach error handler for rollback
    doc_workflow.link_error(
        handle_doc_ingestion_error.s(payload["document_id"], metadata)
    )

    # Replace this task with the workflow
    return self.replace(doc_workflow)


@celery_app.task(
    bind=True,
    name="ingestion.map_faq_batches",
    acks_late=True,
)
def map_faq_batches(self, payload: Dict[str, Any]):
    """
    Map chunks to FAQ batches and create parallel FAQ generation workflow.

    Similar to map_batches but for FAQ generation. Smaller batch size (5)
    due to LLM API calls being more resource-intensive.

    Args:
        payload: Dict containing:
            - document_id: Document ID
            - chunks: List of chunk dicts

    Returns:
        Celery chord workflow for FAQ processing
    """
    chunks = payload["chunks"]
    batch_size = 5  # Smaller batches due to LLM processing

    metadata = {
        "document_id": payload["document_id"],
    }

    batches = [chunks[i : i + batch_size] for i in range(0, len(chunks), batch_size)]

    logger.info(
        f"Mapping FAQ generation for document_id={payload['document_id']} "
        f"into {len(batches)} batches"
    )

    faq_workflow = chord(
        header=[process_faq_batch.s(batch, metadata) for batch in batches],
        body=finalize_faq.s(metadata),
    )

    faq_workflow.link_error(
        handle_faq_ingestion_error.s(payload["document_id"], metadata)
    )

    return self.replace(faq_workflow)


# ============================================================================
# Pipeline Trigger Functions
# ============================================================================


def trigger_ingestion_pipeline(document_id: int, auto_generate_faq: bool = False):
    """
    Trigger the full document ingestion pipeline.

    Pipeline structure:
        extract_and_chunk
            ↓
        [map_batches] ←→ [map_faq_batches]  (parallel if FAQ enabled)
            ↓               ↓
        process_batch    process_faq_batch
            ↓               ↓
        finalize         finalize_faq

    Args:
        document_id: ID of the document to process
        auto_generate_faq: Whether to also generate FAQs

    Returns:
        Celery AsyncResult for the pipeline
    """
    extract_task = extract_and_chunk.s(document_id)

    tasks_in_parallel = [map_batches.s()]

    if auto_generate_faq:
        tasks_in_parallel.append(map_faq_batches.s())

    # Run mapping tasks in parallel
    parallel_flows = group(tasks_in_parallel)

    # Chain: extract → parallel maps
    pipeline = chain(extract_task, parallel_flows)

    # Attach top-level error handler
    result = pipeline.apply_async(
        link_error=handle_doc_ingestion_error.s(document_id, None)
    )

    logger.info(
        f"Triggered ingestion pipeline for document_id={document_id}, "
        f"auto_generate_faq={auto_generate_faq}"
    )

    return result


# ============================================================================
# Formal Document Tasks (LightRAG - informational only)
# ============================================================================

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
    """
    Sync formal document with LightRAG to get the actual document ID.

    This task polls LightRAG until the document processing is complete
    and retrieves the assigned document ID.

    Note: Formal documents use LightRAG, not the standard Qdrant pipeline.
    This task is for syncing metadata, not vector storage.

    Args:
        formal_doc_id: ID of the formal document to sync

    Returns:
        Dict with sync status and lightrag_doc_id
    """
    from src.repositories.formal_document_repository import FormalDocumentRepository
    from src.services.lightrag_service import LightRAGService

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
                        f"Formal doc {formal_doc_id}: max retries reached, "
                        "doc_id still not available"
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
    """
    Trigger LightRAG sync for a formal document.

    Args:
        formal_doc_id: ID of the formal document to sync

    Returns:
        Celery AsyncResult
    """
    return sync_formal_document_task.apply_async(args=[formal_doc_id])


# ============================================================================
# Document Delete Tasks
# ============================================================================

DELETE_DOCUMENT_MAX_RETRIES = 3
DELETE_DOCUMENT_RETRY_DELAY = 10  # seconds


@celery_app.task(
    name="document.on_delete_error",
    bind=False,
)
def handle_delete_error(
    request,
    exc: Exception,
    traceback: str,
    document_id: int,
    metadata: Optional[Dict[str, Any]] = None,
):
    """
    Error handler for document deletion failures.

    This handler is triggered when the delete_document_task fails after all
    automatic retries are exhausted. It sets the document status to
    DELETE_FAILED with the error message so users can see what happened
    and retry if needed.

    Args:
        request: Celery request object
        exc: The exception that was raised
        traceback: Exception traceback string
        document_id: ID of the document that failed to delete
        metadata: Additional context (collection_name, storage_id, etc.)
    """

    async def _handle_error():
        error_msg = f"Delete failed after {DELETE_DOCUMENT_MAX_RETRIES} retries: {str(exc)[:500]}"

        logger.error(
            f"DELETE DOCUMENT FAILED permanently document_id={document_id}: {exc}\n"
            f"Metadata: {metadata}\n"
            f"Will mark document as DELETE_FAILED with error: {error_msg}"
        )

        try:
            async with AsyncSessionLocal() as db:
                repo = DocumentRepository(db)
                await repo.set_delete_failed(document_id, error_msg)
                await db.commit()
                logger.info(
                    f"Marked document_id={document_id} as DELETE_FAILED: {error_msg}"
                )
        except Exception as status_error:
            logger.error(
                f"Failed to update document status after delete failure: {status_error}"
            )

    run_async(_handle_error())


@celery_app.task(
    bind=True,
    name="document.delete_normal",
    autoretry_for=(Exception,),
    retry_kwargs={
        "max_retries": DELETE_DOCUMENT_MAX_RETRIES,
        "countdown": DELETE_DOCUMENT_RETRY_DELAY,
    },
    acks_late=True,
    soft_time_limit=120,  # 2 minutes max for delete
)
def delete_document_task(
    self,
    document_id: int,
    collection_name: str,
    storage_id: int,
    storage_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Delete a normal document from Qdrant, PostgreSQL, and optional storage.

    This task performs a coordinated deletion across multiple systems:
    1. Verify document is in DELETE_PENDING status (guard condition)
    2. Delete vectors from Qdrant
    3. Delete chunk metadata from PostgreSQL
    4. Update document status to DELETED
    5. Commit PostgreSQL transaction
    6. Delete file from object storage (non-critical)
    7. Invalidate semantic cache (non-critical)

    Status Flow:
        - Started: Document is already set to DELETE_PENDING by API
        - Success: Document status → DELETED
        - Failure: Document status → DELETE_FAILED (with error message)

    Error Handling Strategy:
        - Transient failures (network, temporary unavailability): Retry with backoff
        - Permanent failures: Set status to DELETE_FAILED, user can retry
        - Non-critical failures (S3, cache): Log warning, don't fail task

    Args:
        self: Celery task binding
        document_id: ID of the document to delete
        collection_name: Qdrant collection name (e.g., "kb_1")
        storage_id: Storage ID for cache invalidation
        storage_path: Optional S3/local path to delete the file

    Returns:
        Dict with deletion summary

    Raises:
        Exception: On deletion failure (will trigger retry, then error handler)
    """
    async def _logic() -> Dict[str, Any]:
        logger.info(
            f"Starting document deletion: document_id={document_id}, "
            f"collection={collection_name}"
        )

        async with AsyncSessionLocal() as db:
            repo = DocumentRepository(db)

            # Step 0: Guard - Verify document is in DELETE_PENDING status
            # This prevents race conditions if user cancels or retries
            doc = await repo.get_by_id(document_id)
            if not doc:
                logger.warning(
                    f"Document document_id={document_id} not found, "
                    "may have been already deleted."
                )
                return {
                    "document_id": document_id,
                    "status": "skipped",
                    "reason": "document_not_found",
                }

            if doc.status != DocumentStatus.DELETE_PENDING:
                logger.warning(
                    f"Document document_id={document_id} is not in DELETE_PENDING status "
                    f"(current: {doc.status}). Skipping deletion."
                )
                return {
                    "document_id": document_id,
                    "status": "skipped",
                    "reason": f"invalid_status_{doc.status}",
                }

            # Step 1: Delete vectors from Qdrant
            vectors_deleted = False
            try:
                qdrant_client = QdrantManager.get_client()
                vector_svc = VectorDBService(qdrant_client, collection_name)

                if await vector_svc.collection_exists():
                    # Use transaction with backup for safety
                    async with QdrantTransaction(qdrant_client, collection_name) as txn:
                        await txn.backup_and_delete_by_doc_id(document_id)
                        vectors_deleted = True
                        logger.info(
                            f"Deleted Qdrant vectors for document_id={document_id}"
                        )
                else:
                    logger.info(
                        f"Collection '{collection_name}' does not exist, "
                        "skipping Qdrant deletion"
                    )
            except Exception as qdrant_error:
                logger.warning(
                    f"Failed to delete Qdrant vectors for document_id={document_id}: "
                    f"{qdrant_error}. Will retry."
                )
                raise  # Trigger retry

            # Step 2: Delete chunk metadata from PostgreSQL
            try:
                await repo.delete_chunks_for_document(document_id)
                logger.debug(f"Deleted PostgreSQL chunks for document_id={document_id}")
            except Exception as pg_chunks_error:
                logger.error(
                    f"Failed to delete chunks for document_id={document_id}: "
                    f"{pg_chunks_error}"
                )
                raise  # Trigger retry

            # Step 3: Update document status to DELETED
            try:
                deleted = await repo.set_deleted(document_id)
                if not deleted:
                    logger.error(
                        f"Failed to mark document_id={document_id} as DELETED. "
                        "This is unexpected since we verified DELETE_PENDING earlier."
                    )
                    raise Exception("Failed to update document status to DELETED")
            except Exception as pg_status_error:
                logger.error(
                    f"Failed to update status for document_id={document_id}: "
                    f"{pg_status_error}"
                )
                raise  # Trigger retry

            # Step 4: Commit PostgreSQL transaction
            try:
                await db.commit()
            except Exception as commit_error:
                logger.error(f"Failed to commit PostgreSQL transaction: {commit_error}")
                await db.rollback()
                raise  # Trigger retry

            # Step 5: Delete file from storage (non-critical)
            if storage_path:
                try:
                    from src.services.file_storage import get_storage

                    storage = get_storage()
                    await storage.delete(storage_path)
                    logger.info(f"Deleted file from storage: {storage_path}")
                except Exception as storage_error:
                    # Non-critical: log but don't fail
                    logger.warning(
                        f"Failed to delete file from storage {storage_path}: "
                        f"{storage_error}. File may remain orphaned but "
                        "document has been removed from search."
                    )

            # Step 6: Invalidate semantic cache (non-critical)
            try:
                from src.services.semantic_cache_notifier import semantic_cache_notifier

                await semantic_cache_notifier.notify_kb_changed(
                    namespace=collection_name,
                    doc_ids=[str(document_id)],
                )
                logger.info(
                    f"Invalidated semantic cache for document_id={document_id} "
                    f"in namespace={collection_name}"
                )
            except Exception as cache_error:
                # Non-critical: log but don't fail
                logger.warning(f"Failed to invalidate semantic cache: {cache_error}")

            logger.info(
                f"✅ Document deletion COMPLETED: document_id={document_id}, "
                f"vectors_deleted={vectors_deleted}"
            )

            return {
                "document_id": document_id,
                "status": "deleted",
                "vectors_deleted": vectors_deleted,
                "storage_deleted": storage_path is not None,
            }

    return run_async(_logic())


@celery_app.task(
    bind=True,
    name="document.delete_formal",
    autoretry_for=(Exception,),
    retry_kwargs={
        "max_retries": DELETE_DOCUMENT_MAX_RETRIES,
        "countdown": DELETE_DOCUMENT_RETRY_DELAY,
    },
    acks_late=True,
    soft_time_limit=120,
)
def delete_formal_document_task(
    self,
    document_id: int,
    lightrag_doc_id: Optional[str],
    storage_id: int,
    storage_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Delete a formal document from LightRAG, storage, and PostgreSQL.

    This task performs coordinated deletion for formal documents:
    1. Delete from LightRAG (if doc_id available)
    2. Delete file from storage (if path provided)
    3. Delete from PostgreSQL
    4. Invalidate semantic cache

    Args:
        self: Celery task binding
        document_id: ID of the formal document to delete
        lightrag_doc_id: LightRAG document ID (if available)
        storage_id: Storage ID for cache invalidation
        storage_path: Optional storage path to delete the file

    Returns:
        Dict with deletion summary
    """

    async def _logic() -> Dict[str, Any]:
        logger.info(
            f"Starting formal document deletion: document_id={document_id}, "
            f"lightrag_doc_id={lightrag_doc_id}"
        )

        async with AsyncSessionLocal() as db:
            from src.repositories.formal_document_repository import (
                FormalDocumentRepository,
            )
            from src.services.lightrag_service import LightRAGService

            repo = FormalDocumentRepository(db)
            lightrag = LightRAGService()
            namespace = f"kb_{storage_id}"

            # Step 1: Delete from LightRAG
            lightrag_deleted = False
            if lightrag_doc_id and lightrag.enabled:
                try:
                    await lightrag.delete_document(lightrag_doc_id)
                    lightrag_deleted = True
                    logger.info(f"Deleted LightRAG document: {lightrag_doc_id}")
                except Exception as lightrag_error:
                    logger.warning(
                        f"Failed to delete LightRAG doc {lightrag_doc_id}: "
                        f"{lightrag_error}. Will retry."
                    )
                    raise  # Trigger retry
            elif not lightrag.enabled:
                logger.info("LightRAG not enabled, skipping LightRAG deletion")
            else:
                logger.info(
                    f"No LightRAG doc_id for document_id={document_id}, "
                    "skipping LightRAG deletion"
                )

            # Step 2: Delete file from storage
            storage_deleted = False
            if storage_path:
                try:
                    from src.services.file_storage import get_storage

                    storage = get_storage()
                    await storage.delete(storage_path)
                    storage_deleted = True
                    logger.info(f"Deleted file from storage: {storage_path}")
                except Exception as storage_error:
                    logger.warning(
                        f"Failed to delete storage file {storage_path}: "
                        f"{storage_error}. Will retry."
                    )
                    raise  # Trigger retry

            # Step 3: Delete from PostgreSQL
            try:
                await repo.delete(document_id)
                logger.debug(
                    f"Deleted formal document from PostgreSQL: document_id={document_id}"
                )
            except Exception as pg_error:
                logger.error(
                    f"Failed to delete formal document from PostgreSQL: {pg_error}"
                )
                raise  # Trigger retry

            # Step 4: Commit transaction
            try:
                await db.commit()
            except Exception as commit_error:
                logger.error(f"Failed to commit PostgreSQL transaction: {commit_error}")
                await db.rollback()
                raise

            # Step 5: Invalidate semantic cache
            try:
                from src.services.semantic_cache_notifier import semantic_cache_notifier

                await semantic_cache_notifier.notify_kb_changed(namespace=namespace)
                logger.info(f"Invalidated semantic cache for namespace={namespace}")
            except Exception as cache_error:
                logger.warning(f"Failed to invalidate semantic cache: {cache_error}")

            logger.info(
                f"✅ Formal document deletion COMPLETED: document_id={document_id}, "
                f"lightrag_deleted={lightrag_deleted}, storage_deleted={storage_deleted}"
            )

            return {
                "document_id": document_id,
                "status": "deleted",
                "lightrag_deleted": lightrag_deleted,
                "storage_deleted": storage_deleted,
            }

    return run_async(_logic())


# ============================================================================
# Delete Trigger Functions
# ============================================================================


def trigger_document_deletion(
    document_id: int,
    collection_name: str,
    storage_id: int,
    storage_path: Optional[str] = None,
) -> Any:
    """
    Trigger asynchronous document deletion.

    This function creates and applies a delete task to the Celery queue.
    The deletion runs in the background and the API returns immediately
    with a task ID for tracking.

    Args:
        document_id: ID of the document to delete
        collection_name: Qdrant collection name (e.g., "kb_1")
        storage_id: Storage ID for cache invalidation
        storage_path: Optional storage path to delete the file

    Returns:
        Celery AsyncResult for tracking deletion progress
    """
    task = delete_document_task.apply_async(
        args=[document_id, collection_name, storage_id, storage_path],
        link_error=handle_delete_error.s(
            document_id,
            {
                "collection_name": collection_name,
                "storage_id": storage_id,
            },
        ),
    )

    logger.info(
        f"Triggered document deletion task: document_id={document_id}, "
        f"task_id={task.id}"
    )

    return task


def trigger_formal_document_deletion(
    document_id: int,
    lightrag_doc_id: Optional[str],
    storage_id: int,
    storage_path: Optional[str] = None,
) -> Any:
    """
    Trigger asynchronous formal document deletion.

    Args:
        document_id: ID of the formal document to delete
        lightrag_doc_id: LightRAG document ID (if available)
        storage_id: Storage ID for cache invalidation
        storage_path: Optional storage path to delete the file

    Returns:
        Celery AsyncResult for tracking deletion progress
    """
    task = delete_formal_document_task.apply_async(
        args=[document_id, lightrag_doc_id, storage_id, storage_path],
        link_error=handle_delete_error.s(
            document_id,
            {
                "lightrag_doc_id": lightrag_doc_id,
                "storage_id": storage_id,
                "is_formal": True,
            },
        ),
    )

    logger.info(
        f"Triggered formal document deletion task: document_id={document_id}, "
        f"task_id={task.id}"
    )

    return task
