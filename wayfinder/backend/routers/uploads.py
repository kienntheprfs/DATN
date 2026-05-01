import os
import shutil
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter()

DATA_DIR = "data"
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/image")
async def upload_image(file: UploadFile = File(...)):
    # 1. Validate File type
    if file.content_type not in [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
        "image/svg+xml",
    ]:
        raise HTTPException(
            status_code=400, detail="File phải là ảnh (png/jpg/webp/svg)."
        )

    # 2. Tạo tên file duy nhất
    ts = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    ext = os.path.splitext(file.filename)[1].lower()
    if not ext:
        ext = ".png"

    filename = f"img_{ts}{ext}"
    disk_path = os.path.join(UPLOAD_DIR, filename)

    # 3. Lưu file
    try:
        with open(disk_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi lưu file: {str(e)}")

    # 4. Trả về đường dẫn tương đối
    relative_path = os.path.join("uploads", filename).replace("\\", "/")
    return {"url": relative_path}
