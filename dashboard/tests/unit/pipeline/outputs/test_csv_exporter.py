"""Tests for CSV exporter."""

from uuid import uuid4

import pytest

from src.models.topic_pipeline import TimeRange, TopicType
from src.pipeline.outputs.csv_exporter import CSVExporter


@pytest.mark.asyncio
async def test_csv_exporter_writes_standard_and_metadata_columns(tmp_path) -> None:
    exporter = CSVExporter(output_dir=str(tmp_path))
    job_id = uuid4()

    output_path = await exporter.export(
        job_id=job_id,
        topic_type=TopicType.MISSING_KNOWLEDGE,
        time_range=TimeRange.DAYS_7,
        documents=["Cau hoi 1", "Cau hoi 2"],
        topics=[0, 1],
        topic_words={0: [("hoc_phi", 0.8)], 1: [("hoc_vu", 0.7)]},
        topic_labels={0: "Hoc phi", 1: "Hoc vu"},
    )

    assert output_path.exists()
    content = output_path.read_text(encoding="utf-8")
    assert '"Question","Topic","Label","job_id"' in content
    assert '"topic_type"' in content
    assert '"time_range"' in content
    assert '"source"' in content
    assert '"created_at"' in content
    assert '"Cau hoi 1","0","Hoc phi"' in content
