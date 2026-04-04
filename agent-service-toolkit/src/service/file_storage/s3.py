# src/services/file_storage/s3_storage.py
import boto3
import asyncio
import tempfile
from botocore.client import Config
from typing import BinaryIO, AsyncGenerator
from contextlib import asynccontextmanager
from .base import FileStorage
from core.settings import settings

class S3Storage(FileStorage):
    def __init__(self):
        # Boto3 client là thread-safe, init 1 lần dùng mãi
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
            config=Config(signature_version="s3v4"),
        )
        self.bucket = settings.S3_BUCKET

    async def upload(self, key: str, file_obj: BinaryIO, content_type: str) -> str:
        def _upload():
            # upload_fileobj tự động handle multipart upload cho file lớn
            self.client.upload_fileobj(
                file_obj,
                self.bucket,
                key,
                ExtraArgs={"ContentType": content_type},
            )
        
        await asyncio.to_thread(_upload)
        return key

    async def delete(self, key: str):
        await asyncio.to_thread(
            self.client.delete_object, Bucket=self.bucket, Key=key
        )

    async def exists(self, key: str) -> bool:
        def _check():
            try:
                self.client.head_object(Bucket=self.bucket, Key=key)
                return True
            except Exception:
                return False
        return await asyncio.to_thread(_check)

    @asynccontextmanager
    async def download_stream(self, key: str) -> AsyncGenerator[BinaryIO, None]:
        """
        Kỹ thuật Spooling: Download từ S3 vào file tạm trên ổ cứng.
        Tuyệt đối không load file lớn vào RAM.
        """
        # Tạo file tạm thời, tự xóa khi đóng
        temp_file = tempfile.TemporaryFile() 
        
        def _download():
            self.client.download_fileobj(self.bucket, key, temp_file)
            temp_file.seek(0) # Reset con trỏ về đầu sau khi tải xong

        try:
            # Chạy download trong thread background
            await asyncio.to_thread(_download)
            yield temp_file
        finally:
            # Khi caller dùng xong, file này sẽ tự đóng và bị xóa khỏi ổ cứng
            temp_file.close()
    
    # def generate_presigned_url(self, key: str, expires_in: int = 900) -> str:
    #     """Sinh link S3 dùng một lần (mặc định 15 phút)"""
    #     try:
    #         return self.client.generate_presigned_url(
    #             ClientMethod='get_object',
    #             Params={
    #                 'Bucket': self.bucket,
    #                 'Key': key
    #             },
    #             ExpiresIn=expires_in
    #         )
    #     except Exception as e:
    #         # Xử lý log lỗi nếu cần thiết
    #         return "Không thể tạo link S3 đến tài liệu"
        
    def generate_presigned_url(self, file_path: str, content_type: str = None, disposition: str = None) -> str:
        params = {
            'Bucket': self.bucket,
            'Key': file_path
        }
        
        # Override Headers trả về từ S3
        if content_type:
            params['ResponseContentType'] = content_type
        if disposition:
            params['ResponseContentDisposition'] = disposition
            
        return self.client.generate_presigned_url(
            ClientMethod='get_object',
            Params=params,
            ExpiresIn=900 # 15 phút
        )