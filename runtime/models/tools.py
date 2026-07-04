"""Pydantic request/response models for the tools API (Phase T0)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class ToolsHealthResponse(BaseModel):
    loaded: bool
    toolCount: int
    categories: dict[str, int] = {}


class ToolCatalogEntry(BaseModel):
    name: str
    title: str
    description: str
    category: str
    permission: str
    latencyClass: str
    enabled: bool
    source: str


class ToolCatalogResponse(BaseModel):
    tools: list[ToolCatalogEntry]


class ToolPlanRequest(BaseModel):
    sessionId: str = ""
    userMessage: str
    agentId: str = "jarvis"
    categories: list[str] | None = None


class ToolPlanResponse(BaseModel):
    useTools: bool
    candidates: list[str] = []
    intent: str = "chat"


class ToolExecuteRequest(BaseModel):
    sessionId: str = ""
    toolName: str
    args: dict[str, Any] = {}
    agentId: str = "jarvis"
    allowedPaths: list[str] | None = None
    posture: str = "balanced"


class ToolExecuteResponse(BaseModel):
    ok: bool
    data: Any | None = None
    error: str | None = None
    needsApproval: bool = False
    approvalId: str | None = None
    preview: str | None = None


class ChatTurn(BaseModel):
    role: str
    content: str


class ToolLoopRequest(BaseModel):
    sessionId: str = ""
    userMessage: str
    history: list[ChatTurn] = []
    candidates: list[str] = []
    systemPrompt: str = ""
    agentId: str = "jarvis"
    categories: list[str] | None = None
    allowedPaths: list[str] | None = None
    posture: str = "balanced"  # cautious | balanced | trusted
    # Passed through from the browser's AI Settings — never persisted server-side,
    # never written into tool_runs (TOOLS.md §7: no secrets in tool schemas/logs).
    apiKey: str | None = None
    model: str | None = None
    baseUrl: str | None = None
    maxTokens: int = 1024
    temperature: float | None = None


class ToolRunSummary(BaseModel):
    tool: str
    success: bool
    error: str | None = None


class ApprovalRequest(BaseModel):
    approvalId: str
    toolName: str
    args: dict[str, Any] = {}
    preview: str | None = None


class ToolLoopResponse(BaseModel):
    reply: str | None = None
    toolRuns: list[ToolRunSummary] = []
    turns: int = 0
    degraded: bool = False
    reason: str | None = None
    approvalRequired: list[ApprovalRequest] = []


class ApproveRequest(BaseModel):
    approvalId: str
    approved: bool
    sessionId: str = ""
    agentId: str = "jarvis"
    allowedPaths: list[str] | None = None


class ApproveResponse(BaseModel):
    approved: bool
    executed: bool = False
    ok: bool = False
    data: Any | None = None
    error: str | None = None
