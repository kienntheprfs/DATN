"""Shared test fixtures for wayfinder service."""

import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlmodel import Session, SQLModel
from sqlalchemy.pool import StaticPool

from fastapi.testclient import TestClient
from backend.main import app
from backend.core.db import get_session
from backend.routers.routes import _clear_graph_cache

integration_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


def override_get_session():
    with Session(integration_engine) as session:
        yield session


app.dependency_overrides[get_session] = override_get_session


@pytest.fixture(scope="function")
def integration_client():
    """Provide a TestClient with tables created and torn down per test."""
    _clear_graph_cache()
    SQLModel.metadata.create_all(integration_engine)
    client = TestClient(app)
    yield client
    SQLModel.metadata.drop_all(integration_engine)
    _clear_graph_cache()
