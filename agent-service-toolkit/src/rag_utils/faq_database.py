import sqlite3
import os
import logging
from typing import List, Dict, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class FAQDatabase:
    _instance = None   # Giữ instance duy nhất

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            # Nếu chưa có instance thì tạo mới
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, db_path="data/faq.db"):
        # Đảm bảo init chỉ chạy 1 lần
        if hasattr(self, "_initialized") and self._initialized:
            return

        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)

        self.conn = sqlite3.connect(
            self.db_path,
            check_same_thread=False,
            isolation_level=None
        )
        self.conn.row_factory = sqlite3.Row

        self.init_db()
        self._initialized = True   # đánh dấu đã init

    def init_db(self):
        """Khởi tạo database và tạo các bảng cần thiết"""
        try:
            # Bảng FAQ chính
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS faqs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    url TEXT,
                    question TEXT NOT NULL,
                    answer TEXT NOT NULL,
                    status TEXT DEFAULT 'active',   -- active / inactive / deleted
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_index_at TIMESTAMP DEFAULT NULL,
                    last_index_doc TIMESTAMP DEFAULT NULL
                )
            """
            )

            # Bảng FAQ variants (cho Q-index)
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS faq_variants (
                    id INTEGER PRIMARY KEY,
                    faq_id INTEGER,
                    variant_text TEXT NOT NULL,
                    variant_type TEXT DEFAULT 'paraphrase',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (faq_id) REFERENCES faqs (id) ON DELETE CASCADE
                )
            """
            )

            # Bảng atomic answers
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS atomic_answers (
                    id INTEGER PRIMARY KEY,
                    faq_id INTEGER,
                    atomic_text TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (faq_id) REFERENCES faqs (id) ON DELETE CASCADE
                )
            """
            )

            # Bảng variants theo từng atomic answer (để map đúng variant -> atomic)
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS atomic_variants (
                    id INTEGER PRIMARY KEY,
                    atomic_id INTEGER,
                    variant_text TEXT NOT NULL,
                    variant_type TEXT DEFAULT 'paraphrase',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (atomic_id) REFERENCES atomic_answers (id) ON DELETE CASCADE
                )
            """
            )

            # Bảng meta data của docs
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT,                     -- tên hiển thị (vd: Báo cáo X)
                    file_path TEXT NOT NULL,        -- đường dẫn thực tế: /document/12345/raw.pdf
                    file_type TEXT,                 -- pdf, docx, txt, ...
                    doc_type TEXT,                  -- knowledge_base | schedule | price
                    size INTEGER,                   -- dung lượng (bytes)
                    version INTEGER DEFAULT 1,      -- để quản lý cập nhật
                    status TEXT DEFAULT 'active',   -- active / inactive / deleted
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_index_at TIMESTAMP DEFAULT NULL
                )
            """
            )

            # Migration: add doc_type if missing
            try:
                cols = [r[1] for r in self.conn.execute("PRAGMA table_info(documents)").fetchall()]
                if "doc_type" not in cols:
                    self.conn.execute("ALTER TABLE documents ADD COLUMN doc_type TEXT")
            except Exception as e:
                logger.warning(f"Could not run documents.doc_type migration: {e}")

            # Bảng chunk từ document hoặc FAQ
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS doc_chunks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    doc_type TEXT NOT NULL,                -- 'doc' hoặc 'faq'
                    doc_id INTEGER NOT NULL,               -- id nguồn từ documents hoặc faqs
                    chunk_text TEXT NOT NULL,              -- nội dung chunk
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """
            )

            # Tạo indexes để tìm kiếm nhanh
            self.conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_faq_question ON faqs(question)"
            )
            self.conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_variant_faq_id ON faq_variants(faq_id)"
            )
            self.conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_atomic_faq_id ON atomic_answers(faq_id)"
            )
            self.conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_atomic_variants_atomic_id ON atomic_variants(atomic_id)"
            )
            self.conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_chunks_doc ON doc_chunks(doc_type, doc_id)"
            )


            self.conn.commit()
            logger.info("Database initialized successfully")
        except Exception as e:
            logger.error(f"Lỗi khởi tạo database: {e}")
            raise

    def begin(self):
        """Bắt đầu transaction"""
        self.conn.execute("BEGIN")

    def commit(self):
        """Commit transaction"""
        self.conn.commit()

    def rollback(self):
        """Rollback transaction"""
        self.conn.rollback()

    def close(self):
        """Đóng connection"""
        if self.conn:
            self.conn.close()
            self.conn = None
            FAQDatabase._instance = None   # reset để tạo lại nếu cần
            self._initialized = False
            logger.info("Database connection closed")

    def add_faq(self, question: str, answer: str, url: str = None) -> int:
        """Thêm FAQ mới"""
        try:
            cursor = self.conn.execute(
                "INSERT INTO faqs (question, answer, url) VALUES (?, ?, ?)",
                (question, answer, url),
            )
            # self.conn.commit()
            faq_id = cursor.lastrowid
            logger.info(f"Đã thêm FAQ #{faq_id}: {question[:50]}...")
            return faq_id
        except Exception as e:
            logger.error(f"Lỗi thêm FAQ: {e}")
            raise

    
    def update_faq(self, faq_id: int, **kwargs) -> bool:
        """
        Cập nhật bản ghi trong bảng faqs theo faq_id.
        Các field có thể update: url, question, answer, status.
        Tự động update cột updated_at = CURRENT_TIMESTAMP.

        Trả về True nếu update thành công/ không có bản ghi nào bị ảnh hưởng, False nếu fail.
        """
        allowed_fields = {"url", "question", "answer", "status"}
        fields = []
        values = []

        for key, value in kwargs.items():
            if key in allowed_fields:
                fields.append(f"{key} = ?")
                values.append(value)

        if not fields:
            return True  # Không có field hợp lệ để update

        # Thêm updated_at
        fields.append("updated_at = CURRENT_TIMESTAMP")

        query = f"""
            UPDATE faqs
            SET {', '.join(fields)}
            WHERE id = ?
        """
        values.append(faq_id)

        try:
            cur = self.conn.execute(query, values)
            # self.conn.commit()
            return cur.rowcount > 0
        except Exception as e:
            logger.error(f"Lỗi khi update FAQ id={faq_id}: {e}")
            return False

    def update_faq_last_index(self, faq_id: int, last_index_at: bool = False, last_index_doc: bool = False) -> bool:
        """Cập nhật last_index_at và/hoặc last_index_doc theo faq_id"""
        try:
            cur = self.conn.execute(
                "SELECT last_index_at, last_index_doc FROM faqs WHERE id = ?",
                (faq_id,)
            )
            row = cur.fetchone()
            if not row:
                logger.warning(f"Không tìm thấy FAQ #{faq_id}")
                return False

            utc_now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            new_last_index_at = utc_now if last_index_at else row[0]
            new_last_index_doc = utc_now if last_index_doc else row[1]

            # Nếu không có thay đổi thì thôi
            if new_last_index_at == row[0] and new_last_index_doc == row[1]:
                logger.info(f"FAQ #{faq_id} không có thay đổi last_index_*")
                return True

            # Update DB
            self.conn.execute(
                """
                UPDATE faqs
                SET last_index_at = ?, last_index_doc = ?
                WHERE id = ?
                """,
                (new_last_index_at, new_last_index_doc, faq_id)
            )
            logger.info(f"FAQ #{faq_id} đã cập nhật last_index_at/doc thành công")
            return True

        except Exception as e:
            logger.error(f"Lỗi cập nhật FAQ #{faq_id}: {e}")
            raise


    def delete_faq(self, faq_id: int) -> bool:
        """Xóa FAQ"""
        try:
            self.conn.execute("DELETE FROM faqs WHERE id = ?", (faq_id,))
            # self.conn.commit()
            logger.info(f"Đã xóa FAQ #{faq_id}")
            return True
        except Exception as e:
            logger.error(f"Lỗi xóa FAQ #{faq_id}: {e}")
            raise

    def soft_delete_faq(self, faq_id: int) -> bool:
        """
        Soft delete một FAQ bằng cách đổi status = 'deleted'.
        Đồng thời update updated_at = CURRENT_TIMESTAMP.
        Trả về True nếu có bản ghi bị ảnh hưởng, False nếu không.
        """
        query = """
            UPDATE faqs
            SET status = 'deleted',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """
        try:
            cur = self.conn.execute(query, (faq_id,))
            # self.conn.commit()
            return cur.rowcount > 0
        except Exception as e:
            logger.error(f"Lỗi khi soft delete FAQ id={faq_id}: {e}")
            return False

    def get_faq_by_id(self, faq_id: int) -> Optional[Dict]:
        """Lấy FAQ theo ID"""
        try:
            
            cursor = self.conn.execute("SELECT * FROM faqs WHERE id = ?", (faq_id,))
            row = cursor.fetchone()
            if row:
                logger.debug(f"Đã lấy FAQ #{faq_id}")
                return dict(row)
            else:
                logger.warning(f"Không tìm thấy FAQ #{faq_id}")
                return None
        except Exception as e:
            logger.error(f"Lỗi lấy FAQ #{faq_id}: {e}")
            raise

    def get_all_faqs(self) -> List[Dict]:
        """Lấy tất cả FAQ"""
        try:
            
            cursor = self.conn.execute("SELECT * FROM faqs")
            faqs = [dict(row) for row in cursor.fetchall()]
            logger.info(f"Đã lấy {len(faqs)} FAQ từ database")
            return faqs
        except Exception as e:
            logger.error(f"Lỗi lấy tất cả FAQ: {e}")
            raise
    
    def get_faqs_need_index(self):
        """Lấy tất cả FAQ cần index"""
          # để trả về dict-like
        cursor = self.conn.execute(
            """
            SELECT *
            FROM faqs
            WHERE (last_index_at IS NULL
            OR updated_at > last_index_at)
            AND status = 'active'
            """
        )
        return [dict(row) for row in cursor.fetchall()]
        
    def get_faqs_need_index_doc(self):
        """Lấy tất cả FAQ cần index"""
          # để trả về dict-like
        cursor = self.conn.execute(
            """
            SELECT *
            FROM faqs
            WHERE (last_index_doc IS NULL
            OR updated_at > last_index_doc)
            AND status = 'active'
            """
        )
        return [dict(row) for row in cursor.fetchall()]
        
    def get_faqs_by_status(self, status: str = "active"):
        """Lấy FAQ theo status"""
        cursor = self.conn.execute(
            """
            SELECT *
            FROM faqs
            WHERE status = ?
            """,
            (status,)
        )
        return [dict(row) for row in cursor.fetchall()]

    def get_faqs_indexed_active(self):
        
        cursor = self.conn.execute(
            """
            SELECT id, answer
            FROM faqs
            WHERE last_index_at IS NOT NULL
            AND status = 'active'
            AND updated_at <= last_index_at
            """
        )
        return [dict(row) for row in cursor.fetchall()]

    def search_faqs(self, query: str, limit: int = 50) -> List[Dict]:
        """Tìm kiếm FAQ theo từ khóa"""
        try:
            cursor = self.conn.execute(
                "SELECT * FROM faqs WHERE (question LIKE ? OR answer LIKE ?) LIMIT ?",
                (f"%{query}%", f"%{query}%", limit),
            )
            results = [dict(row) for row in cursor.fetchall()]
            logger.info(f"Tìm kiếm '{query}' trả về {len(results)} kết quả")
            return results
        except Exception as e:
            logger.error(f"Lỗi tìm kiếm FAQ với query '{query}': {e}")
            raise

    def add_faq_variant(
        self, faq_id: int, variant_text: str, variant_type: str = "paraphrase"
    ) -> int:
        """Thêm variant cho FAQ"""
        try:
            cursor = self.conn.execute(
                "INSERT INTO faq_variants (faq_id, variant_text, variant_type) VALUES (?, ?, ?)",
                (faq_id, variant_text, variant_type),
            )
            self.conn.commit()
            variant_id = cursor.lastrowid
            logger.info(f"Đã thêm variant #{variant_id} cho FAQ #{faq_id}")
            return variant_id
        except Exception as e:
            logger.error(f"Lỗi thêm variant cho FAQ #{faq_id}: {e}")
            raise

    def add_atomic_answer(self, faq_id: int, atomic_text: str) -> int:
        """Thêm atomic answer cho FAQ"""
        try:
            cursor = self.conn.execute(
                "INSERT INTO atomic_answers (faq_id, atomic_text) VALUES (?, ?)",
                (faq_id, atomic_text),
            )
            # self.conn.commit()
            atomic_id = cursor.lastrowid
            logger.info(f"Đã thêm atomic answer #{atomic_id} cho FAQ #{faq_id}")
            return atomic_id
        except Exception as e:
            logger.error(f"Lỗi thêm atomic answer cho FAQ #{faq_id}: {e}")
            raise

    def add_atomic_variant(
        self, atomic_id: int, variant_text: str, variant_type: str = "paraphrase"
    ) -> int:
        """Thêm variant gắn với một atomic answer"""
        try:
            cursor = self.conn.execute(
                "INSERT INTO atomic_variants (atomic_id, variant_text, variant_type) VALUES (?, ?, ?)",
                (atomic_id, variant_text, variant_type),
            )
            # self.conn.commit()
            variant_id = cursor.lastrowid
            logger.info(
                f"Đã thêm atomic variant #{variant_id} cho atomic #{atomic_id}"
            )
            return variant_id
        except Exception as e:
            logger.error(f"Lỗi thêm atomic variant cho atomic #{atomic_id}: {e}")
            raise

    def get_atomic_variant_by_id(self, variant_id: int) -> dict:
        """Trả về thông tin từ atomic_variants.id:
        - variant_text
        - atomic_text
        - faq_id
        - faq.question
        - faq.answer
        """
        query = """
            SELECT 
                av.id AS variant_id,
                av.variant_text,
                aa.atomic_text,
                aa.faq_id,
                f.question AS faq_question,
                f.answer AS faq_answer
            FROM atomic_variants av
            JOIN atomic_answers aa ON av.atomic_id = aa.id
            JOIN faqs f ON aa.faq_id = f.id
            WHERE av.id = ?
        """
        row = self.conn.execute(query, (variant_id,)).fetchone()
        if row:
            return dict(row)
        return dict(row) if row else None

    def delete_atomic_by_faq(self, faq_id: int) -> bool:
        """
        Xóa tất cả atomic_answers và atomic_variants liên quan đến một FAQ.
        Không xóa bản ghi FAQ.
        """
        try:
            # Xóa atomic_variants thông qua atomic_id thuộc faq_id
            self.conn.execute(
                """
                DELETE FROM atomic_variants
                WHERE atomic_id IN (
                    SELECT id FROM atomic_answers WHERE faq_id = ?
                )
                """,
                (faq_id,)
            )

            # Xóa atomic_answers thuộc faq_id
            self.conn.execute(
                "DELETE FROM atomic_answers WHERE faq_id = ?",
                (faq_id,)
            )

            # self.conn.commit()
            return True
        except Exception as e:
            logger.error(f"Lỗi khi xóa atomic liên quan tới FAQ id={faq_id}: {e}")
            return False

    def get_faq_with_variants(self, faq_id: int) -> Optional[Dict]:
        """Lấy FAQ và tất cả variants"""
        try:
            faq = self.get_faq_by_id(faq_id)
            if not faq:
                return None

            # Lấy variants
            cursor = self.conn.execute(
                "SELECT * FROM faq_variants WHERE faq_id = ?", (faq_id,)
            )
            variants = [dict(row) for row in cursor.fetchall()]

            # Lấy atomic answers
            cursor = self.conn.execute(
                "SELECT * FROM atomic_answers WHERE faq_id = ?", (faq_id,)
            )
            atomic_answers = [dict(row) for row in cursor.fetchall()]

            faq["variants"] = variants
            faq["atomic_answers"] = atomic_answers
            logger.info(
                f"Đã lấy FAQ #{faq_id} với {len(variants)} variants và {len(atomic_answers)} atomic answers"
            )
            return faq
        except Exception as e:
            logger.error(f"Lỗi lấy FAQ #{faq_id} với variants: {e}")
            raise

    def export_to_csv_format(self) -> List[Dict]:
        """Export FAQ để tương thích với code cũ"""
        try:
            faqs = self.get_all_faqs()
            export_data = [
                {
                    "id": faq["id"],
                    "url": faq["url"],
                    "question": faq["question"],
                    "answer": faq["answer"],
                }
                for faq in faqs
            ]
            logger.info(f"Đã export {len(export_data)} FAQ ra CSV format")
            return export_data
        except Exception as e:
            logger.error(f"Lỗi export CSV format: {e}")
            raise

    def backup_database(self, backup_path: str) -> bool:
        """Backup database file"""
        try:
            import shutil

            shutil.copy2(self.db_path, backup_path)
            logger.info(f"Database đã được backup tại: {backup_path}")
            return True
        except Exception as e:
            logger.error(f"Lỗi backup database: {e}")
            return False

    def get_stats(self) -> Dict:
        """Lấy thống kê database"""
        try:
            # Tổng số FAQ
            cursor = self.conn.execute("SELECT COUNT(*) FROM faqs")
            total_faqs = cursor.fetchone()[0]

            # Số variants
            cursor = self.conn.execute("SELECT COUNT(*) FROM faq_variants")
            total_variants = cursor.fetchone()[0]

            # Số atomic answers
            cursor = self.conn.execute("SELECT COUNT(*) FROM atomic_answers")
            total_atomics = cursor.fetchone()[0]

            # Số atomic variants
            cursor = self.conn.execute("SELECT COUNT(*) FROM atomic_variants")
            total_atomic_variants = cursor.fetchone()[0]

            stats = {
                "total_faqs": total_faqs,
                "total_variants": total_variants,
                "total_atomics": total_atomics,
                "total_atomic_variants": total_atomic_variants,
            }
            logger.info(f"Database stats: {stats}")
            return stats
        except Exception as e:
            logger.error(f"Lỗi lấy thống kê database: {e}")
            raise

    def get_q_index_rows(self) -> List[Dict]:
        """Trả về các hàng để build Q-index từ database.
        Mỗi hàng là một biến thể câu hỏi map 1-1 tới một atomic answer.
        Nếu atomic chưa có variant, sẽ fallback dùng chính câu hỏi gốc (faqs.question).
        """
        try:
            # Join atomic -> faq, left join variants theo atomic
            cursor = self.conn.execute(
                """
                SELECT 
                    aa.id AS atomic_id,
                    aa.faq_id AS faq_id,
                    aa.atomic_text AS atomic_text,
                    f.question AS source_faq_question,
                    f.answer AS source_faq_answer,
                    v.variant_text AS variant_text
                FROM atomic_answers aa
                JOIN faqs f ON f.id = aa.faq_id
                LEFT JOIN atomic_variants v ON v.atomic_id = aa.id
                ORDER BY aa.id ASC
                """
            )
            rows = [dict(row) for row in cursor.fetchall()]

            # Nhóm theo atomic_id để xử lý fallback khi không có variant
            from collections import defaultdict

            atomic_to_rows: Dict[int, List[Dict]] = defaultdict(list)
            for r in rows:
                atomic_to_rows[int(r["atomic_id"])].append(r)

            output: List[Dict] = []
            for atomic_id, group in atomic_to_rows.items():
                has_variant = any(
                    (g.get("variant_text") or "").strip() for g in group
                )
                if not has_variant:
                    g0 = group[0]
                    output.append(
                        {
                            "atomic_id": g0["atomic_id"],
                            "faq_id": g0["faq_id"],
                            "atomic_text": g0["atomic_text"],
                            "variant_text": g0["source_faq_question"],
                            "source_faq_question": g0["source_faq_question"],
                            "source_faq_answer": g0["source_faq_answer"],
                        }
                    )
                else:
                    for g in group:
                        vt = (g.get("variant_text") or "").strip()
                        if not vt:
                            continue
                        output.append(
                            {
                                "atomic_id": g["atomic_id"],
                                "faq_id": g["faq_id"],
                                "atomic_text": g["atomic_text"],
                                "variant_text": vt,
                                "source_faq_question": g["source_faq_question"],
                                "source_faq_answer": g["source_faq_answer"],
                            }
                        )
            return output
        except Exception as e:
            logger.error(f"Lỗi lấy dữ liệu Q-index từ DB: {e}")
            raise

    def test_connection(self) -> bool:
        """Test kết nối database"""
        try:
            cursor = self.conn.execute("SELECT 1")
            result = cursor.fetchone()
            logger.info("Database connection test successful")
            return True
        except Exception as e:
            logger.error(f"Database connection test failed: {e}")
            return False

    def clear_atomic_data(self) -> bool:
        """Xóa toàn bộ dữ liệu trong atomic_answers và atomic_variants"""
        try:
            self.conn.execute("DELETE FROM atomic_variants")
            self.conn.execute("DELETE FROM atomic_answers")
            self.conn.commit()
            logger.info(
                "Đã xóa toàn bộ dữ liệu trong atomic_answers và atomic_variants"
            )
            return True
        except Exception as e:
            logger.error(f"Lỗi khi xóa atomic data: {e}")
            raise

    # ---------------- DOC CRUD ----------------

    def create_document(self, title, file_path, file_type, size, version=1, doc_type: str | None = None):
        """Thêm document mới"""
        cursor = self.conn.execute(
            """
            INSERT INTO documents (title, file_path, file_type, doc_type, size, version, status)
            VALUES (?, ?, ?, ?, ?, ?, 'active')
            """,
            (title, file_path, file_type, doc_type, size, version),
        )
        # self.conn.commit()
        return cursor.lastrowid

    def get_document(self, doc_id):
        """Lấy thông tin document theo id"""
        cursor = self.conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def list_documents(self, status="active"):
        """Liệt kê documents theo status"""
        cursor = self.conn.execute(
            "SELECT * FROM documents WHERE status = ? ORDER BY updated_at DESC",
            (status,),
        )
        return [dict(row) for row in cursor.fetchall()]
        
    def get_docs_need_index(self):
        """Liệt kê documents theo status"""
        cursor = self.conn.execute(
            """
            SELECT *
            FROM documents
            WHERE (last_index_at IS NULL OR updated_at > last_index_at)
            AND status = 'active'
            """
        )
        return [dict(row) for row in cursor.fetchall()]

    def update_document(self, doc_id, **kwargs):
        """
        Cập nhật thông tin document
        kwargs có thể là: title, file_path, file_type, doc_type, size, status, version, last_index_at 
        """
        if not kwargs:
            return False

        allowed_fields = {"title", "file_path", "file_type", "doc_type", "size", "status", "version"}
        valid_items = [(k, v) for k, v in kwargs.items() if k in allowed_fields]

        if not valid_items:
            return False

        set_clause = ", ".join(f"{k} = ?" for k, _ in valid_items)
        params = [v for _, v in valid_items] + [datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"), doc_id]

        self.conn.execute(
            f"UPDATE documents SET {set_clause}, updated_at = ? WHERE id = ?",
            params,
        )
        # self.conn.commit()
        return True
        
    def update_document_last_index(self, doc_id, last_index_at=None):
        """
        Cập nhật thông tin document : last_index_at 
        """
        if last_index_at is None:
            last_index_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        params = [last_index_at, doc_id]
        self.conn.execute(
            "UPDATE documents SET last_index_at = ? WHERE id = ?",
            params,
        )
        # self.conn.commit()
        return True

    def delete_document(self, doc_id):
        """Soft delete: chuyển status = deleted"""
        return self.update_document(doc_id, status="deleted")

    def hard_delete_document(self, doc_id):
        """Xóa cứng khỏi DB"""
        self.conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        # self.conn.commit()
        return True

    # ------------- CHUNKS ------------------

    def add_chunk(self, doc_id: int, doc_type: str, chunk_text: str) -> int:
        """Thêm một chunk mới vào doc_chunks, trả về chunk_id"""
        try:
            cur = self.conn.execute(
                """
                INSERT INTO doc_chunks (doc_type, doc_id, chunk_text)
                VALUES (?, ?, ?)
                """,
                (doc_type, doc_id, chunk_text),
            )
            # self.conn.commit()
            return cur.lastrowid
        except Exception as e:
            logger.error(f"Lỗi khi thêm chunk: {e}")
            raise


    def delete_chunks(self, doc_id: int, doc_type: str) -> int:
        """Xoá toàn bộ chunks theo (doc_type, doc_id), trả về số rows bị xoá"""
        try:
            cur = self.conn.execute(
                "DELETE FROM doc_chunks WHERE doc_type = ? AND doc_id = ?",
                (doc_type, doc_id),
            )
            return cur.rowcount
        except Exception as e:
            logger.error(f"Lỗi khi xoá chunks: {e}")
            raise


    def get_chunk_by_id(self, chunk_id: int) -> dict | None:
        """Lấy 1 chunk theo chunk_id"""
        try:
            cur = self.conn.execute(
                "SELECT * FROM doc_chunks WHERE id = ?",
                (chunk_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None
        except Exception as e:
            logger.error(f"Lỗi khi lấy chunk theo id: {e}")
            raise


    def get_chunks_by_doc(self, doc_type: str, doc_id: int) -> list[dict]:
        """Lấy toàn bộ chunks của một doc/faq"""
        try:
            cur = self.conn.execute(
                "SELECT * FROM doc_chunks WHERE doc_type = ? AND doc_id = ? ORDER BY id",
                (doc_type, doc_id),
            )
            rows = cur.fetchall()
            return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Lỗi khi lấy chunks theo (doc_type, doc_id): {e}")
            raise
