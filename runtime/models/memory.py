"""Pydantic request/response models for the memory API (Phase M0)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Stable shape from day one — chroma/vault/sync stay null until M2."""

    sqlite: bool
    chroma: bool | None = None
    vault: bool | None = None
    sync: bool | None = None


class CreateSessionRequest(BaseModel):
    sessionMemoryEnabled: bool = True
    incognito: bool = False
    agentId: str = "jarvis"


class CreateSessionResponse(BaseModel):
    sessionId: str


class Turn(BaseModel):
    id: str
    role: str = Field(pattern="^(user|assistant|system)$")
    content: str
    refined: bool = False
    createdAt: str | None = None


class RetrieveRequest(BaseModel):
    sessionId: str
    userMessage: str = ""
    agentId: str = "jarvis"
    limit: int = 20
    semanticEnabled: bool = False
    semanticTopK: int = 3
    semanticMinScore: float = 0.65


class SemanticHit(BaseModel):
    path: str | None = None
    text: str
    score: float


class RetrieveResponse(BaseModel):
    """Envelope stays stable across phases — later layers are empty lists for now."""

    conversation: list[Turn]
    semantic: list[SemanticHit] = []
    episodic: list = []
    procedural: list = []
    contextBlock: str = ""


class SearchRequest(BaseModel):
    query: str
    topK: int = 3
    minScore: float = 0.65


class SearchResponse(BaseModel):
    hits: list[SemanticHit] = []


class SyncResponse(BaseModel):
    embedded: int = 0
    deleted: int = 0
    vault: bool = False
    errors: list[str] = []


class EpisodicWriteRequest(BaseModel):
    title: str
    body: str
    sessionId: str = ""
    agentId: str = "jarvis"
    tags: list[str] = []
    sources: list[str] = []


class EpisodicWriteResponse(BaseModel):
    written: bool = False
    path: str | None = None
    jarvis_id: str | None = None
    chunks: int = 0
    reason: str | None = None


class StoreRequest(BaseModel):
    sessionId: str
    turn: Turn
    agentId: str = "jarvis"
