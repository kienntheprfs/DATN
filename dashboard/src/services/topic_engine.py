"""
FAST Vietnamese Topic Modeling with KMeans/MiniBatchKMeans + Sentence Embeddings
Giải pháp nhanh và hiệu quả cho việc phân tích topic từ câu hỏi tiếng Việt
"""
import warnings
from typing import Any

warnings.filterwarnings("ignore")

import asyncio
import time
import httpx

import numpy as np

from src.services.util import (
    ClusteringAlgorithm,
    RANDOM_SEED,
    TokenizerBackend,
    TopicModelingPipeline,
    generate_topic_labels_with_openrouter,
    get_settings,
    init_vietnamese_tokenizer,
    load_sample_docs,
    parse_cluster_algorithm,
    parse_tokenizer_backend,
    preprocess_vietnamese_for_fast_topic,
    print_topic_labeling_configuration,
    VIETNAMESE_STOPWORDS,
)


def _create_cluster_model(
    n_clusters: int,
    random_seed: int,
    cluster_algorithm: str,
):
    from sklearn.cluster import KMeans, MiniBatchKMeans
    if cluster_algorithm == "kmeans":
        return KMeans(
            n_clusters=n_clusters,
            random_state=random_seed,
            n_init=15,
            max_iter=500,
            algorithm="lloyd",
        )

    return MiniBatchKMeans(
        n_clusters=n_clusters,
        batch_size=100,
        random_state=random_seed,
        n_init=15,
        max_iter=300,
    )

def find_optimal_clusters(
    embeddings,
    max_clusters=15,
    min_clusters=3,
    random_seed=RANDOM_SEED,
    cluster_algorithm: str = "kmeans",
):
    """Find optimal number of clusters with deterministic silhouette scoring."""
    print("\nFinding optimal number of clusters...")

    if len(embeddings) <= min_clusters:
        fallback_k = max(2, min(len(embeddings), min_clusters))
        print(f"✓ Optimal clusters (fallback): {fallback_k}")
        return fallback_k

    # Use a subset for faster computation (deterministic sampling).
    sample_size = min(1000, len(embeddings))
    rng = np.random.default_rng(random_seed)
    sample_indices = rng.choice(len(embeddings), sample_size, replace=False)
    sample_embeddings = embeddings[sample_indices]

    max_k = min(max_clusters, max(2, len(sample_embeddings) - 1))
    min_k = min(min_clusters, max_k)
    candidate_k = list(range(min_k, max_k + 1))

    if not candidate_k:
        fallback_k = max(2, min(8, len(embeddings) // 6))
        print(f"✓ Optimal clusters (fallback): {fallback_k}")
        return fallback_k

    best_k = candidate_k[0]
    best_score = float("-inf")

    for k in candidate_k:
        cluster_model = _create_cluster_model(
            n_clusters=k,
            random_seed=random_seed,
            cluster_algorithm=cluster_algorithm,
        )
        labels = cluster_model.fit_predict(sample_embeddings)

        # Skip invalid clusterings.
        if len(set(labels)) < 2:
            continue

        from sklearn.metrics import silhouette_score
        silhouette = silhouette_score(sample_embeddings, labels, metric="cosine")
        cluster_sizes = np.bincount(labels, minlength=k)
        imbalance_penalty = float(cluster_sizes.max()) / float(sample_size)

        # Favor semantic separation while discouraging one dominant mega-cluster.
        combined_score = silhouette - 0.15 * imbalance_penalty

        if combined_score > best_score:
            best_score = combined_score
            best_k = k

    optimal_k = int(best_k)
    print(f"✓ Optimal clusters: {optimal_k}")
    return optimal_k

def extract_topic_words_c_tfidf(docs, topics, n_top_words=10):
    """
    Extract top words for each topic using c-TF-IDF (cluster-based TF-IDF)
    This is what BERTopic uses - calculates TF-IDF within each cluster separately
    """
    from sklearn.feature_extraction.text import CountVectorizer
    import numpy as np
    
    topic_words = {}
    feature_names = None
    
    # For each cluster, calculate TF-IDF within that cluster only
    for topic_id in sorted(set(topics)):
        # Get documents in this cluster
        cluster_docs = [doc for i, doc in enumerate(docs) if topics[i] == topic_id]
        
        if len(cluster_docs) < 1:
            topic_words[topic_id] = []
            continue
        
        # Vectorize ONLY this cluster (not the whole corpus)
        vectorizer = CountVectorizer(
            ngram_range=(1, 2),
            stop_words=VIETNAMESE_STOPWORDS,
            min_df=1,  # At least 1 doc in cluster
            max_df=1.0
        )
        
        try:
            X = vectorizer.fit_transform(cluster_docs)
            feature_names = vectorizer.get_feature_names_out()
            
            # Calculate c-TF-IDF
            # TF = term frequency in cluster
            tf = np.asarray(X.sum(axis=0)).flatten()
            
            # IDF = log(total_clusters / clusters_containing_term)
            # For single cluster, IDF = 1 (or we can skip it)
            # We'll use just TF normalized by cluster size
            c_tf_idf = tf / len(cluster_docs)
            
            # Get top words
            top_indices = c_tf_idf.argsort()[-n_top_words:][::-1]
            top_words = [(feature_names[i], float(c_tf_idf[i])) for i in top_indices if c_tf_idf[i] > 0]
            
            topic_words[topic_id] = top_words
            
        except ValueError as e:
            print(f"  Warning: Topic {topic_id} has no valid terms: {e}")
            topic_words[topic_id] = []
    
    return topic_words

def analyze_topic_sentiment(
    docs: list[str],
    topics: list[int],
) -> dict[int, dict[str, float]]:
    """
    Analyse sentiment for each document using underthesea and aggregate
    per-topic statistics.

    Returns:
        dict mapping topic_id -> {"positive": float, "neutral": float}
        where values are percentages (0-100).
    """
    try:
        from underthesea import sentiment as underthesea_sentiment  # type: ignore
    except ImportError:
        print("  Warning: underthesea not installed; skipping sentiment analysis.")
        return {}

    print("\n5. Running sentiment analysis...")
    # Batch-classify
    sentiments: list[str] = []
    for doc in docs:
        try:
            result = underthesea_sentiment(doc)
            # underthesea returns e.g. "positive", "negative", "neutral"
            label = str(result).lower() if isinstance(result, str) else str(result[0]).lower()
            sentiments.append(label)
        except Exception:
            sentiments.append("neutral")

    # Aggregate per topic
    topic_ids = sorted(set(topics))
    topic_sentiment: dict[int, dict[str, float]] = {}
    for topic_id in topic_ids:
        indices = [i for i, t in enumerate(topics) if t == topic_id]
        if not indices:
            topic_sentiment[topic_id] = {"positive": 0.0, "neutral": 100.0}
            continue
        positive = sum(1 for i in indices if sentiments[i] == "positive")
        neutral = len(indices) - positive  # treat negative as neutral for display
        total = len(indices)
        topic_sentiment[topic_id] = {
            "positive": round(positive / total * 100, 1),
            "neutral": round(neutral / total * 100, 1),
        }

    print(f"   Sentiment done for {len(topic_ids)} topics")
    return topic_sentiment



async def fast_topic_modeling(
    docs,
    n_clusters=None,
    embedding_model_name: str | None = None,
    cluster_algorithm: str = "kmeans",
    tokenizer_backend: str | TokenizerBackend = TokenizerBackend.UNDERTHESEA,
):
    """
    Fast topic modeling using MiniBatch KMeans on sentence embeddings
    
    Args:
        docs: List of documents (questions)
        n_clusters: Number of topics (if None, auto-detect)
        tokenizer_backend: underthesea | pyvi | spacy | none
    
    Returns:
        topics: Cluster labels for each document
        topic_words: Top words for each topic
        embeddings: Sentence embeddings
    """
    start_time = time.time()
    
    # 1. Preprocess
    print("\n1. Preprocessing documents...")
    tokenize_func, resolved_backend = init_vietnamese_tokenizer(tokenizer_backend)
    print(f"   Tokenizer backend: {resolved_backend.value}")
    
    if tokenize_func:
        processed_docs = [
            preprocess_vietnamese_for_fast_topic(doc, tokenize_func) for doc in docs
        ]
    else:
        processed_docs = docs
    
    # 2. Create embeddings (FAST model)
    print("\n2. Creating sentence embeddings...")
    model_name = embedding_model_name or get_settings().embedding_model or "paraphrase-multilingual-MiniLM-L12-v2"
    print(f"   Using: {model_name}")

    # Use the cached model loader
    embedding_model = get_embedding_model(model_name)

    # Keep embeddings close to natural sentence form for better semantic quality.
    embedding_docs = [doc.strip().rstrip("?") for doc in docs]
    
    # Encode with batching for speed
    embeddings = await embedding_model.encode(
        embedding_docs,
        batch_size=32,
        show_progress_bar=True,
        convert_to_numpy=True,
        normalize_embeddings=True  # Normalize for cosine similarity
    )
    
    embed_time = time.time()
    print(f"   Embeddings created in {embed_time - start_time:.2f}s")
    
    # 3. Find optimal clusters or use default
    if n_clusters is None:
        auto_max_clusters = min(20, max(6, len(docs) // 5))
        n_clusters = find_optimal_clusters(
            embeddings,
            max_clusters=auto_max_clusters,
            min_clusters=3,
            random_seed=RANDOM_SEED,
            cluster_algorithm=cluster_algorithm,
        )
    
    # 4. Cluster with selected KMeans variant
    algorithm_label = "KMeans" if cluster_algorithm == "kmeans" else "MiniBatchKMeans"
    print(f"\n3. Clustering into {n_clusters} topics using {algorithm_label}...")
    cluster_model = _create_cluster_model(
        n_clusters=n_clusters,
        random_seed=RANDOM_SEED,
        cluster_algorithm=cluster_algorithm,
    )
    
    topics = cluster_model.fit_predict(embeddings)
    cluster_time = time.time()
    print(f"   Clustering done in {cluster_time - embed_time:.2f}s")
    
    # 5. Extract top words for each topic using c-TF-IDF
    print("\n4. Extracting top words for each topic...")
    topic_words = extract_topic_words_c_tfidf(processed_docs, topics, n_top_words=10)

    # 6. Sentiment analysis per question, aggregated per topic
    topic_sentiment = analyze_topic_sentiment(docs, list(topics))

    total_time = time.time() - start_time
    print(f"\n✓ Total time: {total_time:.2f}s")
    
    return topics, topic_words, embeddings, cluster_model, topic_sentiment

# Global cache for the embedding model to avoid reloading on every call or hot-reload
_MODEL_CACHE: dict[str, Any] = {}

class RemoteEmbeddingModel:
    """Mock-like class that calls an external embedding service (e.g. HF TEI)."""
    
    def __init__(self, model_name: str, service_url: str, hf_token: str | None = None):
        self.model_name = model_name
        self.service_url = service_url.rstrip("/")
        self.hf_token = hf_token
        self.is_hf_api = "huggingface.co" in self.service_url or hf_token is not None
        
    async def encode(
        self, 
        sentences: list[str], 
        batch_size: int = 32, 
        show_progress_bar: bool = False, 
        convert_to_numpy: bool = True, 
        normalize_embeddings: bool = True,
        **kwargs
    ) -> np.ndarray:
        headers = {}
        if self.hf_token:
            headers["Authorization"] = f"Bearer {self.hf_token}"
        
        # Determine endpoint
        url = f"{self.service_url}/embed"
        if self.is_hf_api and "/embed" not in self.service_url:
            url = self.service_url

        all_embeddings = []
        
        # Split into batches to avoid "413 Payload Too Large"
        total_batches = (len(sentences) + batch_size - 1) // batch_size
        
        print(f"   Calling remote embedding service in {total_batches} batches (size {batch_size}): {url}")
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                for i in range(0, len(sentences), batch_size):
                    batch = sentences[i : i + batch_size]
                    payload = {"inputs": batch}
                    
                    # HF API sometimes needs this to ensure the model is loaded
                    if self.is_hf_api:
                        payload["options"] = {"wait_for_model": True}
                    
                    # Retry logic for 429 and 5xx
                    max_retries = 3
                    retry_delay = 2.0
                    for attempt in range(max_retries):
                        response = await client.post(
                            url,
                            json=payload,
                            headers=headers,
                        )
                        
                        if response.status_code == 429:
                            wait_time = float(response.headers.get("Retry-After", retry_delay * (attempt + 1)))
                            print(f"   Rate limited (429). Retrying in {wait_time}s... (Attempt {attempt + 1}/{max_retries})")
                            await asyncio.sleep(wait_time)
                            continue
                        
                        if response.status_code >= 500:
                            print(f"   Server error ({response.status_code}). Retrying in {retry_delay}s...")
                            await asyncio.sleep(retry_delay)
                            continue
                            
                        response.raise_for_status()
                        break
                    else:
                        # If loop finishes without break, it means all retries failed
                        response.raise_for_status()

                    batch_embeddings = response.json()
                
                    # HF feature-extraction returns [embedding1, embedding2, ...]
                    # Some other APIs might return {"embeddings": [...]}
                    if isinstance(batch_embeddings, dict) and "embeddings" in batch_embeddings:
                        batch_embeddings = batch_embeddings["embeddings"]
                    
                    all_embeddings.extend(batch_embeddings)
                    
                    # Small delay between batches to avoid immediate 429 if service is strict
                    if total_batches > 1:
                        await asyncio.sleep(0.5)
            
            arr = np.array(all_embeddings, dtype=np.float32)
            
            if normalize_embeddings:
                norm = np.linalg.norm(arr, axis=1, keepdims=True)
                arr = arr / (norm + 1e-9)
                
            return arr
        except Exception as e:
            print(f"   Error calling remote embedding service: {e}")
            raise

def get_embedding_model(model_name: str) -> Any:
    """Get the embedding model from cache or load it if not present."""
    global _MODEL_CACHE
    settings = get_settings()
    
    # Check if we should use a remote service
    service_url = settings.embedding_service_url
    hf_token = settings.hf_token
    
    # If HF token is provided but no service URL, default to HF Inference API
    if hf_token and not service_url:
        service_url = f"https://api-inference.huggingface.co/pipeline/feature-extraction/{model_name}"
    
    cache_key = f"remote:{service_url}" if service_url else f"local:{model_name}"
    
    if cache_key not in _MODEL_CACHE:
        if service_url:
            print(f"   Using Remote Embedding Service: {service_url}")
            _MODEL_CACHE[cache_key] = RemoteEmbeddingModel(model_name, service_url, hf_token=hf_token)
        else:
            from sentence_transformers import SentenceTransformer
            print(f"   Loading local SentenceTransformer model: {model_name}...")
            _MODEL_CACHE[cache_key] = SentenceTransformer(model_name)
            
    return _MODEL_CACHE[cache_key]


class FastTopicEngine:
    """Adapter to run the existing fast topic modeling algorithm inside dashboard pipeline."""

    def __init__(
        self,
        n_clusters: int | None = None,
        embedding_model_name: str | None = None,
        cluster_algorithm: str = "kmeans",
        tokenizer_backend: str | TokenizerBackend = TokenizerBackend.UNDERTHESEA,
    ) -> None:
        self.n_clusters = n_clusters
        self.embedding_model_name = embedding_model_name
        self.cluster_algorithm = cluster_algorithm
        self.tokenizer_backend = tokenizer_backend

    async def fit_predict(
        self,
        docs: list[str],
    ) -> tuple[list[int], dict[int, list[tuple[str, float]]], dict[int, dict[str, float]]]:
        topics, topic_words, _embeddings, _cluster_model, topic_sentiment = await fast_topic_modeling(
            docs,
            n_clusters=self.n_clusters,
            embedding_model_name=self.embedding_model_name,
            cluster_algorithm=self.cluster_algorithm,
            tokenizer_backend=self.tokenizer_backend,
        )
        return [int(topic) for topic in topics], topic_words, topic_sentiment

    async def generate_labels(
        self,
        docs: list[str],
        topics: list[int],
        topic_words: dict[int, list[tuple[str, float]]],
    ) -> dict[int, str]:
        settings = get_settings()
        if not settings.topic_labeling_enabled:
            return {}
        return await generate_topic_labels_with_openrouter(docs, topics, topic_words)

def main():
    sample_docs_raw = load_sample_docs()

    print("=" * 70)
    print("FAST VIETNAMESE TOPIC MODELING")
    print("Method: KMeans/MiniBatchKMeans + Sentence Embeddings")
    print("=" * 70)
    print("\n" + "=" * 70)
    print("EXPERIMENT: FAST TOPIC MODELING FOR VIETNAMESE Q&A")
    print("=" * 70)
    
    # Configuration
    settings = get_settings()
    TOKENIZER_BACKEND = parse_tokenizer_backend(
        settings.tokenizer_backend, 
        default=TokenizerBackend.SPACY
    ).value
    EMBEDDING_MODEL_NAME = settings.embedding_model or "paraphrase-multilingual-MiniLM-L12-v2"
    CLUSTER_ALGORITHM = parse_cluster_algorithm(
        settings.cluster_algorithm,
        default=ClusteringAlgorithm.KMEANS
    ).value
    N_CLUSTERS = settings.n_clusters if settings.n_clusters and settings.n_clusters >= 2 else None
    print_topic_labeling_configuration(
        total_docs=len(sample_docs_raw),
        n_clusters=N_CLUSTERS,
        tokenizer_backend=TOKENIZER_BACKEND,
    )
    print(f"  - Embedding model: {EMBEDDING_MODEL_NAME}")
    print(f"  - Cluster algorithm: {CLUSTER_ALGORITHM}")
    
    # Run topic modeling
    topics, topic_words, embeddings, kmeans_model = fast_topic_modeling(
        sample_docs_raw,
        n_clusters=N_CLUSTERS,
        embedding_model_name=EMBEDDING_MODEL_NAME,
        cluster_algorithm=CLUSTER_ALGORITHM,
        tokenizer_backend=TOKENIZER_BACKEND,
    )

    # Use pipeline facade for centralized filtering and result handling
    pipeline = TopicModelingPipeline(sample_docs_raw, topics, topic_words)

    topic_labels = {}
    if settings.topic_labeling_enabled:
        topic_labels = pipeline.generate_labels()
    
    # Display results
    pipeline.display_results(
        topic_labels=topic_labels,
        title="TOPIC MODELING RESULTS",
        line_width=70,
    )
    
    # Save results
    pipeline.save_results(
        topic_labels=topic_labels,
        output_dir="./fast_topic_output",
        summary_title="FAST TOPIC MODELING SUMMARY",
    )
    
    # Compare with BERTopic
    print("\n" + "=" * 70)
    print("COMPARISON WITH BERTopic")
    print("=" * 70)
    print("\nExpected speed improvement:")
    print("  - BERTopic: ~2-5 minutes (with UMAP + HDBSCAN)")
    print("  - This method: ~10-30 seconds (MiniBatch KMeans)")
    print("\nExpected quality:")
    print("  - BERTopic: Better semantic grouping, more coherent topics")
    print("  - This method: Good for clear topic separation, faster")
    
    print("\n" + "=" * 70)
    print("NEXT STEPS")
    print("=" * 70)
    print("1. Test with your actual dataset")
    print("2. Adjust n_clusters based on your data size")
    print("3. Try different embedding models:")
    print("   - 'all-MiniLM-L6-v2' (fastest, 80MB)")
    print("   - 'paraphrase-multilingual-MiniLM-L12-v2' (better Vietnamese, 400MB)")
    print("4. Integrate with your chatbot for real-time topic analysis")
    print("=" * 70)

if __name__ == "__main__":
    main()
