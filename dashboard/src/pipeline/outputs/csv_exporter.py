"""CSV output adapter for topic pipeline results."""

import csv
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from src.models.topic_pipeline import TimeRange, TopicType

logger: logging.Logger = logging.getLogger(__name__)

STANDARD_COLUMNS: list[str] = ["Question", "Topic", "Label"]


class CSVExporter:
    """Export topic assignments to CSV file."""

    def __init__(self, output_dir: str = "topic_modeling_results") -> None:
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    async def export(
        self,
        job_id: Any,
        topic_type: TopicType,
        time_range: TimeRange,
        documents: list[str],
        topics: list[int],
        topic_words: dict[int, list[tuple[str, float]]],
        topic_labels: dict[int, str] | None = None,
        topic_sentiment: dict | None = None,
    ) -> Path:
        """Write assignments to CSV with standard columns + metadata."""
        if topic_labels is None:
            topic_labels = {}

        filename = f"{job_id}_{topic_type.value}_topic_assignments.csv"
        filepath = self.output_dir / filename

        with open(filepath, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f, quoting=csv.QUOTE_ALL)
            writer.writerow(
                [
                    *STANDARD_COLUMNS,
                    "job_id",
                    "topic_type",
                    "time_range",
                    "source",
                    "created_at",
                ]
            )
            created_at = datetime.utcnow().isoformat()
            for doc, topic_id in zip(documents, topics):
                writer.writerow(
                    [
                        doc,
                        topic_id,
                        topic_labels.get(topic_id, ""),
                        str(job_id),
                        topic_type.value,
                        time_range.value,
                        topic_type.value,
                        created_at,
                    ]
                )

        logger.info("CSV exported: %s", filepath)
        return filepath
