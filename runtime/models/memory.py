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


class RetrieveResponse(BaseModel):
    """Envelope stays stable across phases — later layers are empty lists for now."""

    conversation: list[Turn]
    semantic: list = []
    episodic: list = []
    procedural: list = []


class StoreRequest(BaseModel):
    sessionId: str
    turn: Turn
    agentId: str = "jarvis"
