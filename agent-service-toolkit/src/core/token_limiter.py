import time
from typing import Dict, List, Tuple
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)

class TokenRateLimiter:
    def __init__(self, max_tokens: int, time_window: int = 60):
        self.max_tokens = max_tokens
        self.time_window = time_window
        # Structure: {client_id: [(timestamp, tokens_used)]}
        self.usage_data: Dict[str, List[Tuple[float, int]]] = {}

    def _cleanup_client(self, client_id: str, current_time: float):
        if client_id in self.usage_data:
            self.usage_data[client_id] = [
                (ts, tokens) for ts, tokens in self.usage_data[client_id]
                if current_time - ts <= self.time_window
            ]
            if not self.usage_data[client_id]:
                del self.usage_data[client_id]

    def check_limit(self, client_id: str):
        current_time = time.time()
        self._cleanup_client(client_id, current_time)
        
        if client_id in self.usage_data:
            total_tokens = sum(tokens for ts, tokens in self.usage_data[client_id])
            if total_tokens >= self.max_tokens:
                logger.warning(f"Rate limit exceeded for {client_id}: {total_tokens} tokens")
                raise HTTPException(
                    status_code=429,
                    detail="AI token limit exceeded. Please try again later."
                )

    def get_limit_usage(self, client_id: str):
        current_time = time.time()
        self._cleanup_client(client_id, current_time)
        return {
            "client_id": client_id,
            "timestamp and usage": self.usage_data.get(client_id, [])
        }

    def add_usage(self, client_id: str, tokens: int):
        current_time = time.time()
        self._cleanup_client(client_id, current_time)
        
        if client_id not in self.usage_data:
            self.usage_data[client_id] = []
        
        self.usage_data[client_id].append((current_time, tokens))

# Default limit: 100,000 tokens per minute
token_limiter = TokenRateLimiter(max_tokens=100000, time_window=60)
