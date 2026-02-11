from src.core.config import settings
from .local import LocalStorage
from .s3 import S3Storage

def get_storage():
    if settings.STORAGE_TYPE == "s3":
        return S3Storage()
    return LocalStorage()
