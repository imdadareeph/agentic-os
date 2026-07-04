"""Pydantic request/response models for the memory API (Phase M0)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Stable shape from day one — chroma/vault/sync stay null until M2."""

    sqlite: bool
    chroma: bool | None = None
    vault: bool | None = None
    sync: bool | None = None
    # None = Obsidian API key not configured yet; True/False = reachable or not.
    obsidianApi: bool | None = None


class ObsidianConfigRequest(BaseModel):
    baseUrl: str = "https://127.0.0.1:27124"
    apiKey: str = ""


class ObsidianConfigResponse(BaseModel):
    baseUrl: str
    configured: bool  # never echoes the raw key back


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
    # Memory Budget caps (frontend memory-settings-store):
    #   maxRetrievedMemories -> hard cap on injected memories (primary retrieve cap)
    #   sessionContextTokens -> total inject budget (context_builder truncates to fit)
    maxRetrievedMemories: int = 25
    sessionContextTokens: int = 8192


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


class ToolRunRequest(BaseModel):
    toolName: str
    success: bool
    sessionId: str | None = None
    agentId: str = "jarvis"
    inputJson: str | None = None
    outputJson: str | None = None
    durationMs: int | None = None


class ToolRunResponse(BaseModel):
    id: str


class MaintenanceRequest(BaseModel):
    conversationDays: int = 30
    proceduralDays: int = 90


class MaintenanceResponse(BaseModel):
    archived_sessions: int = 0
    archived_turns: int = 0
    pruned_tool_runs: int = 0


class StoreRequest(BaseModel):
    sessionId: str
    turn: Turn
    agentId: str = "jarvis"


class HeartbeatRequest(BaseModel):
    """Frontend pings this while a conversation is active: keeps the runtime's
    activity clock warm (defers idle background work) and mirrors the Memory
    Budget into the idle worker. All budget fields are optional."""

    maxParallelMemoryJobs: int | None = None
    embeddingBudgetPerDay: int | None = None
    dailyReflectionMinutes: int | None = None
    maxBackgroundCpuPercent: int | None = None
    maxBackgroundGpuPercent: int | None = None


class HeartbeatResponse(BaseModel):
    ok: bool = True
    idle: bool = False


class ReflectResponse(BaseModel):
    """Result of a manual dirty-turn reflection drain (also runs in the idle worker)."""

    reflected: int = 0
