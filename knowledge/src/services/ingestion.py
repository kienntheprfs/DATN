# src/services/ingestion.py
import asyncio
import logging
from typing import List, Dict, Any
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import AzureOpenAIEmbeddings
from langchain_experimental.text_splitter import SemanticChunker
from fastembed import SparseTextEmbedding
from pypdf import PdfReader
from pathlib import Path
from ..core.config import settings

logger = logging.getLogger(__name__)

class IngestionService:
    _instance = None
    _sparse_model = None  # Class-level variable để giữ Model trong RAM
    _dense_embedder = None
    _sparse_lock = asyncio.Lock()

    def __new__(cls):
        """Singleton Pattern chuẩn để đảm bảo chỉ init service 1 lần"""
        if cls._instance is None:
            cls._instance = super(IngestionService, cls).__new__(cls)
            cls._instance._initialize_models()
        return cls._instance

    def _initialize_models(self):
        """Khởi tạo models (Chạy 1 lần duy nhất khi start app)"""
        logger.info("🚀 Initializing IngestionService Models...")
        
        # 1. Sparse Model (Nặng, load vào RAM)
        if IngestionService._sparse_model is None:
            # threads=None để nó tự dùng tất cả core CPU khi tính toán
            IngestionService._sparse_model = SparseTextEmbedding(
                model_name="Qdrant/bm25", 
                threads=None 
            )
            logger.info("✅ Sparse Model loaded.")

        # 2. Dense Model (Nhẹ, chỉ là Client gọi API)
        if IngestionService._dense_embedder is None:
            IngestionService._dense_embedder = AzureOpenAIEmbeddings(
                deployment=settings.EMBEDDING_DEPLOYMENT_NAME,
                model=settings.EMBEDDING_MODEL,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
                api_key=settings.AZURE_OPENAI_API_KEY,
                api_version=settings.EMBEDDING_API_VERSION
            )

    def extract_text(self, file_path: str, doc_type: Any) -> str:
        """
        Hàm chính để rút trích văn bản.
        Lưu ý: Hàm này chạy Synchronous (đồng bộ).
        Caller (tasks.py) PHẢI bọc hàm này trong asyncio.to_thread để không block loop.
        """
        path = Path(file_path)
        
        if not path.exists():
            raise FileNotFoundError(f"File path does not exist: {file_path}")

        try:
            # Chuyển đổi doc_type sang string để so sánh cho dễ (phòng trường hợp Enum khác nhau)
            # Hoặc bạn so sánh trực tiếp: if doc_type == DocumentType.PDF:
            
            dtype_str = str(doc_type).upper() # Ví dụ: "DOCUMENTTYPE.PDF" hoặc "PDF"

            if "PDF" in dtype_str:
                return self._extract_pdf(path)
            
            elif "TXT" in dtype_str or "MD" in dtype_str or "MARKDOWN" in dtype_str:
                return self._extract_plain_text(path)
            
            else:
                # Fallback: Thử đọc như text thường nếu không nhận diện được
                logger.warning(f"Unknown doc_type {doc_type}, trying plain text extraction.")
                return self._extract_plain_text(path)

        except Exception as e:
            logger.error(f"Failed to extract text from {file_path}: {e}")
            raise e

    def _extract_pdf(self, path: Path) -> str:
        """Đọc file PDF dùng pypdf"""
        text_content = []
        try:
            with open(path, "rb") as f:
                reader = PdfReader(f)
                
                # Check nếu file bị encrypt
                if reader.is_encrypted:
                    # Nếu có password thì reader.decrypt('password')
                    # Ở đây giả sử file upload không có pass hoặc đã decrypt
                    try:
                        reader.decrypt("")
                    except:
                        pass

                for i, page in enumerate(reader.pages):
                    page_text = page.extract_text()
                    if page_text:
                        # Clean cơ bản: xóa null bytes có thể gây lỗi Postgres
                        clean_text = page_text.replace('\x00', '')
                        text_content.append(clean_text)
            
            return "\n".join(text_content)
        except Exception as e:
            raise RuntimeError(f"Error parsing PDF: {e}")

    def _extract_plain_text(self, path: Path) -> str:
        """Đọc file TXT hoặc MD"""
        try:
            # errors='ignore' để tránh crash nếu file có ký tự lạ không phải UTF-8
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()
        except Exception as e:
            raise RuntimeError(f"Error reading text file: {e}")

    def _embed_sparse_sync(self, texts: List[str]) -> List[Dict[str, Any]]:
        """
        Hàm đồng bộ (Blocking CPU). 
        Tuyệt đối không gọi trực tiếp trong async function mà không wrap.
        """
        # FastEmbed trả về generator, convert sang list ngay để tính toán xong
        embeddings = list(IngestionService._sparse_model.embed(texts))
        
        results = []
        for e in embeddings:
            results.append({
                "indices": e.indices.tolist(),
                "values": e.values.tolist()
            })
        return results
    
    async def _embed_sparse_safe(self, texts: List[str]):
        # Đảm bảo sparse model không bị gọi song song
        async with self._sparse_lock:
            return await asyncio.to_thread(self._embed_sparse_sync, texts)

    async def embed_hybrid_batch(self, texts: List[str]) -> List[Dict[str, Any]]:
        if not texts:
            return []

        dense_task = self._dense_embedder.aembed_documents(texts)
        sparse_task = self._embed_sparse_safe(texts)

        dense_vectors, sparse_vectors = await asyncio.gather(
            dense_task,
            sparse_task
        )

        return [
            {"dense": d, "sparse": s}
            for d, s in zip(dense_vectors, sparse_vectors)
        ]


    async def chunk_text_semantic(self, text: str) -> List[str]:
        """
        Semantic Chunking cũng có thể nặng vì phải tính embedding để cắt.
        """
        if not text.strip(): return []
        
        # Hàm create_documents của SemanticChunker có thể blocking
        # Nếu nó gọi API dense embedding thì ok, nhưng logic split là python thuần
        # Nên wrap vào thread cho an toàn nếu text rất dài.
        
        def _chunk_sync():
            splitter = SemanticChunker(
                embeddings=self._dense_embedder,
                buffer_size=1,
                breakpoint_threshold_type="percentile"
            )
            docs = splitter.create_documents([text])
            return [d.page_content for d in docs]

        return await asyncio.to_thread(_chunk_sync)
    
    def _chunk_text_recursive_sync(self, text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
        """
        Hàm xử lý đồng bộ (CPU bound).
        RecursiveCharacterTextSplitter xử lý chuỗi thuần túy, không gọi API.
        """
        if not text.strip(): return []

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            # Các ký tự ưu tiên cắt: xuống dòng đoạn -> xuống dòng câu -> dấu cách -> cắt thô
            separators=["\n\n", "\n", ". ", " ", ""],
            length_function=len 
        )
        docs = splitter.create_documents([text])
        return [d.page_content for d in docs]
    
    async def chunk_text_recursive(self, text: str) -> List[str]:
        """
        Wrapper Async.
        Dù Recursive nhanh, nhưng với text dài (vd 1MB text), nó vẫn có thể mất 100-200ms.
        Bọc vào to_thread giúp Main Thread không bị 'nấc' dù chỉ 1 tích tắc.
        """
        # Lấy config từ settings hoặc hardcode chuẩn chung
        chunk_size = getattr(settings, "CHUNK_SIZE", 1000)
        chunk_overlap = getattr(settings, "CHUNK_OVERLAP", 200)

        return await asyncio.to_thread(
            self._chunk_text_recursive_sync, 
            text, 
            chunk_size, 
            chunk_overlap
        )