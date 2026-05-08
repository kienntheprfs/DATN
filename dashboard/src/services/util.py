import asyncio
import json
import os
import re
import time
import httpx
import urllib.error
import urllib.request
from enum import Enum
from pathlib import Path
from typing import Any

import numpy as np
from dotenv import find_dotenv
from pydantic import AliasChoices, BaseModel, Field, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

RANDOM_SEED = 42

# Keep NumPy deterministic for every run.
np.random.seed(RANDOM_SEED)


class TokenizerBackend(str, Enum):
    UNDERTHESEA = "underthesea"
    PYVI = "pyvi"
    SPACY = "spacy"
    NONE = "none"


class LabelingProvider(str, Enum):
    AUTO = "auto"
    OPENROUTER = "openrouter"
    GROQ = "groq"

class ClusteringAlgorithm(str, Enum):
    KMEANS = "kmeans"
    MINIBATCH = "minibatch"


LABELING_PROVIDER_ALIASES: dict[str, LabelingProvider] = {
    "auto": LabelingProvider.AUTO,
    "openrouter": LabelingProvider.OPENROUTER,
    "or": LabelingProvider.OPENROUTER,
    "groq": LabelingProvider.GROQ,
}

CLUSTER_ALGORITHM_ALIASES: dict[str, ClusteringAlgorithm] = {
    "kmeans": ClusteringAlgorithm.KMEANS,
    "k-mean": ClusteringAlgorithm.KMEANS,
    "k_mean": ClusteringAlgorithm.KMEANS,
    "mini_batch": ClusteringAlgorithm.MINIBATCH,
    "minibatch": ClusteringAlgorithm.MINIBATCH,
    "mini-batch": ClusteringAlgorithm.MINIBATCH,
    "mbkmeans": ClusteringAlgorithm.MINIBATCH,
}

TOKENIZER_BACKEND_ALIASES: dict[str, TokenizerBackend] = {
    "underthesea": TokenizerBackend.UNDERTHESEA,
    "uts": TokenizerBackend.UNDERTHESEA,
    "pyvi": TokenizerBackend.PYVI,
    "spacy": TokenizerBackend.SPACY,
    "none": TokenizerBackend.NONE,
    "raw": TokenizerBackend.NONE,
    "off": TokenizerBackend.NONE,
}


def _normalize_alias_key(value: Any) -> str:
    return str(value).strip().lower()

class TopicModelingSettings(BaseSettings):
    """Pydantic Settings for topic modeling configuration.
    
    Environment variables override defaults:
    - TOPIC_LABELING_PROVIDER: auto|openrouter|groq
    - TOPIC_LABELING_API_URL: API endpoint for LLM service
    - TOPIC_LABELING_MODEL: Model name to use
    - TOPIC_LABELING_ENABLED: Enable/disable topic labeling (1/0, true/false)
    - TOPIC_LABELING_TIMEOUT_SECONDS: Request timeout in seconds
    - TOPIC_LABELING_RETRY_MAX_ATTEMPTS: Maximum retry attempts
    - TOPIC_LABELING_RETRY_BASE_DELAY_SECONDS: Initial retry delay
    - TOPIC_LABELING_RETRY_MAX_DELAY_SECONDS: Maximum retry delay
    - TOPIC_LABELING_API_KEY: API key for authentication
    - OPENROUTER_API_KEY / GROQ_API_KEY: provider-specific key fallback
    - TOPIC_EMBEDDING_MODEL: Embedding model name
    - TOPIC_N_CLUSTERS: Number of clusters for topic modeling
    - TOPIC_CLUSTER_ALGORITHM: Clustering algorithm (kmeans or minibatch)
    - TOKENIZER_BACKEND: Tokenizer backend to use
    """
    
    model_config = SettingsConfigDict(
        env_file=find_dotenv(),
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
        validate_default=False,
    )
    
    # Unified topic labeling configuration
    topic_labeling_provider: str = Field(
        default=LabelingProvider.AUTO.value,
        validation_alias=AliasChoices("TOPIC_LABELING_PROVIDER"),
    )
    topic_labeling_api_url: str = Field(
        default="https://openrouter.ai/api/v1/chat/completions",
        validation_alias=AliasChoices(
            "TOPIC_LABELING_API_URL",
            "OPENROUTER_API_URL",
            "GROQ_API_URL",
        ),
    )
    topic_labeling_model: str = Field(
        default="google/gemini-2.0-flash-lite",
        validation_alias=AliasChoices(
            "TOPIC_LABELING_MODEL",
            "OPENROUTER_MODEL",
            "GROQ_MODEL",
        ),
    )
    topic_labeling_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "TOPIC_LABELING_API_KEY",
            "OPENROUTER_API_KEY",
            "GROQ_API_KEY",
        ),
    )
    topic_labeling_enabled: bool = Field(
        default=True,
        validation_alias=AliasChoices(
            "TOPIC_LABELING_ENABLED",
            "USE_OPENROUTER_LABELING",
        ),
    )
    topic_labeling_timeout_seconds: int = Field(
        default=60,
        validation_alias=AliasChoices(
            "TOPIC_LABELING_TIMEOUT_SECONDS",
            "OPENROUTER_TIMEOUT_SECONDS",
        ),
    )
    topic_labeling_retry_max_attempts: int = Field(
        default=8,
        validation_alias=AliasChoices(
            "TOPIC_LABELING_RETRY_MAX_ATTEMPTS",
            "OPENROUTER_RETRY_MAX_ATTEMPTS",
        ),
    )
    topic_labeling_retry_base_delay_seconds: float = Field(
        default=1.5,
        validation_alias=AliasChoices(
            "TOPIC_LABELING_RETRY_BASE_DELAY_SECONDS",
            "OPENROUTER_RETRY_BASE_DELAY_SECONDS",
        ),
    )
    topic_labeling_retry_max_delay_seconds: float = Field(
        default=20.0,
        validation_alias=AliasChoices(
            "TOPIC_LABELING_RETRY_MAX_DELAY_SECONDS",
            "OPENROUTER_RETRY_MAX_DELAY_SECONDS",
        ),
    )
    topic_labeling_max_topics: int | None = Field(
        default=None,
        validation_alias=AliasChoices("TOPIC_LABELING_MAX_TOPICS"),
    )
    
    # Embedding Configuration
    embedding_model: str = Field(
        default="paraphrase-multilingual-MiniLM-L12-v2",
        validation_alias=AliasChoices("TOPIC_EMBEDDING_MODEL"),
    )
    embedding_service_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("TOPIC_EMBEDDING_SERVICE_URL"),
    )
    hf_token: str | None = Field(
        default=None,
        validation_alias=AliasChoices("TOPIC_HF_TOKEN"),
    )
    
    # Topic Modeling Configuration
    n_clusters: int | None = Field(
        default=None,
        validation_alias=AliasChoices("TOPIC_N_CLUSTERS"),
    )
    cluster_algorithm: str = Field(
        default="kmeans",
        validation_alias=AliasChoices("TOPIC_CLUSTER_ALGORITHM"),
    )
    
    # Tokenizer Configuration
    tokenizer_backend: str = Field(
        default="underthesea",
        validation_alias=AliasChoices("TOKENIZER_BACKEND"),
    )
    
    # Display Configuration  
    show_sample_questions: bool = Field(
        default=False,
        validation_alias=AliasChoices("SHOW_SAMPLE_QUESTIONS"),
    )
    
    max_samples_per_topic: int | None = Field(
        default=10,
        validation_alias=AliasChoices("MAX_SAMPLES_PER_TOPIC"),
    )
        

    @property
    def labeling_provider(self) -> LabelingProvider:
        provider = LABELING_PROVIDER_ALIASES.get(
            _normalize_alias_key(self.topic_labeling_provider),
            LabelingProvider.AUTO,
        )
        if provider == LabelingProvider.AUTO:
            return LabelingProvider.GROQ if "groq.com" in self.topic_labeling_api_url.lower() else LabelingProvider.OPENROUTER
        return provider
    
    @property
    def cluster_algorithm_enum(self) -> ClusteringAlgorithm:
        return parse_cluster_algorithm(self.cluster_algorithm, default=ClusteringAlgorithm.KMEANS)

    @property
    def labeling_api_key(self) -> str | None:
        if self.topic_labeling_api_key and self.topic_labeling_api_key.strip():
            return self.topic_labeling_api_key.strip()
        return None


# Create a global settings instance
_topic_settings = None


def _apply_dashboard_settings_overrides(topic_settings: TopicModelingSettings) -> None:
    """Bridge dashboard service settings into topic modeling settings."""
    try:
        from src.core.settings import settings as dashboard_settings
    except Exception:
        return

    if dashboard_settings.topic_embedding_model:
        topic_settings.embedding_model = dashboard_settings.topic_embedding_model
    if dashboard_settings.topic_embedding_service_url:
        topic_settings.embedding_service_url = dashboard_settings.topic_embedding_service_url
    if dashboard_settings.topic_hf_token:
        topic_settings.hf_token = dashboard_settings.topic_hf_token
    if dashboard_settings.topic_cluster_algorithm:
        topic_settings.cluster_algorithm = dashboard_settings.topic_cluster_algorithm
    if dashboard_settings.topic_tokenizer_backend:
        topic_settings.tokenizer_backend = dashboard_settings.topic_tokenizer_backend

    topic_settings.topic_labeling_enabled = dashboard_settings.topic_labeling_enabled


def get_settings() -> TopicModelingSettings:
    """Get or create the global TopicModelingSettings instance."""
    global _topic_settings
    if _topic_settings is None:
        _topic_settings = TopicModelingSettings()
        _apply_dashboard_settings_overrides(_topic_settings)
    return _topic_settings


class TopicLabelItem(BaseModel):
    topic_id: int
    label: str = Field(min_length=2, max_length=80)

    @field_validator("label")
    @classmethod
    def normalize_label(cls, value: str) -> str:
        cleaned = value.replace("_", " ")
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" .,-")
        if len(cleaned) < 2:
            raise ValueError("Label is too short")
        return cleaned


class TopicLabelResponse(BaseModel):
    labels: list[TopicLabelItem] = Field(default_factory=list)


VIETNAMESE_STOPWORDS: list[str] = [
    # Add Vietnamese stopwords here when needed.
]


def load_sample_docs():
    sample_docs_raw = []
    ignored_markers = {
        "bertopic",
        "fast topic modeling",
        "topic modeling",
    }

    try:
        with open("question.txt", "r", encoding="utf-8") as f:
            for line in f:
                text = line.strip()
                if not text:
                    continue

                normalized = text.lower().strip("#*- ")
                if normalized in ignored_markers:
                    continue

                sample_docs_raw.append(text)
    except FileNotFoundError:
        print("Error: question.txt not found.")
    return sample_docs_raw


def parse_tokenizer_backend(
    backend: str | TokenizerBackend | None,
    default: TokenizerBackend = TokenizerBackend.UNDERTHESEA,
) -> TokenizerBackend:
    if isinstance(backend, TokenizerBackend):
        return backend
    if backend is None:
        return default

    return TOKENIZER_BACKEND_ALIASES.get(_normalize_alias_key(backend), default)


def parse_cluster_algorithm(
    algorithm: str | ClusteringAlgorithm | None,
    default: ClusteringAlgorithm = ClusteringAlgorithm.KMEANS,
) -> ClusteringAlgorithm:
    if isinstance(algorithm, ClusteringAlgorithm):
        return algorithm
    if algorithm is None:
        return default
    return CLUSTER_ALGORITHM_ALIASES.get(_normalize_alias_key(algorithm), default)


def init_vietnamese_tokenizer(
    backend: str | TokenizerBackend = TokenizerBackend.UNDERTHESEA,
) -> tuple[Any | None, TokenizerBackend]:
    """Initialize Vietnamese tokenizer backend and return callable(text)->segmented_text."""
    resolved_backend = parse_tokenizer_backend(backend)

    if resolved_backend == TokenizerBackend.NONE:
        print("Tokenizer disabled (backend=none).")
        return None, resolved_backend

    if resolved_backend == TokenizerBackend.UNDERTHESEA:
        try:
            from underthesea import word_tokenize

            print("✓ Underthesea loaded")
            return lambda text: word_tokenize(text, format="text"), resolved_backend
        except ImportError:
            print("✗ underthesea not installed. Run: uv add underthesea")
            return None, resolved_backend
        except Exception as error:
            print(f"✗ Error initializing Underthesea: {error}")
            return None, resolved_backend

    if resolved_backend == TokenizerBackend.PYVI:
        try:
            from pyvi import ViTokenizer

            print("✓ PyVi loaded")
            return ViTokenizer.tokenize, resolved_backend
        except ImportError:
            print("✗ pyvi not installed. Run: uv add pyvi")
            return None, resolved_backend
        except Exception as error:
            print(f"✗ Error initializing PyVi: {error}")
            return None, resolved_backend

    if resolved_backend == TokenizerBackend.SPACY:
        try:
            import spacy

            model_candidates = ["vi_core_news_lg", "vi_core_news_md", "vi_core_news_sm"]
            nlp = None
            for model_name in model_candidates:
                try:
                    nlp = spacy.load(model_name)
                    print(f"✓ spaCy loaded with model: {model_name}")
                    break
                except Exception:
                    continue

            if nlp is None:
                nlp = spacy.blank("vi")
                print(
                    "✓ spaCy loaded with blank('vi'). "
                    "Install vi_core_news_sm for better tokenization."
                )

            def _spacy_tokenize(text: str) -> str:
                doc = nlp(text)
                return " ".join(token.text for token in doc)

            return _spacy_tokenize, resolved_backend
        except ImportError:
            print("✗ spacy not installed. Run: uv add spacy")
            return None, resolved_backend
        except Exception as error:
            print(f"✗ Error initializing spaCy: {error}")
            return None, resolved_backend

    return None, resolved_backend


def tokenize_vietnamese_text(text: str, tokenize_func: Any | None) -> str:
    """Tokenize text using either unified tokenizer callable or underthesea-style callable."""
    if tokenize_func is None:
        return text

    try:
        segmented = tokenize_func(text)
    except TypeError:
        segmented = tokenize_func(text, format="text")

    if isinstance(segmented, str):
        return segmented
    return str(segmented)


def init_underthesea() -> Any | None:
    """Initialize underthesea word tokenizer."""
    tokenize_func, _ = init_vietnamese_tokenizer(TokenizerBackend.UNDERTHESEA)
    return tokenize_func


def preprocess_vietnamese_for_fast_topic(text: str, tokenize_func: Any | None) -> str:
    """Preprocess Vietnamese text for fast topic modeling."""
    if tokenize_func is None:
        return text

    text = text.rstrip("?").strip().lower()
    segmented = tokenize_vietnamese_text(text, tokenize_func)
    words = segmented.split()

    filtered_words = []
    for word in words:
        word_clean = word.strip()
        if word_clean:
            filtered_words.append(word_clean)

    return "_".join(filtered_words)


def preprocess_vietnamese_for_bertopic(text: str, tokenize_func: Any | None) -> str:
    """Preprocess Vietnamese text for BERTopic using segmented tokens."""
    if tokenize_func is None:
        return text

    segmented = tokenize_vietnamese_text(text, tokenize_func)
    return segmented.replace(" ", "_")


def print_topic_labeling_configuration(
    total_docs: int,
    n_clusters: int | None = None,
    tokenizer_backend: str | TokenizerBackend | None = None,
    use_underthesea: bool | None = None,
):
    """Print common configuration for topic modeling experiments."""
    settings = get_settings()
    default_backend = (
        TokenizerBackend.UNDERTHESEA if use_underthesea is not False else TokenizerBackend.NONE
    )
    resolved_backend = parse_tokenizer_backend(tokenizer_backend, default=default_backend)

    print(f"\nConfiguration:")
    print(f"  - Tokenizer backend: {resolved_backend.value}")
    if n_clusters is not None:
        print(f"  - Number of clusters: {n_clusters if n_clusters else 'auto'}")
    print(f"  - Topic labeling enabled: {settings.topic_labeling_enabled}")
    print(f"  - Topic labeling provider: {settings.labeling_provider.value}")
    print(f"  - Topic labeling model: {settings.topic_labeling_model}")
    print(f"  - Topic labeling url: {settings.topic_labeling_api_url}")
    print(f"  - Topic labeling timeout: {settings.topic_labeling_timeout_seconds}s")
    print(f"  - Topic labeling max attempts: {settings.topic_labeling_retry_max_attempts}")
    max_topics_text = (
        str(settings.topic_labeling_max_topics)
        if settings.topic_labeling_max_topics and settings.topic_labeling_max_topics > 0
        else "all"
    )
    print(f"  - Topic labeling max topics: {max_topics_text}")
    print(
        f"  - Topic labeling retry delay: {settings.topic_labeling_retry_base_delay_seconds}s"
        f" -> {settings.topic_labeling_retry_max_delay_seconds}s"
    )
    print(f"  - Total documents: {total_docs}")


def display_topic_modeling_results(
    docs,
    topics,
    topic_words,
    topic_labels: dict[int, str] | None = None,
    title: str = "TOPIC MODELING RESULTS",
    line_width: int = 70,
    max_samples_per_topic: int | None = None,
):
    """Display topic modeling results in a shared format. Assumes data already filtered."""
    if topic_labels is None:
        topic_labels = {}

    print("\n" + "=" * line_width)
    print(title)
    print("=" * line_width)

    topic_counts = {}
    for topic in topics:
        topic_counts[topic] = topic_counts.get(topic, 0) + 1

    print(f"\nTotal topics: {len(topic_counts)}")
    print(f"Total documents: {len(docs)}")

    for topic_id in sorted(topic_counts.keys()):
        count = topic_counts[topic_id]
        print(f"\n--- Topic {topic_id} ({count} documents) ---")

        topic_label = topic_labels.get(int(topic_id))
        print(f"Label: {topic_label if topic_label else '(not assigned)'}")

        words = topic_words.get(topic_id, [])
        # sort by score from highest to lowest if available, otherwise by token
        words.sort(key=lambda x: float(x[1]) if isinstance(x, (list, tuple)) and len(x) >= 2 else 0, reverse=True)
        if words:
            top_words = []
            for item in words[:9]:
                if isinstance(item, (list, tuple)) and len(item) >= 1:
                    top_words.append(str(item[0]))
                else:
                    top_words.append(str(item))
            print("Top words:", ", ".join(top_words))
        else:
            print("Top words: (not enough documents)")

        topic_docs = [docs[index] for index, topic in enumerate(topics) if topic == topic_id]
        if max_samples_per_topic is None:
            displayed_docs = topic_docs
        else:
            displayed_docs = topic_docs[: max(0, max_samples_per_topic)]

        if (get_settings().show_sample_questions):
            print("Sample questions:")            
            for index, doc in enumerate(displayed_docs):
                print(f"  {index + 1}. {doc}")

    print("\n" + "=" * line_width)
    print("SUMMARY")
    print("=" * line_width)

    small_clusters = [topic_id for topic_id, count in topic_counts.items() if count < 2]
    if small_clusters:
        print(f"Small clusters (potential outliers): {len(small_clusters)}")

    print(
        f"\nLargest topic: Topic {max(topic_counts, key=topic_counts.get)} "
        f"({max(topic_counts.values())} docs)"
    )


def save_topic_modeling_results(
    docs,
    topics,
    topic_words,
    topic_labels: dict[int, str] | None = None,
    output_dir: str = "./topic_output",
    summary_title: str = "TOPIC MODELING SUMMARY",
):
    """Save topic assignments, top words, labels, and summary to files. Assumes data already filtered."""
    if topic_labels is None:
        topic_labels = {}

    os.makedirs(output_dir, exist_ok=True)

    with open(f"{output_dir}/topic_assignments.csv", "w", encoding="utf-8") as file_obj:
        file_obj.write("Document,Topic,Label,Question\n")
        for index, (doc, topic) in enumerate(zip(docs, topics)):
            label = topic_labels.get(int(topic), "")
            file_obj.write(f'"{index}","{topic}","{label}","{doc}"\n')

    with open(f"{output_dir}/topic_words.txt", "w", encoding="utf-8") as file_obj:
        for topic_id, words in sorted(topic_words.items()):
            file_obj.write(f"\nTopic {topic_id}:\n")
            file_obj.write(f"  Label: {topic_labels.get(int(topic_id), '')}\n")
            formatted_words = []
            for item in words[:10]:
                if isinstance(item, (list, tuple)) and len(item) >= 2:
                    token = item[0]
                    try:
                        score = float(item[1])
                        formatted_words.append(f"{token}({score:.3f})")
                    except (TypeError, ValueError):
                        formatted_words.append(str(token))
                else:
                    formatted_words.append(str(item))
            file_obj.write("  " + ", ".join(formatted_words) + "\n")

    with open(f"{output_dir}/topic_labels.txt", "w", encoding="utf-8") as file_obj:
        for topic_id in sorted({int(topic) for topic in topics}):
            file_obj.write(f"Topic {topic_id}: {topic_labels.get(topic_id, '')}\n")

    with open(f"{output_dir}/summary.txt", "w", encoding="utf-8") as file_obj:
        file_obj.write(summary_title + "\n")
        file_obj.write("=" * 50 + "\n\n")
        topic_counts = {}
        for topic in topics:
            topic_counts[topic] = topic_counts.get(topic, 0) + 1

        file_obj.write(f"Total topics: {len(topic_counts)}\n")
        file_obj.write(f"Total documents: {len(docs)}\n\n")

        for topic_id in sorted(topic_counts.keys()):
            file_obj.write(
                f"Topic {topic_id}: {topic_counts[topic_id]} documents "
                f"| Label: {topic_labels.get(int(topic_id), '')}\n"
            )

    print(f"\n✓ Results saved to: {output_dir}/")


def _extract_json_object(text: str) -> dict[str, Any] | None:
    if not text:
        return None

    normalized = text.strip()
    normalized = normalized.replace("```json", "").replace("```", "").strip()

    try:
        data = json.loads(normalized)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}", normalized)
    if not match:
        return None

    try:
        data = json.loads(match.group(0))
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def _fallback_topic_label(top_words: list[str], sample_questions: list[str]) -> str:
    combined_text = " ".join(top_words + sample_questions).lower().replace("_", " ")

    rule_based_labels = [
        (["wifi", "internet", "mạng"], "Hạ tầng wifi và kết nối"),
        (["sự kiện", "hội thảo", "hoạt động"], "Sự kiện và hoạt động trường"),
        (["học phí", "chi phí", "học bổng"], "Học phí và hỗ trợ tài chính"),
        (["ký túc xá", "ăn trưa", "cơ sở vật chất"], "Cơ sở vật chất và tiện ích"),
        (["thực tập", "việc làm", "nghề nghiệp"], "Hỗ trợ nghề nghiệp"),
        (["trực tuyến", "online", "elearning"], "Học tập trực tuyến"),
        (["giảng viên", "thầy cô", "giảng dạy", "giáo viên"], "Giảng dạy và giảng viên"),
        (["thư viện", "sách", "tài liệu", "mượn sách"], "Thư viện và tài nguyên học tập"),
        (["đăng ký môn", "môn học", "tín chỉ", "thời khóa biểu"], "Môn học và đăng ký tín chỉ"),
        (["thi", "điểm", "kiểm tra", "đánh giá"], "Thi cử và đánh giá học tập"),
        (["tuyển sinh", "xét tuyển", "hồ sơ", "đầu vào"], "Tuyển sinh và điều kiện đầu vào"),
        (["ngành", "chuyên ngành", "chương trình đào tạo", "ctđt"], "Ngành học và chương trình đào tạo"),
    ]

    for keywords, label in rule_based_labels:
        if any(keyword in combined_text for keyword in keywords):
            return label

    if top_words:
        best_word = top_words[0].replace("_", " ").strip()
        return best_word[:70] if best_word else "Chủ đề tổng quát"

    return "Chủ đề tổng quát"


def _normalize_label_text(label: str) -> str:
    cleaned = label.replace("_", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .,-")
    return cleaned


def _topic_context_prompt_block(topic_context: list[dict[str, Any]]) -> str:
    return (
        "Dựa vào dữ liệu topic sau, hãy tạo nhãn cho từng topic.\n"
        "Yêu cầu:\n"
        "- Nhãn tiếng Việt, 5-15 từ, ngắn gọn và bao quát.\n"
        "- Không dùng dấu gạch dưới.\n"
        "- Không lặp lại nguyên văn câu hỏi.\n"
        "- Tránh nhãn mơ hồ hoặc cụm từ rời rạc kiểu địa danh rút gọn.\n"
        "- Trả về đúng JSON, không thêm giải thích ngoài JSON.\n"
        "- Bắt buộc theo cấu trúc sau:\n"
        "{\n"
        "  \"labels\": [\n"
        "    {\"topic_id\": 0, \"label\": \"Tên nhãn\"}\n"
        "  ]\n"
        "}\n"
        "- topic_id phải là số nguyên.\n"
        "- label là chuỗi 2-80 ký tự.\n\n"
        f"Dữ liệu topic:\n{json.dumps(topic_context, ensure_ascii=False, indent=2)}"
    )


def _build_topic_context(docs, topics, topic_words):
    topic_ids = sorted({int(t) for t in topics})
    topic_context = []
    fallback_labels: dict[int, str] = {}
    max_topics = get_settings().topic_labeling_max_topics
    settings = get_settings()

    topic_counts: dict[int, int] = {}
    for topic in topics:
        topic_id = int(topic)
        topic_counts[topic_id] = topic_counts.get(topic_id, 0) + 1

    if max_topics is None or max_topics <= 0 or max_topics >= len(topic_counts):
        selected_topic_ids = set(topic_counts.keys())
    else:
        selected_topic_ids = set(
            topic_id
            for topic_id, _ in sorted(
                topic_counts.items(),
                key=lambda item: (-item[1], item[0]),
            )[:max_topics]
        )

    for topic_id in topic_ids:
        topic_docs = [docs[i] for i, t in enumerate(topics) if int(t) == topic_id][:settings.max_samples_per_topic - 1]
        top_words = [w[0].replace("_", " ") for w in topic_words.get(topic_id, [])]

        if topic_id not in selected_topic_ids:
            continue

        fallback_labels[topic_id] = _fallback_topic_label(top_words, topic_docs)
        topic_context.append(
            {
                "topic_id": topic_id,
                "top_words": top_words,
                "sample_questions": topic_docs,
            }
        )

    return topic_context, fallback_labels


def filter_topic_results_by_frequency(
    docs,
    topics,
    topic_words,
    max_topics: int | None,
):
    """Keep only top topics by document count and drop all other topic data."""
    if max_topics is None or max_topics <= 0:
        return docs, topics, topic_words

    topic_counts: dict[int, int] = {}
    for topic in topics:
        topic_id = int(topic)
        topic_counts[topic_id] = topic_counts.get(topic_id, 0) + 1

    unique_topic_count = len(topic_counts)
    if max_topics >= unique_topic_count:
        return docs, topics, topic_words

    selected_topic_ids = {
        topic_id
        for topic_id, _ in sorted(topic_counts.items(), key=lambda item: (-item[1], item[0]))[:max_topics]
    }

    filtered_docs = []
    filtered_topics = []
    for doc, topic in zip(docs, topics):
        topic_id = int(topic)
        if topic_id in selected_topic_ids:
            filtered_docs.append(doc)
            filtered_topics.append(topic_id)

    filtered_topic_words = {
        int(topic_id): words
        for topic_id, words in topic_words.items()
        if int(topic_id) in selected_topic_ids
    }

    return filtered_docs, filtered_topics, filtered_topic_words


def apply_topic_frequency_filter_from_settings(
    docs,
    topics,
    topic_words,
):
    """Apply top-topic filtering based on settings and print concise filter stats."""
    settings = get_settings()
    filtered_docs, filtered_topics, filtered_topic_words = filter_topic_results_by_frequency(
        docs,
        topics,
        topic_words,
        max_topics=settings.topic_labeling_max_topics,
    )

    if len(filtered_topics) != len(topics):
        kept_topic_count = len({int(t) for t in filtered_topics})
        print(
            f"\nApplying top-topic filter: keeping {kept_topic_count} topics "
            f"({len(filtered_topics)}/{len(topics)} documents)"
        )

    return filtered_docs, filtered_topics, filtered_topic_words


async def _post_llm_request(
    payload: dict[str, Any],
    api_key: str,
    api_url: str,
    timeout: int,
    provider: LabelingProvider,
) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "DATN-Chatbot-topic-modeling/1.0",
    }
    if provider == LabelingProvider.OPENROUTER:
        headers["X-Title"] = "fast-topic-modeling"

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            api_url,
            json=payload,
            headers=headers,
        )
        response.raise_for_status()
        return response.json()


def _is_retryable_http_status(status_code: int) -> bool:
    """Check if HTTP error is retryable.
    
    Returns True for transient errors that should be retried:
    - 408: Request Timeout
    - 425: Too Early
    - 429: Too Many Requests (Rate Limit)
    - 500: Internal Server Error
    - 502: Bad Gateway
    - 503: Service Unavailable
    - 504: Gateway Timeout
    """
    return status_code in {408, 425, 429, 500, 502, 503, 504}


def _is_retryable_http_error(provider: LabelingProvider, status_code: int, message: str) -> bool:
    if not _is_retryable_http_status(status_code):
        return False

    # Groq 403 with Cloudflare 1010 is a hard block/auth issue, do not retry.
    if provider == LabelingProvider.GROQ and status_code == 403:
        normalized = (message or "").lower()
        if "1010" in normalized:
            return False

    return True


def _retry_delay_seconds(attempt: int, base_delay: float, max_delay: float) -> float:
    delay = base_delay * (2 ** max(0, attempt - 1))
    return min(max_delay, delay)


async def generate_topic_labels_with_openrouter(
    docs,
    topics,
    topic_words,
) -> dict[int, str]:
    """Generate topic labels with configured provider. Assumes data already filtered."""
    settings = get_settings()

    provider = settings.labeling_provider

    provider_label = provider.value.capitalize()
    print(f"\n5. Generating topic labels with {provider_label} LLM...")
    print(f"   Provider: {provider.value}")
    print(f"   Model: {settings.topic_labeling_model}")
    print(f"   API URL: {settings.topic_labeling_api_url}")

    topic_context, fallback_labels = _build_topic_context(docs, topics, topic_words)

    if not settings.topic_labeling_enabled:
        print("   TOPIC_LABELING_ENABLED=False. Using fallback labels.")
        return fallback_labels

    api_key = settings.labeling_api_key
    if not api_key:
        print("   API key not found. Using fallback labels.")
        return fallback_labels

    masked_key = f"***{api_key[-4:]}" if len(api_key) >= 4 else "***"
    print(f"   API key loaded from: settings ({masked_key})")

    system_prompt = (
        "Bạn là chuyên gia phân cụm chủ đề giáo dục tiếng Việt cho trường Đại học Bách khoa thành phố Hồ Chí Minh. "
        "Nhiệm vụ: gán nhãn ngắn gọn, tổng quát và dễ hiểu cho từng cụm câu hỏi."
    )

    # Divide topic_context into batches of 10 for the primary pass
    batch_size = 10
    topic_batches = [topic_context[i : i + batch_size] for i in range(0, len(topic_context), batch_size)]
    
    max_attempts = max(1, settings.topic_labeling_retry_max_attempts)
    labels = fallback_labels.copy()
    topic_context_by_id = {int(item["topic_id"]): item for item in topic_context}
    pending_topic_ids: set[int] = set(topic_context_by_id.keys())

    for batch_idx, batch in enumerate(topic_batches):
        print(f"   --- Processing Batch {batch_idx + 1}/{len(topic_batches)} ({len(batch)} topics) ---")
        pending_batch_ids = {int(item["topic_id"]) for item in batch}

        for attempt in range(1, max_attempts + 1):
            if not pending_batch_ids:
                break

            remaining_context_in_batch = [
                topic_context_by_id[topic_id]
                for topic_id in sorted(pending_batch_ids)
            ]
            
            user_prompt = _topic_context_prompt_block(remaining_context_in_batch)
            payload = {
                "model": settings.topic_labeling_model,
                "temperature": 0.1,
                "messages": [
                    {"role": "user", "content": system_prompt + user_prompt},
                ],
            }

            should_retry = False

            try:
                response_json = await _post_llm_request(
                    payload=payload,
                    api_key=api_key,
                    api_url=settings.topic_labeling_api_url,
                    timeout=settings.topic_labeling_timeout_seconds,
                    provider=provider,
                )
                content = response_json.get("choices", [{}])[0].get("message", {}).get("content", "")

                if isinstance(content, list):
                    content = "\n".join(
                        str(item.get("text", "")) for item in content if isinstance(item, dict)
                    )

                parsed = _extract_json_object(str(content))
                if parsed is None:
                    should_retry = True
                    print(
                        f"   Warning: Invalid JSON output in batch {batch_idx + 1} (attempt {attempt}/{max_attempts})."
                    )
                else:
                    structured = TopicLabelResponse.model_validate(parsed)

                    accepted_in_attempt = 0
                    for item in structured.labels:
                        topic_id = int(item.topic_id)
                        if topic_id not in pending_batch_ids:
                            continue

                        candidate_label = _normalize_label_text(item.label)
                        labels[topic_id] = candidate_label
                        pending_batch_ids.discard(topic_id)
                        pending_topic_ids.discard(topic_id)
                        accepted_in_attempt += 1

                    if pending_batch_ids:
                        should_retry = attempt < max_attempts
                        print(
                            f"   Warning: Missing {len(pending_batch_ids)} labels in batch {batch_idx + 1} "
                            f"(attempt {attempt}/{max_attempts})."
                        )
                    else:
                        print(f"   ✓ Batch {batch_idx + 1} completed successfully.")
                        break

                    if accepted_in_attempt > 0:
                        print(f"   Accepted {accepted_in_attempt} labels in this attempt.")

            except ValidationError as error:
                should_retry = True
                print(
                    f"   Warning: Structured validation failed in batch {batch_idx + 1} (attempt {attempt}/{max_attempts}): "
                    f"{error.errors()[:1]}"
                )
            except httpx.HTTPStatusError as error:
                error_message = error.response.text
                should_retry = _is_retryable_http_error(provider, error.response.status_code, error_message)
                print(
                    f"   Warning: {provider_label} HTTP error {error.response.status_code} "
                    f"in batch {batch_idx + 1} (attempt {attempt}/{max_attempts}): {error_message[:220]}"
                )
            except httpx.RequestError as error:
                should_retry = True
                print(
                    f"   Warning: {provider_label} request error in batch {batch_idx + 1} (attempt {attempt}/{max_attempts}): {error}"
                )
            except TimeoutError as error:
                should_retry = True
                print(
                    f"   Warning: {provider_label} timeout in batch {batch_idx + 1} (attempt {attempt}/{max_attempts}): {error}"
                )
            except Exception as error:
                should_retry = True
                print(f"   Warning: {provider_label} request failed in batch {batch_idx + 1}: {error}")

            if attempt == max_attempts or (not pending_batch_ids and not should_retry):
                break

            if not should_retry:
                break
            
            if should_retry:
                delay = _retry_delay_seconds(
                    attempt=attempt,
                    base_delay=settings.topic_labeling_retry_base_delay_seconds,
                    max_delay=settings.topic_labeling_retry_max_delay_seconds,
                )
                print(f"   Retrying batch {batch_idx + 1} in {delay:.1f}s...")
                await asyncio.sleep(delay)

    # Secondary recovery pass: retry each failed topic individually.
    if pending_topic_ids:
        per_topic_attempts = max(1, min(5, max_attempts))
        print(
            "   Switching to per-topic retries for remaining topics: "
            + ", ".join(str(topic_id) for topic_id in sorted(pending_topic_ids))
        )

        for topic_id in list(sorted(pending_topic_ids)):
            topic_context_item = topic_context_by_id.get(topic_id)
            if topic_context_item is None:
                continue

            for topic_attempt in range(1, per_topic_attempts + 1):
                user_prompt = _topic_context_prompt_block([topic_context_item])
                payload = {
                    "model": settings.topic_labeling_model,
                    "temperature": 0.1,
                    "messages": [
                        {"role": "user", "content": system_prompt + user_prompt},
                    ],
                }

                should_retry_topic = False
                try:
                    response_json = await _post_llm_request(
                        payload=payload,
                        api_key=api_key,
                        api_url=settings.topic_labeling_api_url,
                        timeout=settings.topic_labeling_timeout_seconds,
                        provider=provider,
                    )
                    content = response_json.get("choices", [{}])[0].get("message", {}).get("content", "")
                    if isinstance(content, list):
                        content = "\n".join(
                            str(item.get("text", "")) for item in content if isinstance(item, dict)
                        )

                    parsed = _extract_json_object(str(content))
                    if parsed is None:
                        should_retry_topic = True
                    else:
                        structured = TopicLabelResponse.model_validate(parsed)
                        accepted_label: str | None = None
                        for item in structured.labels:
                            if int(item.topic_id) == topic_id:
                                accepted_label = _normalize_label_text(item.label)
                                break

                        if accepted_label:
                            labels[topic_id] = accepted_label
                            pending_topic_ids.discard(topic_id)
                            print(
                                f"   ✓ Topic {topic_id} labeled in per-topic retry "
                                f"({topic_attempt}/{per_topic_attempts})"
                            )
                            break

                        should_retry_topic = True

                except ValidationError:
                    should_retry_topic = True
                except httpx.HTTPStatusError as error:
                    error_message = error.response.text
                    should_retry_topic = _is_retryable_http_error(provider, error.response.status_code, error_message)
                    if not should_retry_topic:
                        break
                except (httpx.RequestError, TimeoutError, Exception):
                    should_retry_topic = True

                if topic_attempt == per_topic_attempts or not should_retry_topic:
                    break

                time_delay = _retry_delay_seconds(
                    attempt=topic_attempt,
                    base_delay=settings.topic_labeling_retry_base_delay_seconds,
                    max_delay=settings.topic_labeling_retry_max_delay_seconds,
                )
                await asyncio.sleep(time_delay)

    if pending_topic_ids:
        print(
            "   Using fallback labels for remaining topics: "
            + ", ".join(str(topic_id) for topic_id in sorted(pending_topic_ids))
        )

    return labels
    
    




class TopicModelingPipeline:
    """Facade class for topic modeling pipeline with centralized filtering."""

    def __init__(self, docs, topics, topic_words):
        """Initialize pipeline with raw data and apply topic frequency filtering once."""
        self.docs_original = docs
        self.topics_original = topics
        self.topic_words_original = topic_words

        # Apply filter once at initialization
        (
            self.docs,
            self.topics,
            self.topic_words,
        ) = apply_topic_frequency_filter_from_settings(docs, topics, topic_words)

    def generate_labels(self) -> dict[int, str]:
        """Generate topic labels using filtered data."""
        return generate_topic_labels_with_openrouter(
            self.docs, self.topics, self.topic_words
        )

    def display_results(
        self,
        topic_labels: dict[int, str] | None = None,
        title: str = "TOPIC MODELING RESULTS",
        line_width: int = 70,
        max_samples_per_topic: int | None = None,
    ) -> None:
        """Display topic modeling results using filtered data."""
        display_topic_modeling_results(
            self.docs,
            self.topics,
            self.topic_words,
            topic_labels=topic_labels,
            title=title,
            line_width=line_width,
            max_samples_per_topic=max_samples_per_topic,
        )

    def save_results(
        self,
        topic_labels: dict[int, str] | None = None,
        output_dir: str = "./topic_output",
        summary_title: str = "TOPIC MODELING SUMMARY",
    ) -> None:
        """Save topic modeling results using filtered data."""
        save_topic_modeling_results(
            self.docs,
            self.topics,
            self.topic_words,
            topic_labels=topic_labels,
            output_dir=output_dir,
            summary_title=summary_title,
        )