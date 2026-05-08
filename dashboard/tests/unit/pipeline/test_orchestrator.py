"""Tests for PipelineOrchestrator."""

from datetime import datetime, timezone
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.models.topic_pipeline import JobStage, TimeRange, TopicType
from src.pipeline.orchestrator import PipelineOrchestrator

@pytest.mark.asyncio
async def test_run_orchestrates_all_stages() -> None:
    # 1. Setup Mocks
    on_progress = AsyncMock()
    orchestrator = PipelineOrchestrator(on_progress=on_progress)
    
    mock_adapter = AsyncMock()
    mock_adapter.fetch.return_value = [("Doc 1", datetime.now()), ("Doc 2", datetime.now())]
    
    mock_engine = AsyncMock()
    mock_engine.fit_predict.return_value = ([0, 1], {0: [("w1", 0.9)], 1: [("w2", 0.8)]}, {})
    mock_engine.generate_labels.return_value = {0: "Label 0", 1: "Label 1"}
    
    mock_csv = AsyncMock()
    mock_db_exporter = AsyncMock()
    mock_db_exporter.export.return_value = MagicMock(id=uuid4())
    
    db = AsyncMock()
    job_id = uuid4()
    time_range = TimeRange.DAYS_7
    
    # 2. Run
    input_adapters = {TopicType.MISSING_KNOWLEDGE: mock_adapter}
    
    result = await orchestrator.run(
        db=db,
        job_id=job_id,
        time_range=time_range,
        from_ts=datetime.now(timezone.utc),
        to_ts=datetime.now(timezone.utc),
        input_adapters=input_adapters,
        modeling_engine=mock_engine,
        csv_exporter=mock_csv,
        db_exporter=mock_db_exporter
    )
    
    # 3. Assertions
    assert result["status"] == "success"
    assert len(result["results"]) == 1
    
    # Check if all stages were reported
    stages_reported = [call.args[0] for call in on_progress.call_args_list]
    assert JobStage.LOADING_INPUT in stages_reported
    assert JobStage.MODELING in stages_reported
    assert JobStage.EXPORTING_FILE in stages_reported
    assert JobStage.EXPORTING_DB in stages_reported
    assert JobStage.COMPLETED in stages_reported
    
    # Verify method calls
    mock_adapter.fetch.assert_called_once()
    mock_engine.fit_predict.assert_called_once()
    mock_csv.export.assert_called_once()
    mock_db_exporter.export.assert_called_once()

@pytest.mark.asyncio
async def test_run_skips_empty_source() -> None:
    on_progress = AsyncMock()
    orchestrator = PipelineOrchestrator(on_progress=on_progress)
    
    mock_adapter = AsyncMock()
    mock_adapter.fetch.return_value = [] # No data
    
    input_adapters = {TopicType.MISSING_KNOWLEDGE: mock_adapter}
    
    result = await orchestrator.run(
        db=AsyncMock(),
        job_id=uuid4(),
        time_range=TimeRange.DAYS_7,
        from_ts=datetime.now(),
        to_ts=datetime.now(),
        input_adapters=input_adapters,
        modeling_engine=AsyncMock(),
        csv_exporter=AsyncMock(),
        db_exporter=AsyncMock()
    )
    
    assert result["status"] == "skipped"
    assert len(result["results"]) == 0
