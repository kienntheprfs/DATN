"""Registry for topic pipeline output adapters."""

from src.pipeline.outputs.csv_exporter import CSVExporter
from src.pipeline.outputs.db_exporter import DBExporter


def get_output_adapters(output_dir: str) -> tuple[CSVExporter, DBExporter]:
    """Return configured output adapters for a pipeline run."""
    return CSVExporter(output_dir=output_dir), DBExporter()


__all__ = ["get_output_adapters", "CSVExporter", "DBExporter"]
