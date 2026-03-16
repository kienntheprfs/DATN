from typing import Optional, Tuple
import re
def normalize_name(text: str) -> str:
    """
    Chuẩn hóa chuỗi: chuyển về chữ thường, bỏ dấu tiếng Việt (tùy chọn),
    xóa khoảng trắng thừa.
    """
    if not text:
        return ""
    text = text.lower().strip()
    # Logic bỏ dấu tiếng Việt (nếu muốn search không dấu)
    # text = unicodedata.normalize('NFD', text).encode('ascii', 'ignore').decode("utf-8")
    return text

def extract_a_b(q: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Trích xuất điểm đi (A) và điểm đến (B) từ câu query tiếng Việt.
    Hỗ trợ: "Từ A đến B", "Đi tới B", "Tìm đường sang B"...
    """
    q = normalize_name(q)
    
    # Pattern 1: Đầy đủ "Từ ... đến ..."
    # Các từ nối: đến, tới, sang, về, qua
    match_full = re.search(r"(?:từ|đi từ)\s+(.*?)\s+(?:đến|tới|sang|về|qua)\s+(.*)", q)
    if match_full:
        return match_full.group(1).strip(), match_full.group(2).strip()

    # Pattern 2: Chỉ có điểm đến "Đến ...", "Tới ...", "Tìm ...", "Về ..."
    match_dest = re.search(r"(?:đến|tới|sang|về|tìm|đi)\s+(.*)", q)
    if match_dest:
        return None, match_dest.group(1).strip()
        
    # Pattern 3: Trường hợp người dùng chỉ nhập tên địa điểm (coi là điểm đến)
    return None, q.strip()

