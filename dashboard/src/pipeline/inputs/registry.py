"""Registry for input adapters."""

from src.pipeline.inputs.base import InputAdapter
from src.pipeline.inputs.missing_knowledge_input import MissingKnowledgeInput
from src.pipeline.inputs.conversation_history_input import ConversationHistoryInput
from src.models.topic_pipeline import TopicType


def get_input_adapter(topic_type: TopicType) -> InputAdapter:
    """Return the appropriate input adapter for topic type."""
    registry: dict[TopicType, InputAdapter] = {
        TopicType.MISSING_KNOWLEDGE: MissingKnowledgeInput(),
        TopicType.POPULAR_QUESTIONS: ConversationHistoryInput(),
    }
    adapter = registry.get(topic_type)
    if adapter is None:
        raise ValueError(f"unsupported topic_type: {topic_type}")
    return adapter


__all__ = ["get_input_adapter", "MissingKnowledgeInput", "ConversationHistoryInput"]
