"""
BERTopic Topic Modeling cho Tieng Viet (Dynamic & Advanced)
=======================================
Pipeline:
  1. Input: Danh sách câu hỏi (docs) từ Dashboard
  2. Word Segmentation bằng VnCoreNLP
  3. Load hoặc tính toán embedding dùng HaLong lưu cache (.npy)
  4. Khởi tạo UMAP & HDBSCAN với tham số động
  5. Feature extraction (CountVectorizer + c-TF-IDF + reduce_frequent_words)
  6. Representation Models (KeyBERTInspired, MMR)
  7. Huấn luyện BERTopic và Reduce Outliers
  8. Phân tích Sentiment
  9. Gọi LLM để Refine Label & Keywords
  10. Đánh giá (evaluate_model) và Xuất kết quả (save_results)
"""

import io
import os
import re
import csv
import sys
import json
import time
import asyncio
from pathlib import Path
from typing import Any

# Force UTF-8 output on Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

import numpy as np
import pandas as pd
import requests
from tqdm import tqdm
from sklearn.feature_extraction.text import CountVectorizer

from src.services.util import TokenizerBackend, get_settings

# ----------------- PATHS CONFIGURATION -----------------
CURRENT_DIR = Path(__file__).resolve().parent
DATA_DIR = CURRENT_DIR / "data"

VNCORENLP_DIR  = str(DATA_DIR / "VnCoreNLP")
STOPWORD_FILE  = DATA_DIR / "vietnamese-stopwords-dash.txt"
DOMAIN_STOPWORD_FILE = DATA_DIR / "domain-stopwords.txt"
OUTPUT_DIR     = CURRENT_DIR / "bertopic_output_vn"
EMBEDDING_CACHE = CURRENT_DIR / "halong_embeddings_cache.npy"

# ----------------- API CONFIGURATION -----------------
_local_settings = get_settings()
EMBEDDING_API_URL = os.getenv(
    "EMBEDDING_API_URL",
    _local_settings.embedding_service_url if getattr(_local_settings, "embedding_service_url", None) else "https://ragchatbot.tale-company.ts.net:8443"
)
EMBED_BATCH_SIZE  = int(os.getenv("EMBED_BATCH_SIZE", "32"))
NUM_TOP_WORDS     = int(os.getenv("NUM_TOP_WORDS", "15"))

# ----------------- CONSTANTS -----------------
# DOMAIN_STOPWORDS is now loaded from DOMAIN_STOPWORD_FILE in load_stopwords()

# ----------------- HELPER FUNCTIONS -----------------
def clean_text_regex(text: str) -> str:
    text = text.lower()
    text = re.sub(r'\b(tp\.?hcm|tp\.? hồ chí minh|tphcm|hcm|tp)\b', '', text)
    text = re.sub(r'\b(đại học bách khoa|bách khoa|đh bách khoa|đhbk|bk)\b', '', text)
    text = re.sub(r'\b(đại học|trường|sv|sinh viên|gv|giảng viên|thầy cô)\b', '', text)
    text = re.sub(r'[^\w\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def load_stopwords(path: Path) -> list[str]:
    stopwords: set[str] = set()
    
    # 1. Load main stopwords
    try:
        if path.exists():
            with open(path, encoding="utf-8") as f:
                for line in f:
                    word = line.strip()
                    if word:
                        stopwords.add(word.lower())
        else:
            print(f"[WARN] Khong tim thay file stopwords tai {path}.")
    except Exception as e:
        print(f"[ERROR] Loi khi tai {path}: {e}")

    # 2. Load domain stopwords
    domain_count = 0
    try:
        if DOMAIN_STOPWORD_FILE.exists():
            with open(DOMAIN_STOPWORD_FILE, encoding="utf-8") as f:
                for line in f:
                    word = line.strip()
                    if word:
                        stopwords.add(word.lower())
                        domain_count += 1
        else:
            print(f"[WARN] Khong tim thay file domain stopwords tai {DOMAIN_STOPWORD_FILE}.")
    except Exception as e:
        print(f"[ERROR] Loi khi tai {DOMAIN_STOPWORD_FILE}: {e}")

    print(f"[OK] Tai {len(stopwords)} stopwords (Bao gom {domain_count} domain stopwords)")
    return list(stopwords)

class VnCoreNLPSegmenter:
    """Wrapper mỏng cho py_vncorenlp - chỉ dùng annotator wseg."""
    def __init__(self, save_dir: str = VNCORENLP_DIR):
        import py_vncorenlp  # noqa: PLC0415
        print(f"[..] Dang tai VnCoreNLP tu {save_dir} ...")
        self._model = py_vncorenlp.VnCoreNLP(
            annotators=["wseg"],
            save_dir=save_dir,
        )
        print("[OK] VnCoreNLP san sang (word segmentation only)")

    def segment(self, text: str) -> str:
        sentences: list[str] = self._model.word_segment(text)
        return " ".join(sentences)

def remove_stopwords(segmented_text: str, stopwords: set[str]) -> str:
    tokens = segmented_text.split()
    filtered = [t for t in tokens if t.lower() not in stopwords]
    return " ".join(filtered)

class HaLongEmbedder:
    def __init__(self, base_url: str = EMBEDDING_API_URL, batch_size: int = EMBED_BATCH_SIZE):
        self.url = base_url.rstrip("/") + "/embed"
        self.batch_size = batch_size

    def encode(self, docs: list[str]) -> np.ndarray:
        all_embeddings: list[list[float]] = []
        n = len(docs)
        for start in tqdm(range(0, n, self.batch_size), desc="Embedding"):
            batch = docs[start : start + self.batch_size]
            # TEI API rejects empty strings, so we replace them with "."
            safe_batch = [str(t).strip() if str(t).strip() else "." for t in batch]
            payload = {"inputs": safe_batch, "normalize": True}
            for attempt in range(4):
                try:
                    resp = requests.post(self.url, json=payload, timeout=60, verify=False)
                    resp.raise_for_status()
                    embeddings = resp.json()
                    all_embeddings.extend(embeddings)
                    break
                except Exception as exc:
                    wait = 2 ** attempt
                    print(f"  Retry {attempt+1}/4 sau {wait}s ({exc})")
                    time.sleep(wait)
            else:
                raise RuntimeError(f"Không thể nhận embedding cho batch [{start}:{start+self.batch_size}]")
        return np.array(all_embeddings, dtype=np.float32)

class CustomHaLongEmbedder:
    """Wrapper giúp BERTopic hiểu và sử dụng HaLongEmbedder cho KeyBERT."""
    def __init__(self, embedder: HaLongEmbedder):
        self.embedder = embedder

    def embed(self, documents: list[str], verbose: bool = False) -> np.ndarray:
        return self.embedder.encode(documents)

def analyze_topic_sentiment(docs: list[str], topics: list[int]) -> dict[int, dict[str, float]]:
    """Phân tích Sentiment (Tích cực/Tiêu cực/Trung tính) cho mỗi Topic."""
    try:
        from underthesea import sentiment as underthesea_sentiment
    except ImportError:
        print("  Warning: underthesea not installed; skipping sentiment analysis.")
        return {}

    print("\nDang phan tich Sentiment (Sentiment Analysis)...")
    sentiments: list[str] = []
    for doc in docs:
        try:
            result = underthesea_sentiment(doc)
            label = str(result).lower() if isinstance(result, str) else str(result[0]).lower()
            sentiments.append(label)
        except Exception:
            sentiments.append("neutral")

    topic_ids = sorted(set(topics))
    topic_sentiment: dict[int, dict[str, float]] = {}
    for topic_id in topic_ids:
        indices = [i for i, t in enumerate(topics) if t == topic_id]
        if not indices:
            topic_sentiment[topic_id] = {"positive": 0.0, "neutral": 100.0}
            continue
        positive = sum(1 for i in indices if sentiments[i] == "positive")
        neutral = len(indices) - positive
        total = len(indices)
        topic_sentiment[topic_id] = {
            "positive": round(positive / total * 100, 1),
            "neutral": round(neutral / total * 100, 1),
        }

    print(f"   Sentiment done for {len(topic_ids)} topics")
    return topic_sentiment

async def refine_topics_with_llm(docs: list[str], topics: list[int], topic_words: dict[int, list[tuple[str, float]]]) -> tuple[dict[int, str], dict[int, list[tuple[str, float]]]]:
    try:
        import httpx
        settings = get_settings()

        api_key = settings.labeling_api_key
        if not api_key:
            print("[WARN] Khong co LLM API Key, bo qua buoc refine.")
            return {t: f"Topic {t}" for t in set(topics) if t != -1}, topic_words

        topic_context = []
        for t in set(topics):
            if t == -1: continue
            t_docs = [docs[i] for i, top in enumerate(topics) if top == t][:25]
            t_words = [w for w, _ in topic_words[t][:]]
            topic_context.append({"topic_id": int(t), "raw_keywords": t_words, "sample_questions": t_docs})
            
        prompt = (
            "Bạn là chuyên gia phân tích dữ liệu giáo dục và hỗ trợ sinh viên ĐH Bách Khoa HCM.\n"
            "Nhiệm vụ: Với mỗi topic, hãy thực hiện 2 việc sau:\n"
            "1. Gán 1 nhãn (label) chi tiết, mang tính mô tả cụ thể (dài khoảng 7-15 từ, ví dụ: 'Quy định và thủ tục đăng ký luận văn').\n"
            "2. Trích xuất CHÍNH XÁC tất cả các từ khóa (keywords). Tuyệt đối không được bỏ sót phần keywords (không bao giờ được trả về mảng rỗng).\n"
            "Các từ khóa phải trích xuất từ dữ liệu thực tế, rõ nghĩa, loại bỏ từ lặp lại hoặc vô nghĩa.\n\n"
            "Chỉ trả về JSON theo đúng định dạng sau, không giải thích gì thêm:\n"
            "{\n"
            '  "topics": [\n'
            '    {"topic_id": 0, "label": "Nhãn chi tiết mô tả rõ chủ đề", "keywords": ["từ khóa 1", "từ khóa 2", "từ khóa 3", "từ khóa 4", "từ khóa 5"]}\n'
            "  ]\n"
            "}\n\n"
            f"Dữ liệu:\n{json.dumps(topic_context, ensure_ascii=False, indent=2)}"
        )

        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {"model": settings.topic_labeling_model, "temperature": 0.1, "messages": [{"role": "user", "content": prompt}]}
        
        print(f"\nDang goi LLM ({settings.topic_labeling_model}) de refine Label & Keywords ...")
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(settings.topic_labeling_api_url, json=payload, headers=headers)
            resp.raise_for_status()
            
            content = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
            
            match = re.search(r"\{[\s\S]*\}", content)
            if match:
                content = match.group(0)
                
            data = json.loads(content)
            
            refined_labels = {}
            refined_keywords = {-1: topic_words.get(-1, [])}
            for item in data.get("topics", []):
                t_id = item["topic_id"]
                refined_labels[t_id] = item["label"]
                
                # Ánh xạ lại trọng số gốc từ c-TF-IDF nếu có thể
                orig_words_dict = {w.replace("_", " ").lower(): s for w, s in topic_words.get(t_id, [])}
                kw_list = []
                for idx, k in enumerate(item.get("keywords", [])):
                    k_lower = k.replace("_", " ").lower()
                    if k_lower in orig_words_dict:
                        score = orig_words_dict[k_lower]
                    else:
                        # Nếu LLM đẻ ra từ mới không có trong danh sách gốc, cho điểm giảm dần theo thứ hạng
                        score = max(0.01, round(0.5 - (0.05 * idx), 4))
                    kw_list.append((k, score))
                refined_keywords[t_id] = kw_list
            
            # Fallback
            for t in set(topics):
                if t != -1 and t not in refined_labels:
                    refined_labels[t] = f"Topic {t}"
                    refined_keywords[t] = topic_words[t]
                    
            return refined_labels, refined_keywords

    except Exception as e:
        print(f"[WARN] Khong the goi LLM de dat label va refine keywords: {e}")
        return {t: f"Topic {t}" for t in set(topics) if t != -1}, topic_words

def save_results(
    docs: list[str],
    topics: list[int],
    probabilities: list[float],
    top_words_per_topic: dict[int, list[tuple[str, float]]],
    topic_labels: dict[int, str],
    output_dir: Path,
):
    output_dir.mkdir(parents=True, exist_ok=True)

    # --- topic_assignments.csv ---
    rows = [(i, t, probabilities[i]) for i, t in enumerate(topics)]
    rows.sort(key=lambda x: (x[1], x[0]))

    with open(output_dir / "topic_assignments.csv", "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["Document", "Topic", "Label", "Probability", "Question"])
        for doc_idx, topic_id, prob in rows:
            label = topic_labels.get(topic_id, "Outlier" if topic_id == -1 else f"Topic {topic_id}")
            writer.writerow([doc_idx, topic_id, label, f"{prob:.4f}", docs[doc_idx]])

    # --- topic_words.txt ---
    with open(output_dir / "topic_words.txt", "w", encoding="utf-8") as f:
        for topic_id in sorted(top_words_per_topic):
            f.write(f"\nTopic {topic_id} ({topic_labels.get(topic_id, 'Outlier')}):\n")
            words_str = ", ".join(f"{w}({s:.4f})" for w, s in top_words_per_topic[topic_id])
            f.write(f"  {words_str}\n")

    # --- summary.txt ---
    topic_counts: dict[int, int] = {}
    for t in topics:
        topic_counts[t] = topic_counts.get(t, 0) + 1

    with open(output_dir / "summary.txt", "w", encoding="utf-8") as f:
        f.write("BERTopic Vietnamese - SUMMARY\n")
        f.write("=" * 50 + "\n\n")
        f.write(f"Total topics (excluding outlier): {len(topic_counts) - (1 if -1 in topic_counts else 0)}\n")
        f.write(f"Total documents: {len(docs)}\n")
        f.write(f"Outliers: {topic_counts.get(-1, 0)}\n\n")
        for topic_id in sorted(topic_counts):
            if topic_id == -1:
                continue
            top_w = ", ".join(w for w, _ in top_words_per_topic[topic_id][:5])
            label = topic_labels.get(topic_id, f"Topic {topic_id}")
            f.write(f"Topic {topic_id}: {topic_counts[topic_id]} docs | {label} | {top_w}\n")

    print(f"\n[OK] Ket qua da luu vao: {output_dir}/")

def evaluate_model(
    processed_docs: list[str],
    topics: list[int],
    top_words_per_topic: dict[int, list[tuple[str, float]]],
    output_dir: Path,
    embeddings: np.ndarray = None,
    topic_model = None
):
    """Tính toán các chỉ số đánh giá mô hình bao gồm độ mạch lạc và mức độ tách biệt."""
    output_dir.mkdir(parents=True, exist_ok=True)
    print("\nDang tinh toan cac chi so danh gia (Metrics) ...")
    from sklearn.metrics import silhouette_score
    from sklearn.metrics.pairwise import cosine_similarity
    from gensim.models.coherencemodel import CoherenceModel
    from gensim.corpora.dictionary import Dictionary
    # 1. Tiền xử lý dữ liệu cho Gensim (Coherence)
    
    texts = [doc.split() for doc in processed_docs if doc.strip()]
    dictionary = Dictionary(texts)
    
    topic_words_list = []
    all_keywords = []
    for t in sorted(top_words_per_topic.keys()):
        if t == -1: continue
        words = [w for w, _ in top_words_per_topic[t]]
        topic_words_list.append(words)
        all_keywords.extend(words)
    
    metrics = {}
    
    # 2. Topic Diversity
    if all_keywords:
        metrics["topic_diversity"] = round(len(set(all_keywords)) / len(all_keywords), 4)
    
    # 3. Topic Coherence (C_v)
    if topic_words_list and texts:
        try:
            cm = CoherenceModel(topics=topic_words_list, texts=texts, dictionary=dictionary, coherence='c_v', processes=1)
            metrics["coherence_score_cv"] = round(cm.get_coherence(), 4)
        except Exception as e:
            print(f"  [WARN] Khong the tinh Coherence: {e}")
            metrics["coherence_score_cv"] = 0.0

    # 4. Mức độ tách biệt giữa các chủ đề (Clustering Quality)
    if embeddings is not None and len(set(topics)) > 1:
        # Loại bỏ Outlier (-1) để tính Silhouette chính xác cho các cụm thực tế
        mask = np.array(topics) != -1
        if np.sum(mask) > len(set(topics)): # Cần ít nhất N_clusters + 1 điểm
            try:
                score = silhouette_score(embeddings[mask], np.array(topics)[mask])
                metrics["silhouette_score"] = round(float(score), 4)
            except:
                metrics["silhouette_score"] = 0.0

    # 5. Độ tương đồng giữa các Topic (Inter-topic Similarity)
    # Càng thấp càng tốt (các topic càng khác biệt nhau)
    if topic_model is not None:
        try:
            topic_embeddings = topic_model.topic_embeddings_
            # Bỏ topic -1 nếu có (thường nằm ở index 0 nếu có)
            if -1 in topic_model.topic_labels_:
                topic_embeddings = topic_embeddings[1:]
            
            if len(topic_embeddings) > 1:
                sim_matrix = cosine_similarity(topic_embeddings)
                # Tính trung bình các ô phía trên đường chéo chính
                upper_tri_indices = np.triu_indices(sim_matrix.shape[0], k=1)
                avg_sim = np.mean(sim_matrix[upper_tri_indices])
                metrics["avg_inter_topic_similarity"] = round(float(avg_sim), 4)
        except:
            metrics["avg_inter_topic_similarity"] = 0.0

    # 6. Outlier Rate
    metrics["outlier_rate"] = round(topics.count(-1) / len(topics), 4)
    metrics["total_docs"] = len(topics)
    metrics["num_topics"] = len(topic_words_list)

    with open(output_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=4)
        
    print(f"[OK] Separation: Silhouette={metrics.get('silhouette_score')}, Inter-Topic Sim={metrics.get('avg_inter_topic_similarity')}")
    print(f"[OK] Quality: Diversity={metrics.get('topic_diversity')}, Coherence={metrics.get('coherence_score_cv')}")
    
    return metrics


# ----------------- PIPELINE ADAPTER -----------------

class FastTopicEngine:
    """
    Adapter để tích hợp mô hình BERTopic Tiếng Việt vào luồng Dashboard.
    Giữ nguyên thuật toán, thêm logic Sentiment Analysis, và tương thích Interface.
    """

    def __init__(
        self,
        n_clusters: int | None = None,
        embedding_model_name: str | None = None,
        cluster_algorithm: str = "kmeans",
        tokenizer_backend: str | TokenizerBackend = TokenizerBackend.UNDERTHESEA,
    ) -> None:
        # Override cấu hình Dashboard thành BERTopic để dùng config tốt nhất
        self.n_clusters = n_clusters
        self.embedding_model_name = "halong-bertopic"
        self.cluster_algorithm = "bertopic"
        self.tokenizer_backend = "vncorenlp"
        
        print("\n" + "=" * 60)
        print(" [INIT] BERTopic Engine (Overriding Dashboard Settings)")
        print(f"   - Algorithm: {self.cluster_algorithm}")
        print(f"   - Tokenizer: {self.tokenizer_backend}")
        print("=" * 60)
        
        # State lưu lại giữa fit_predict và generate_labels
        self._processed_docs: list[str] = []
        self._embeddings: np.ndarray = None
        self._doc_probs: list[float] = []
        self._topic_model = None

    async def fit_predict(
        self,
        docs: list[str],
    ) -> tuple[list[int], dict[int, list[tuple[str, float]]], dict[int, dict[str, float]]]:
        import warnings
        warnings.filterwarnings("ignore")

        # 1. Preprocess
        print("\nDang segment bang VnCoreNLP ...")
        segmenter = VnCoreNLPSegmenter(save_dir=VNCORENLP_DIR)
        stopwords_set = set(load_stopwords(STOPWORD_FILE))
        
        processed_docs = []
        for doc in tqdm(docs, desc="Preprocessing"):
            cleaned = clean_text_regex(doc)
            if cleaned:
                seg = segmenter.segment(cleaned)
                filtered = remove_stopwords(seg, stopwords_set)
                processed_docs.append(filtered)
            else:
                processed_docs.append("")
                
        self._processed_docs = processed_docs
        
        # 2. Embeddings
        embedder = HaLongEmbedder(base_url=EMBEDDING_API_URL, batch_size=EMBED_BATCH_SIZE)
        if EMBEDDING_CACHE.exists():
            print(f"\nTai embeddings tu cache {EMBEDDING_CACHE.name} ...")
            embeddings = np.load(EMBEDDING_CACHE)
            if len(embeddings) != len(docs):
                print("  -> Cache khong khop so luong, tinh toan lai...")
                embeddings = embedder.encode(docs)
                np.save(EMBEDDING_CACHE, embeddings)
        else:
            print("\nTinh toan document embeddings ...")
            embeddings = embedder.encode(docs)
            np.save(EMBEDDING_CACHE, embeddings)
            
        print(f"  -> Shape: {embeddings.shape}")
        self._embeddings = embeddings

        # 3. Dynamic Hyperparameters
        N = len(docs)
        if N < 500:
            n_neighbors = 5
            min_cluster_size = 3
            min_samples = 2
        else:
            n_neighbors = 15
            min_cluster_size = 10
            min_samples = 5

        print(f"\nCau hinh dong: N={N} -> UMAP(n_neighbors={n_neighbors}), HDBSCAN(min_cluster_size={min_cluster_size})")

        # Khởi tạo mô hình (Lazy load to speed up dashboard startup)
        from umap import UMAP
        from hdbscan import HDBSCAN
        from bertopic import BERTopic
        from bertopic.representation import KeyBERTInspired, MaximalMarginalRelevance
        from bertopic.vectorizers import ClassTfidfTransformer

        umap_model = UMAP(n_neighbors=n_neighbors, n_components=5, min_dist=0.0, metric='cosine', random_state=42)
        hdbscan_model = HDBSCAN(min_cluster_size=min_cluster_size, min_samples=min_samples, metric='euclidean', cluster_selection_method='eom', prediction_data=True)
        
        stopwords = load_stopwords(STOPWORD_FILE)
        vectorizer_model = CountVectorizer(stop_words=stopwords, ngram_range=(1, 1), token_pattern=r"(?u)\b\w+\b")
        ctfidf_model = ClassTfidfTransformer(reduce_frequent_words=True)
        
        representation_model = {
            "KeyBERT": KeyBERTInspired(),
            "MMR": MaximalMarginalRelevance(diversity=0.3)
        }

        from bertopic.backend import BaseEmbedder

        class LocalCustomHaLongEmbedder(BaseEmbedder):
            def __init__(self, embedder):
                super().__init__()
                self.embedder = embedder
            def embed(self, documents, verbose=False):
                return self.embedder.encode(documents)

        topic_model = BERTopic(
            embedding_model=LocalCustomHaLongEmbedder(embedder),
            umap_model=umap_model,
            hdbscan_model=hdbscan_model,
            vectorizer_model=vectorizer_model,
            ctfidf_model=ctfidf_model,
            representation_model=representation_model,
            language="multilingual",
            calculate_probabilities=True,
            verbose=True
        )

        # 4. Huấn luyện BERTopic
        print("\nBat dau huan luyen BERTopic ...")
        topics, probs = topic_model.fit_transform(processed_docs, embeddings)

        # 5. Reduce Outliers
        print("\nGiam thieu nhieu (Outlier Reduction) ...")
        try:
            new_topics = topic_model.reduce_outliers(processed_docs, topics, strategy="embeddings", embeddings=embeddings)
            topic_model.update_topics(processed_docs, topics=new_topics, vectorizer_model=vectorizer_model, ctfidf_model=ctfidf_model, representation_model=representation_model)
            topics = new_topics
        except Exception as e:
            print(f"  -> Bo qua giam nhieu do loi: {e}")
            
        if probs is not None and isinstance(probs, np.ndarray) and probs.ndim > 1:
            self._doc_probs = np.max(probs, axis=1).tolist()
        else:
            self._doc_probs = [0.0] * len(docs)
            
        self._topic_model = topic_model

        # 6. Trích xuất từ khóa
        top_words_per_topic = {}
        for t in set(topics):
            if t == -1:
                continue
            top_words_per_topic[t] = topic_model.get_topic(t)[:NUM_TOP_WORDS]

        # 7. Sentiment Analysis (Thêm lại logic từ Dashboard cũ)
        topic_sentiment = analyze_topic_sentiment(docs, topics)
        
        return [int(topic) for topic in topics], top_words_per_topic, topic_sentiment

    async def generate_labels(
        self,
        docs: list[str],
        topics: list[int],
        topic_words: dict[int, list[tuple[str, float]]],
    ) -> dict[int, str]:
        
        # 1. Gọi LLM Refine Labels
        topic_labels, top_words_per_topic_refined = await refine_topics_with_llm(docs, topics, topic_words)
        
        # 2. Evaluate model (Lưu cho debug)
        evaluate_model(
            processed_docs=self._processed_docs,
            topics=topics,
            top_words_per_topic=top_words_per_topic_refined,
            output_dir=OUTPUT_DIR,
            embeddings=self._embeddings,
            topic_model=self._topic_model
        )
        
        # 3. In kết quả nhanh
        topic_counts = {t: topics.count(t) for t in set(topics)}
        print("\n" + "=" * 60)
        print(f"Ket qua: {len(topic_counts) - (1 if -1 in topic_counts else 0)} topics, {len(docs)} documents")
        print("=" * 60)
        for topic_id in sorted(topic_counts):
            if topic_id == -1:
                print(f"  Outliers (-1): {topic_counts[-1]} docs")
                continue
            top5 = ", ".join(w for w, _ in top_words_per_topic_refined[topic_id][:5])
            label = topic_labels.get(topic_id, f"Topic {topic_id}")
            print(f"  Topic {topic_id:2d} ({topic_counts[topic_id]:3d} docs) | Label: {label}")
            print(f"    Keywords: {top5}")

        # 4. Ghi file kết quả (Giữ nguyên việc lưu file để check debug)
        save_results(
            docs=docs,
            topics=topics,
            probabilities=self._doc_probs,
            top_words_per_topic=top_words_per_topic_refined,
            topic_labels=topic_labels,
            output_dir=OUTPUT_DIR
        )
        
        return topic_labels
