"""HTTP routes for topic pipeline feature."""

import math
from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import AsyncSessionLocal, get_db
from src.core.settings import settings
from src.models.topic_pipeline import TopicType
from src.repositories.topic_job_repository import JobConflictError, TopicJobRepository
from src.repositories.topic_result_repository import TopicResultRepository
from src.schemas.topics import (
    JobDetailResponse,
    JobTriggerRequest,
    JobTriggerResponse,
    TopicKeywordItem,
    TopicKeywordsResponse,
    TopicListItem,
    TopicListResponse,
    TopicPinRequest,
    TopicPinResponse,
    TopicQuestionsResponse,
    TopicQuestionItem,
    TopicResultSummary,
    TopicSentiment,
    TopicSourceItem,
    TopicTrendResponse,
    TrendDataPoint,
)
from src.services.topic_job_service import TopicJobService

router: APIRouter = APIRouter(prefix="/topics", tags=["Topics"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _relative_time(dt) -> str:
    """Return a human-readable relative-time string for a datetime."""
    import datetime as _dt

    if dt is None:
        return "N/A"
    now = _dt.datetime.utcnow()
    # Strip tzinfo if aware (DB returns naive, but original_created_at may be aware)
    if hasattr(dt, "tzinfo") and dt.tzinfo is not None:
        dt = dt.astimezone(_dt.timezone.utc).replace(tzinfo=None)
    delta = now - dt
    seconds = int(delta.total_seconds())
    if seconds < 0:
        seconds = 0
    if seconds < 60:
        return f"{seconds} giây trước"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} phút trước"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} giờ trước"
    days = hours // 24
    if days < 7:
        return f"{days} ngày trước"
    weeks = days // 7
    if weeks < 5:
        return f"{weeks} tuần trước"
    months = days // 30
    return f"{months} tháng trước"


def _derive_status(created_at, pinned: bool, knowledge_updated: bool) -> str:
    """Derive a display status from topic metadata."""
    import datetime as _dt

    now = _dt.datetime.utcnow()
    if created_at is None:
        delta_days = 9999
    else:
        # Strip tzinfo if aware (normalise to naive UTC)
        if hasattr(created_at, "tzinfo") and created_at.tzinfo is not None:
            created_at = created_at.astimezone(_dt.timezone.utc).replace(tzinfo=None)
        delta_days = (now - created_at).days
    if delta_days <= 1:
        return "new"
    if knowledge_updated or pinned:
        return "stable"
    return "waiting"


def _build_topic_list_item(
    topic_id: int,
    result,
    pins_map: dict[int, dict],
    count: int,
    source_dist: list[dict],
) -> TopicListItem:
    """Build an enriched TopicListItem from raw DB data."""
    pin = pins_map.get(topic_id, {})
    pinned = pin.get("pinned", False)
    knowledge_updated = pin.get("knowledge_updated", False)
    discarded = pin.get("discarded", False)

    evidence_document_ids = pin.get("evidence_document_ids", [])
    pinned_post_ids = pin.get("pinned_post_ids", [])

    # Keywords from topic_keywords JSON
    kw_key = str(topic_id)
    raw_kws: list[dict] = result.topic_keywords.get(kw_key, result.topic_keywords.get(topic_id, []))
    kws = sorted(raw_kws, key=lambda k: float(k.get("score", 0)), reverse=True)

    tags = [kw["term"] for kw in kws[:10]]
    featured_entity = kws[0]["term"] if kws else f"Topic {topic_id}"
    featured_entity_rate = round(float(kws[0].get("score", 0)) * 100, 1) if kws else 0.0
    if kws:
        avg_score = sum(float(k.get("score", 0)) for k in kws[:5]) / min(5, len(kws))
        confidence = round(min(avg_score * 100, 100.0), 1)
    else:
        confidence = 0.0

    summary = ", ".join(tags[:3]) if tags else ""

    ts_key = str(topic_id)
    title = (
        result.topic_summary.get(ts_key)
        or result.topic_summary.get(topic_id)
        or (f"Chủ đề {topic_id}: {summary}" if summary else f"Chủ đề {topic_id}")
    )

    sent_raw = (result.topic_sentiment or {}).get(ts_key, {})
    sentiment = TopicSentiment(
        positive=float(sent_raw.get("positive", 0.0)),
        neutral=float(sent_raw.get("neutral", 100.0)),
    )

    total_in_topic = sum(s["count"] for s in source_dist) or 1
    sources = [
        TopicSourceItem(
            label=s["source"].replace("_", " ").title(),
            percent=f"{round(s['count'] / total_in_topic * 100, 1)}%",
        )
        for s in source_dist
    ]

    return TopicListItem(
        topic_id=topic_id,
        result_id=result.id,
        title=title,
        summary=summary,
        queries=count,
        status=_derive_status(result.created_at, pinned, knowledge_updated),
        pinned=pinned,
        knowledge_updated=knowledge_updated,
        discarded=discarded,
        evidence_document_ids=evidence_document_ids,
        pinned_post_ids=pinned_post_ids,
        featured_entity=featured_entity,
        featured_entity_rate=featured_entity_rate,
        confidence=confidence,
        sync_ago=_relative_time(result.created_at),
        tags=tags,
        sources=sources,
        sentiment=sentiment,
        created_at=result.created_at,
    )


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------

@router.post(
    "/jobs", response_model=JobTriggerResponse, status_code=status.HTTP_202_ACCEPTED
)
async def trigger_job(
    request: JobTriggerRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    background_tasks: BackgroundTasks,
) -> JobTriggerResponse:
    """Trigger a new topic modeling pipeline job.

    A single job runs both input sources (missing_knowledge + popular_questions)
    and creates separate DashboardTopicResult rows for each.
    """
    try:
        job, created = await TopicJobService.trigger_job(
            db,
            time_range=request.time_range,
            background_tasks=background_tasks,
            db_session_factory=AsyncSessionLocal,
            topic_type=request.topic_type,
        )
    except JobConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"active job {exc.job_id} already exists (stage={exc.stage})",
        )

    return JobTriggerResponse(
        id=job.id,
        time_range=job.time_range,
        status=job.status,
        stage=job.stage,
        progress=job.progress,
        message=job.message,
        created_at=job.created_at,
        updated_at=job.updated_at,
        topic_type=request.topic_type,
    )


@router.get("/jobs", response_model=list[JobDetailResponse])
async def list_jobs(
    status: str | None = Query(None, description="Filter jobs by status (pending, running, succeeded, failed)"),
    limit: int = Query(50, ge=1, le=100),
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> list[JobDetailResponse]:
    """List jobs with optional status filtering."""
    jobs = await TopicJobRepository.get_jobs_by_status(db, status=status, limit=limit)
    return [
        JobDetailResponse(
            id=job.id,
            time_range=job.time_range,
            status=job.status,
            stage=job.stage,
            progress=job.progress,
            message=job.message,
            error_detail=job.error_detail,
            created_at=job.created_at,
            updated_at=job.updated_at,
            completed_at=job.completed_at,
        )
        for job in jobs
    ]


@router.get("/jobs/current", response_model=JobDetailResponse | None)
async def get_current_job(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JobDetailResponse | None:
    """Get the currently active or most recent job."""
    job = await TopicJobService.get_current_job(db)
    if job is None:
        return None
    return JobDetailResponse(
        id=job.id,
        time_range=job.time_range,
        status=job.status,
        stage=job.stage,
        progress=job.progress,
        message=job.message,
        error_detail=job.error_detail,
        created_at=job.created_at,
        updated_at=job.updated_at,
        completed_at=job.completed_at,
    )


@router.get("/jobs/{job_id}", response_model=JobDetailResponse)
async def get_job(
    job_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JobDetailResponse:
    """Get job details by ID."""
    job = await TopicJobRepository.get_by_id(db, job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="job not found"
        )
    return JobDetailResponse(
        id=job.id,
        time_range=job.time_range,
        status=job.status,
        stage=job.stage,
        progress=job.progress,
        message=job.message,
        error_detail=job.error_detail,
        created_at=job.created_at,
        updated_at=job.updated_at,
        completed_at=job.completed_at,
    )


@router.get("/jobs/{job_id}/results", response_model=dict[str, UUID])
async def get_job_results(
    job_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, UUID]:
    """Get result IDs associated with a job."""
    from sqlalchemy import select
    from src.models.topic_pipeline import DashboardTopicResult

    stmt = select(DashboardTopicResult.topic_type, DashboardTopicResult.id).where(
        DashboardTopicResult.job_id == job_id
    )
    res = await db.execute(stmt)
    return {row.topic_type: row.id for row in res}


@router.delete("/jobs/{job_id}/cancel", response_model=JobDetailResponse)
async def cancel_job(
    job_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JobDetailResponse:
    """Force-cancel a stuck/zombie job so a new one can be triggered.

    Only jobs in *pending* or *running* status can be cancelled.
    """
    job = await TopicJobRepository.get_by_id(db, job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="job not found"
        )
    if job.status not in ("pending", "running"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"job is already in terminal state: {job.status}",
        )
    await TopicJobRepository.cancel_job(db, job, reason="cancelled by admin")
    await db.commit()
    await db.refresh(job)
    return JobDetailResponse(
        id=job.id,
        time_range=job.time_range,
        status=job.status,
        stage=job.stage,
        progress=job.progress,
        message=job.message,
        error_detail=job.error_detail,
        created_at=job.created_at,
        updated_at=job.updated_at,
        completed_at=job.completed_at,
    )


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Permanently delete a job record and all associated results.

    This should be used to clean up failed or old jobs.
    """
    job = await TopicJobRepository.get_by_id(db, job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="job not found"
        )

    # We allow deleting jobs in any state, but usually users want to delete failed/completed ones.
    # If a job is running, deleting it might cause the background task to fail silently or error out.
    await TopicJobRepository.delete_job(db, job)
    await db.commit()
    return


@router.get("/results/{result_id}/export/csv")
async def download_job_csv(
    result_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FileResponse:
    """Download the CSV export file produced by a pipeline job for a specific result."""
    result = await TopicResultRepository.get_by_id(db, result_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not found")

    output_dir = Path(settings.topic_output_dir).resolve()
    # Filename includes both job_id and topic_type
    filename = f"{result.job_id}_{result.topic_type}_topic_assignments.csv"
    csv_path = output_dir / filename

    if not csv_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CSV export not found for this result at {csv_path}",
        )

    return FileResponse(
        path=str(csv_path),
        media_type="text/csv",
        filename=f"topic_assignments_{result.topic_type}_{result.created_at.strftime('%Y%m%d')}.csv",
    )


# ---------------------------------------------------------------------------
# Results summary
# ---------------------------------------------------------------------------

@router.get("/results/latest", response_model=TopicResultSummary)
async def get_latest_result(
    topic_type: TopicType,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TopicResultSummary:
    """Get the latest result for given topic type (404 if none)."""
    result = await TopicResultRepository.get_latest_result(db, topic_type.value)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="no result found"
        )
    return TopicResultSummary(
        id=result.id,
        topic_type=result.topic_type,
        time_range=result.time_range,
        n_topics=result.n_topics,
        n_documents=result.n_documents,
        topic_summary=result.topic_summary,
        topic_keywords=result.topic_keywords,
        created_at=result.created_at,
    )


# ---------------------------------------------------------------------------
# Topic list — enriched for frontend cards
# ---------------------------------------------------------------------------

@router.get("/results/latest/list", response_model=TopicListResponse)
async def get_topic_list(
    topic_type: TopicType,
    db: Annotated[AsyncSession, Depends(get_db)],
    result_id: UUID | None = Query(None),
) -> TopicListResponse:
    """Return enriched topic list for the given topic_type from the latest or specific result."""
    if result_id:
        result = await TopicResultRepository.get_by_id(db, result_id)
    else:
        result = await TopicResultRepository.get_latest_result(db, topic_type.value)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no result found")

    pins_map = await TopicResultRepository.get_all_pin_states(result)

    from sqlalchemy import func, select
    from src.models.topic_pipeline import DashboardTopicAssignment

    count_stmt = (
        select(
            DashboardTopicAssignment.topic_id,
            func.count(DashboardTopicAssignment.id).label("cnt"),
        )
        .where(DashboardTopicAssignment.result_id == result.id)
        .group_by(DashboardTopicAssignment.topic_id)
    )
    count_rows = await db.execute(count_stmt)
    counts: dict[int, int] = {row.topic_id: int(row.cnt) for row in count_rows}

    topic_ids = sorted(
        set(int(k) for k in (result.topic_keywords or {}).keys())
    )

    all_source_dists = await TopicResultRepository.get_all_source_distributions(
        db, result.id
    )

    items: list[TopicListItem] = []
    for topic_id in topic_ids:
        item = _build_topic_list_item(
            topic_id=topic_id,
            result=result,
            pins_map=pins_map,
            count=counts.get(topic_id, 0),
            source_dist=all_source_dists.get(topic_id, []),
        )
        items.append(item)

    items.sort(key=lambda x: x.queries, reverse=True)

    return TopicListResponse(
        result_id=result.id,
        topic_type=result.topic_type,
        time_range=result.time_range,
        total_topics=result.n_topics,
        total_documents=result.n_documents,
        items=items,
        created_at=result.created_at,
    )


# ---------------------------------------------------------------------------
# Questions
# ---------------------------------------------------------------------------

@router.get("/results/latest/questions", response_model=TopicQuestionsResponse)
async def get_latest_questions(
    topic_type: TopicType,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    topic_id: int | None = None,
    sort_by: str = "created_desc",
    result_id: UUID | None = Query(None),
) -> TopicQuestionsResponse:
    """Get paginated questions from the latest or specific result for UI display."""
    if result_id:
        result = await TopicResultRepository.get_by_id(db, result_id)
    else:
        result = await TopicResultRepository.get_latest_result(db, topic_type.value)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="no result found"
        )

    items, total_items = await TopicResultRepository.get_assignments_paginated(
        db,
        result.id,
        page=page,
        page_size=page_size,
        topic_id=topic_id,
        sort_by=sort_by,
    )

    total_pages = math.ceil(total_items / page_size) if total_items > 0 else 0
    return TopicQuestionsResponse(
        items=[
            TopicQuestionItem(
                id=item.id,
                question=item.question,
                topic_id=item.topic_id,
                label=item.label,
                source=item.source,
                created_at=item.original_created_at or item.created_at,
            )
            for item in items
        ],
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
    )


# ---------------------------------------------------------------------------
# Trend data
# ---------------------------------------------------------------------------

@router.get("/results/latest/trends", response_model=TopicTrendResponse)
async def get_topic_trends(
    topic_type: TopicType,
    topic_id: int,
    view: Annotated[str, Query(pattern="^(day|week|month)$")] = "day",
    db: Annotated[AsyncSession, Depends(get_db)] = None,
    result_id: UUID | None = Query(None),
) -> TopicTrendResponse:
    """Return query-count trend for a topic bucketed by day / week / month."""
    if result_id:
        result = await TopicResultRepository.get_by_id(db, result_id)
    else:
        result = await TopicResultRepository.get_latest_result(db, topic_type.value)
        
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no result found")

    limit_map = {"day": 7, "week": 4, "month": 12}
    limit = limit_map.get(view, 7)

    rows = await TopicResultRepository.get_topic_trend_by_period(
        db,
        topic_type=topic_type.value,
        topic_id=topic_id,
        result_id=result.id,
        period=view,
        limit=limit,
    )

    return TopicTrendResponse(
        topic_id=topic_id,
        result_id=result.id,
        topic_type=topic_type.value,
        view=view,
        data=[TrendDataPoint(period=r["period"], count=r["count"]) for r in rows],
    )


# ---------------------------------------------------------------------------
# Keywords
# ---------------------------------------------------------------------------

@router.get("/results/latest/keywords", response_model=TopicKeywordsResponse)
async def get_topic_keywords(
    topic_type: TopicType,
    topic_id: int,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
    result_id: UUID | None = Query(None),
) -> TopicKeywordsResponse:
    """Return top keywords for a specific topic from the latest result."""
    if result_id:
        result = await TopicResultRepository.get_by_id(db, result_id)
    else:
        result = await TopicResultRepository.get_latest_result(db, topic_type.value)
        
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no result found")

    kw_key = str(topic_id)
    raw_kws: list[dict] = (result.topic_keywords or {}).get(
        kw_key, (result.topic_keywords or {}).get(topic_id, [])
    )
    kws = sorted(raw_kws, key=lambda k: float(k.get("score", 0)), reverse=True)

    return TopicKeywordsResponse(
        topic_id=topic_id,
        result_id=result.id,
        keywords=[
            TopicKeywordItem(term=k["term"], score=float(k.get("score", 0)))
            for k in kws
        ],
    )


# ---------------------------------------------------------------------------
# Pin / knowledge update (stored as JSON on DashboardTopicResult)
# ---------------------------------------------------------------------------

@router.patch(
    "/results/{result_id}/topics/{topic_id}/pin",
    response_model=TopicPinResponse,
)
async def update_topic_pin(
    result_id: UUID,
    topic_id: int,
    body: TopicPinRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TopicPinResponse:
    """Mark a topic as pinned or knowledge-updated or discarded."""
    pin_state = await TopicResultRepository.upsert_pin(
        db,
        result_id=result_id,
        topic_id=topic_id,
        pinned=body.pinned,
        knowledge_updated=body.knowledge_updated,
        discarded=body.discarded,
        evidence_document_ids=body.evidence_document_ids,
        pinned_post_ids=body.pinned_post_ids,
    )
    await db.commit()

    return TopicPinResponse(
        result_id=result_id,
        topic_id=topic_id,
        pinned=pin_state["pinned"],
        knowledge_updated=pin_state["knowledge_updated"],
        discarded=pin_state.get("discarded", False),
        evidence_document_ids=pin_state.get("evidence_document_ids", []),
        pinned_post_ids=pin_state.get("pinned_post_ids", []),
    )
