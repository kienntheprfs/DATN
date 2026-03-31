# src/services/validators.py
from fastapi import HTTPException, UploadFile
from pathlib import Path
from ..models.models import DocumentType

ALLOWED_CONTENT_TYPES = {
    "application/pdf": DocumentType.PDF,
    "text/plain": DocumentType.TXT,
    "text/markdown": DocumentType.MD,
    "text/x-markdown": DocumentType.MD,
    "application/msword": DocumentType.DOCX,  # .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": DocumentType.DOCX,  # .docx
}

ALLOWED_EXTENSIONS = {
    ".pdf": DocumentType.PDF,
    ".txt": DocumentType.TXT,
    ".md": DocumentType.MD,
    ".markdown": DocumentType.MD,
    ".doc": DocumentType.DOCX,
    ".docx": DocumentType.DOCX,
}

def validate_upload_file(file: UploadFile) -> DocumentType:
    # 1️⃣ Try content-type first
    if file.content_type in ALLOWED_CONTENT_TYPES:
        return ALLOWED_CONTENT_TYPES[file.content_type]

    # 2️⃣ Fallback to file extension
    ext = Path(file.filename).suffix.lower()
    if ext in ALLOWED_EXTENSIONS:
        return ALLOWED_EXTENSIONS[ext]

    raise HTTPException(
        status_code=400,
        detail=(
            f"Unsupported file type. "
            f"filename={file.filename}, "
            f"content_type={file.content_type}"
        )
    )

