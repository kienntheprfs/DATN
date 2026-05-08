from typing import Optional, Tuple
import re

def normalize_name(text: str) -> str:
    """
    Chuẩn hóa chuỗi: chuyển về chữ thường, thay ký tự đặc biệt bằng khoảng trắng,
    giữ lại ký tự tiếng Việt, xóa khoảng trắng thừa.
    """
    if not text:
        return ""
    text = text.lower().strip()
    
    # re.UNICODE flag giúp \w nhận diện được ký tự có dấu tiếng Việt trong Python 3
    # Chúng ta thay thế các ký tự KHÔNG phải là chữ cái/số/khoảng trắng thành khoảng trắng
    text = re.sub(r'[^\w\s]', ' ', text, flags=re.UNICODE)
    
    # \w bao gồm cả dấu gạch dưới (_), nên ta xóa nó đi nếu muốn coi nó là ký tự phân tách
    text = text.replace('_', ' ')
    
    # Xóa khoảng trắng thừa
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def extract_a_b(q: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Trích xuất điểm đi (A) và điểm đến (B) từ câu query tiếng Việt.
    """
    if not q:
        return None, None
        
    q_orig = q.lower().strip()
    
    # Pattern 1: Đầy đủ "Từ ... đến ..."
    # Sử dụng non-greedy (.*?) để bắt điểm đi ngắn nhất có thể trước từ nối tiếp theo
    match_full = re.search(r"(?:từ|đi từ)\s+(.*?)\s+(?:đến|tới|sang|về|qua)\s+(.*)", q_orig)
    if match_full:
        start = match_full.group(1).strip()
        end = match_full.group(2).strip()
        return normalize_name(start), normalize_name(end)

    # Pattern 2: Chỉ có điểm đến "Đến ...", "Tới ...", "Tìm ...", "Về ...", "Đi ..."
    # Lưu ý: "đi" có thể nằm trong "đi từ", nên ta check Pattern 1 trước.
    match_dest = re.search(r"(?:đến|tới|sang|về|tìm|đi|chỉ đường tới|chỉ đường đến)\s+(.*)", q_orig)
    if match_dest:
        dest = match_dest.group(1).strip()
        return None, normalize_name(dest)
        
    # Pattern 3: Trường hợp người dùng chỉ nhập tên địa điểm
    return None, normalize_name(q_orig)
