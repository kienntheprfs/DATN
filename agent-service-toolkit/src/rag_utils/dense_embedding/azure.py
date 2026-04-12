import os
import time
from typing import List
from itertools import islice
from openai import AzureOpenAI

from .base import EmbeddingService
from core.settings import settings

# CHECK 
class AzureEmbeddingService(EmbeddingService):
    def __init__(
        self,
        deployment_name: str = settings.EMBEDDING_DEPLOYMENT_NAME,
        batch_size: int = 256,
        sleep_time: float = 0.0,
        normalize_output: bool = True,
    ):
        self.client = AzureOpenAI(
            api_key=settings.EMBEDDING_API_KEY,
            api_version=settings.EMBEDDING_API_VERSION,
            azure_endpoint=settings.EMBEDDING_ENDPOINT,
        )
        self.deployment_name = deployment_name
        self.batch_size = batch_size
        self.sleep_time = sleep_time
        self.normalize_output = normalize_output

    def _clean(self, text: str) -> str:
        return (text or "").replace("\n", " ")

    def _chunks(self, iterable, n):
        it = iter(iterable)
        while True:
            chunk = list(islice(it, n))
            if not chunk:
                break
            yield chunk

    def embed_query(self, text: str) -> List[float]:
        resp = self.client.embeddings.create(
            model=self.deployment_name,
            input=self._clean(text),
        )
        vec = resp.data[0].embedding
        return vec

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        out: List[List[float]] = []
        clean_texts = [self._clean(t) for t in texts]

        for chunk in self._chunks(clean_texts, self.batch_size):
            resp = self.client.embeddings.create(
                model=self.deployment_name,
                input=chunk,
            )
            for d in resp.data:
                vec = d.embedding
                out.append(vec)

            if self.sleep_time > 0:
                time.sleep(self.sleep_time)

        return out
