# src/services/ingestion.py
import asyncio
import logging
from typing import List, Dict, Any, BinaryIO
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import AzureOpenAIEmbeddings
from langchain_experimental.text_splitter import SemanticChunker
from fastembed import SparseTextEmbedding
from llama_cloud import LlamaCloud
import fitz 
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

    def extract_text(self, file_stream: BinaryIO, doc_type: Any, filename: str = "") -> str:
        """
        Refactored: Nhận vào file_stream (BytesIO hoặc File Object) thay vì path.
        filename chỉ dùng để log hoặc detect type phụ trợ, không dùng để open.
        """
        try:
            # 1. Reset con trỏ file về đầu (Defensive programming)
            # Để đảm bảo nếu stream đã bị đọc trước đó thì vẫn đọc lại được từ đầu
            if file_stream.seekable():
                file_stream.seek(0)
            
            dtype_str = str(doc_type).upper()

            if "PDF" in dtype_str:
                return self._extract_pdf(file_stream)
            
            elif "TXT" in dtype_str or "MD" in dtype_str or "MARKDOWN" in dtype_str:
                return self._extract_plain_text(file_stream)
            
            else:
                logger.warning(f"Unknown doc_type {doc_type} for {filename}, trying plain text.")
                return self._extract_plain_text(file_stream)

        except Exception as e:
            logger.error(f"Failed to extract text from {filename}: {e}")
            raise e

    # def _extract_pdf(self, stream: BinaryIO) -> str:
    #     """
    #     Đọc PDF từ stream.
    #     Lưu ý: Không dùng 'with open...' nữa vì stream đã mở sẵn.
    #     """
    #     text_content = []
    #     try:
    #         # PdfReader hỗ trợ đọc trực tiếp từ stream/bytes
    #         reader = PdfReader(stream)
            
    #         if reader.is_encrypted:
    #             try: reader.decrypt("")
    #             except: pass

    #         for page in reader.pages:
    #             page_text = page.extract_text()
    #             if page_text:
    #                 clean_text = page_text.replace('\x00', '')
    #                 text_content.append(clean_text)
            
    #         return "\n".join(text_content)
    #     except Exception as e:
    #         raise RuntimeError(f"Error parsing PDF stream: {e}")

    def _extract_pdf(self, stream: BinaryIO, text_threshold: int = 50) -> str:
        """
        Đọc PDF từ stream dùng PyMuPDF. 
        Tự động router: Text > PyMuPDF, Scan > Llama Parse.
        """
        try:
            # Đọc bytes từ stream (BytesIO hoặc file upload)
            pdf_bytes = stream.read()
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            
            final_text_blocks: Dict[int, str] = {}
            scanned_page_numbers: List[int] = []

            # BƯỚC 1: Phân loại từng trang
            for page_num in range(len(doc)):
                page = doc[page_num]
                text = page.get_text().strip()
                
                if len(text) >= text_threshold:
                    # Là trang Text -> Lưu luôn text của PyMuPDF
                    final_text_blocks[page_num] = text
                else:
                    # Là trang Scan hoặc ảnh -> Đưa vào danh sách chờ
                    scanned_page_numbers.append(page_num)

            # BƯỚC 2: Xử lý các trang scan bằng Llama Parse
            if scanned_page_numbers:
                logger.info(f"🔍 Phát hiện {len(scanned_page_numbers)} trang scan. Đang chuẩn bị gọi Llama Parse...")
                
                # Tạo một file PDF tạm trên RAM chỉ chứa các trang scan
                scanned_doc = fitz.open()
                for p_num in scanned_page_numbers:
                    scanned_doc.insert_pdf(doc, from_page=p_num, to_page=p_num)
                
                # [QUAN TRỌNG] Dùng tobytes() để xuất ra bytes trên RAM
                scanned_bytes = scanned_doc.tobytes()
                scanned_doc.close()

                # Gọi Llama Parse (truyền vào bytes)
                llama_results = self._call_llama_parse(scanned_bytes)
                
                # Ráp kết quả từ Llama Parse vào đúng vị trí trang tương ứng
                for i, p_num in enumerate(scanned_page_numbers):
                    # Fallback an toàn nếu Llama Parse trả về ít trang hơn dự kiến
                    parsed_text = llama_results[i] if i < len(llama_results) else ""
                    final_text_blocks[p_num] = parsed_text

            # BƯỚC 3: Gộp toàn bộ văn bản lại theo đúng thứ tự tài liệu gốc
            full_text = []
            for page_num in range(len(doc)):
                if page_num in final_text_blocks and final_text_blocks[page_num]:
                    # Xóa các ký tự null (\x00) thường gây lỗi cho Database/Embedding
                    clean_text = final_text_blocks[page_num].replace('\x00', '')
                    full_text.append(clean_text)

            doc.close()
            # Cách nhau 2 dòng để phân tách rõ ràng giữa các trang
            return "\n\n".join(full_text)

        except Exception as e:
            logger.error(f"❌ Error parsing PDF stream: {e}")
            raise RuntimeError(f"Error parsing PDF stream: {e}")
        
    def _call_llama_parse(self, pdf_bytes: bytes) -> List[str]:
        """
        Gửi bytes của file PDF chứa các trang scan lên Llama Parse và lấy về text theo từng trang.
        """
        logger.info("🚀 Đang gọi Llama Parse API (Tier: cost_effective)...")
        
        # Khởi tạo client đồng bộ. (Lưu ý: Bạn cần thêm LLAMA_CLOUD_API_KEY vào settings)
        client = LlamaCloud(api_key=settings.LLAMA_CLOUD_API_KEY) 
        
        try:
            # 1. Upload file từ bộ nhớ RAM (bytes) thay vì từ ổ cứng
            # Truyền tuple ("tên_file_giả_lập.pdf", nội_dung_bytes)
            file_obj = client.files.create(
                file=("scanned_pages.pdf", pdf_bytes), 
                purpose="parse"
            )

            # 2. Gọi hàm parse
            result = client.parsing.parse(
                file_id=file_obj.id,
                tier="cost_effective",
                version="latest",
                # RẤT QUAN TRỌNG: Chỉ dùng "markdown" để lấy dữ liệu cấp độ trang (page-level)
                expand=["markdown"], 
            )

            parsed_pages = []
            
            # 3. Trích xuất text theo từng trang từ kết quả trả về
            if hasattr(result, 'markdown') and result.markdown:
                # result.markdown là một object chứa list các trang ở thuộc tính 'pages'
                if hasattr(result.markdown, 'pages'):
                    for page_obj in result.markdown.pages:
                        # Mỗi page_obj là một MarkdownPageMarkdownResultPage
                        parsed_pages.append(page_obj.markdown)
                # Đề phòng trường hợp nó trả về dạng Dictionary
                elif isinstance(result.markdown, dict) and 'pages' in result.markdown:
                    for page_obj in result.markdown['pages']:
                        if hasattr(page_obj, 'markdown'):
                            parsed_pages.append(page_obj.markdown)
                        elif isinstance(page_obj, dict):
                            parsed_pages.append(page_obj.get('markdown', ''))
            else:
                logger.warning("⚠️ Llama Parse không trả về dữ liệu page-level.")
                if hasattr(result, 'markdown_full'):
                    parsed_pages = [result.markdown_full]

            logger.info(f"✅ Llama Parse xử lý xong {len(parsed_pages)} trang scan.")
            return parsed_pages

        except Exception as e:
            logger.error(f"❌ Lỗi khi gọi Llama Parse: {e}")
            # Trả về list rỗng để code chính không bị crash, mà sẽ hiểu là trang này parse thất bại
            return []

    def _extract_plain_text(self, stream: BinaryIO) -> str:
        """
        Đọc Text từ stream (Bytes -> String)
        """
        try:
            # stream.read() trả về bytes -> phải decode sang string
            content_bytes = stream.read()
            return content_bytes.decode("utf-8", errors="ignore")
        except Exception as e:
            raise RuntimeError(f"Error reading text stream: {e}")

    def _embed_sparse_sync(self, texts: List[str]) -> List[Dict[str, Any]]:
        """
        Nhúng vector thưa
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