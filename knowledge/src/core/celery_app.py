# src/core/celery_app.py
from celery import Celery
from src.core.config import settings

celery_app = Celery(
    "document_worker",
    broker=settings.REDIS_BROKER_URL,
    backend=settings.REDIS_BACKEND_URL,
    # QUAN TRỌNG: Phải trỏ đúng đường dẫn tới file chứa @celery_app.task
    include=["src.workers.celery_tasks"] 
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Ho_Chi_Minh",
    enable_utc=True,
    
    # --- Performance Tuning (Best Practices) ---
    task_acks_late=True,       # Chỉ Ack khi task xong -> Chống mất task khi worker crash
    worker_prefetch_multiplier=1, # Quan trọng cho Task nặng (AI/Embedding): Mỗi worker chỉ ôm 1 task
    task_track_started=True,   # Theo dõi trạng thái STARTED
    task_time_limit=600,       # (Optional) Hard timeout 10 phút để kill worker bị treo
)
