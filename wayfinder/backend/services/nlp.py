from typing import Optional, Tuple
import re
def normalize_name(text: str) -> str:
    """
    Chuẩn hóa chuỗi: chuyển về chữ thường, thay ký tự đặc biệt bằng khoảng trắng,
    xóa khoảng trắng thừa.
    """
    if not text:
        return ""
    text = text.lower().strip()
    # Thay thế gạch ngang, chấm, phẩy bằng khoảng trắng để search linh hoạt (VD: A4-201 -> a4 201)
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
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

