"""Agentic OS memory runtime — FastAPI app (Phase M0 + M2).

Run: cd runtime && uv run uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from memory import (
    conversation,
    embedder,
    episodic,
    idle,
    jobs,
    orchestrator,
    procedural,
    reflection,
    retention,
    semantic,
    sync,
)
from memory.context_builder import build_context_block
from models.memory import (
    CreateSessionRequest,
    CreateSessionResponse,
    EpisodicWriteRequest,
    EpisodicWriteResponse,
    HealthResponse,
    HeartbeatRequest,
    HeartbeatResponse,
    MaintenanceRequest,
    MaintenanceResponse,
    ReflectResponse,
    RetrieveRequest,
    RetrieveResponse,
    SearchRequest,
    SearchResponse,
    SemanticHit,
    StoreRequest,
    SyncResponse,
    ToolRunRequest,
    ToolRunResponse,
    Turn,
)
from models.tools import (
    ApproveRequest,
    ApproveResponse,
    ToolCatalogEntry,
    ToolCatalogResponse,
    ToolExecuteRequest,
    ToolExecuteResponse,
    ToolLoopRequest,
    ToolLoopResponse,
    ToolPlanRequest,
    ToolPlanResponse,
    ToolsHealthResponse,
)
from tools import executor as tool_executor
from tools import registry as tool_registry
from tools import router as tool_router
from tools.loop import run_loop
from tools.schemas import ToolContext

# Daily retention sweep interval.
_RETENTION_INTERVAL_S = 24 * 60 * 60


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = await conversation.connect()
    await sync.ensure_migrations(app.state.db)
    # Let the watcher flag vault edits dirty in the DB (deferred idle embedding).
    sync.set_db(app.state.db)
    # Bring the vault into Chroma on boot, then watch for edits.
    loop = asyncio.get_running_loop()
    asyncio.create_task(embedder.warmup())
    if sync.vault_ready():
        asyncio.create_task(sync.reconcile())
        sync.start_watcher(loop)
    retention_task = asyncio.create_task(_retention_loop(app))
    # Idle background worker: processes dirty turns/files only while the user is idle.
    jobs_task = asyncio.create_task(jobs.run_loop(app.state.db))
    yield
    jobs_task.cancel()
    retention_task.cancel()
    sync.stop_watcher()
    sync.set_db(None)
    await app.state.db.close()


async def _retention_loop(app: FastAPI) -> None:
    """Daily background retention sweep. Errors are swallowed so it never dies."""
    while True:
        await asyncio.sleep(_RETENTION_INTERVAL_S)
        try:
            await retention.run_retention(app.state.db)
        except Exception:
            pass


app = FastAPI(title="Agentic OS Memory Runtime", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/memory/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    try:
        await app.state.db.execute("SELECT 1")
        sqlite_ok = True
    except Exception:
        sqlite_ok = False
    return HealthResponse(
        sqlite=sqlite_ok,
        chroma=semantic.available(),
        vault=sync.vault_ready(),
        sync=sync.sync_healthy(),
    )


@app.post("/api/sessions", response_model=CreateSessionResponse)
async def create_session(body: CreateSessionRequest) -> CreateSessionResponse:
    session_id = str(uuid.uuid4())
    await conversation.create_session(
        app.state.db,
        session_id,
        body.sessionMemoryEnabled,
        body.incognito,
        body.agentId,
    )
    return CreateSessionResponse(sessionId=session_id)


@app.delete("/api/sessions/{session_id}", status_code=204)
async def delete_session(session_id: str) -> Response:
    found = await conversation.end_session(app.state.db, session_id)
    if not found:
        raise HTTPException(status_code=404, detail="Session not found")
    return Response(status_code=204)


@app.post("/api/memory/retrieve", response_model=RetrieveResponse)
async def retrieve(body: RetrieveRequest) -> RetrieveResponse:
    idle.touch()  # live conversation → defer idle background work
    turns = await conversation.recent_turns(app.state.db, body.sessionId, body.limit)
    hits: list[dict] = []
    if body.semanticEnabled and body.userMessage:
        # maxRetrievedMemories is the primary retrieve cap; never fetch more than that.
        top_k = min(body.semanticTopK, max(1, body.maxRetrievedMemories))
        hits = await orchestrator.semantic_hits(
            body.userMessage, top_k, body.semanticMinScore
        )
    return RetrieveResponse(
        conversation=[Turn(**t) for t in turns],
        semantic=[SemanticHit(**h) for h in hits],
        episodic=[],
        procedural=[],
        contextBlock=build_context_block(
            hits,
            max_memories=body.maxRetrievedMemories,
            max_tokens=body.sessionContextTokens,
        ),
    )


@app.post("/api/memory/store", status_code=204)
async def store(body: StoreRequest) -> Response:
    idle.touch()  # live conversation → defer idle background work
    await conversation.store_turn(
        app.state.db,
        body.sessionId,
        body.turn.id,
        body.turn.role,
        body.turn.content,
        body.turn.refined,
        body.agentId,
    )
    return Response(status_code=204)


@app.post("/api/memory/heartbeat", response_model=HeartbeatResponse)
async def heartbeat(body: HeartbeatRequest) -> HeartbeatResponse:
    """Frontend pings while a conversation is active: keeps the activity clock warm
    (defers idle background work) and mirrors the Memory Budget into the idle worker."""
    idle.touch()
    jobs.set_budget(
        max_parallel_jobs=body.maxParallelMemoryJobs,
        embedding_budget_per_day=body.embeddingBudgetPerDay,
        daily_reflection_minutes=body.dailyReflectionMinutes,
        max_background_cpu_percent=body.maxBackgroundCpuPercent,
        max_background_gpu_percent=body.maxBackgroundGpuPercent,
    )
    return HeartbeatResponse(ok=True, idle=idle.is_idle())


@app.post("/api/memory/reflect", response_model=ReflectResponse)
async def reflect() -> ReflectResponse:
    """Manually drain + reflect all dirty turns now (also runs in the idle worker).

    Bypasses idle gating so the reflection pipeline can be exercised on demand.
    """
    total = 0
    while True:
        turns = await conversation.dirty_turns(app.state.db, 50)
        if not turns:
            break
        for turn in turns:
            await reflection.reflect_on_turn(app.state.db, turn)
        await conversation.clear_turn_dirty(app.state.db, [t["id"] for t in turns])
        total += len(turns)
    return ReflectResponse(reflected=total)


@app.post("/api/memory/search", response_model=SearchResponse)
async def search(body: SearchRequest) -> SearchResponse:
    """Debug semantic search (Memory Settings → Debug). Bypasses intent gating."""
    try:
        hits = await semantic.query(body.query, body.topK, body.minScore)
    except Exception:
        hits = []
    return SearchResponse(hits=[SemanticHit(**h) for h in hits])


@app.post("/api/memory/sync", response_model=SyncResponse)
async def trigger_sync() -> SyncResponse:
    result = await sync.reconcile()
    return SyncResponse(**result)


@app.post("/api/memory/episodic", response_model=EpisodicWriteResponse)
async def write_episodic(body: EpisodicWriteRequest) -> EpisodicWriteResponse:
    result = await episodic.write_note(
        title=body.title,
        body=body.body,
        agent_id=body.agentId,
        session_id=body.sessionId,
        tags=body.tags,
        sources=body.sources,
    )
    return EpisodicWriteResponse(**result)


@app.post("/api/memory/tool-run", response_model=ToolRunResponse)
async def record_tool_run(body: ToolRunRequest) -> ToolRunResponse:
    """Procedural memory (M4). Ready for the Tool Registry to call once it ships."""
    run_id = await procedural.record_tool_run(
        app.state.db,
        tool_name=body.toolName,
        success=body.success,
        session_id=body.sessionId,
        agent_id=body.agentId,
        input_json=body.inputJson,
        output_json=body.outputJson,
        duration_ms=body.durationMs,
    )
    return ToolRunResponse(id=run_id)


@app.post("/api/memory/maintenance", response_model=MaintenanceResponse)
async def maintenance(body: MaintenanceRequest) -> MaintenanceResponse:
    """Manually trigger the retention/archive sweep (also runs daily in the background)."""
    result = await retention.run_retention(
        app.state.db, body.conversationDays, body.proceduralDays
    )
    return MaintenanceResponse(**result)


# --- Tools (Phase T0) --------------------------------------------------------


@app.get("/api/tools/health", response_model=ToolsHealthResponse)
async def tools_health() -> ToolsHealthResponse:
    return ToolsHealthResponse(
        loaded=True,
        toolCount=tool_registry.tool_count(),
        categories=tool_registry.category_counts(),
    )


@app.get("/api/tools/catalog", response_model=ToolCatalogResponse)
async def tools_catalog(toolsEnabled: bool = True, categories: str | None = None) -> ToolCatalogResponse:
    if not toolsEnabled:
        return ToolCatalogResponse(tools=[])
    cats = [c for c in categories.split(",") if c] if categories else None
    tools = [ToolCatalogEntry(**t.to_public_dict()) for t in tool_registry.get_catalog(categories=cats)]
    return ToolCatalogResponse(tools=tools)


@app.post("/api/tools/plan", response_model=ToolPlanResponse)
async def tools_plan(body: ToolPlanRequest) -> ToolPlanResponse:
    idle.touch()
    result = tool_router.plan(body.userMessage, tool_registry.get_catalog(categories=body.categories))
    return ToolPlanResponse(**result)


@app.post("/api/tools/execute", response_model=ToolExecuteResponse)
async def tools_execute(body: ToolExecuteRequest) -> ToolExecuteResponse:
    ctx = ToolContext(
        db=app.state.db, session_id=body.sessionId or None,
        agent_id=body.agentId, allowed_paths=body.allowedPaths,
    )
    result = await tool_executor.execute(body.toolName, body.args, ctx, posture=body.posture)
    return ToolExecuteResponse(
        ok=result.ok, data=result.data, error=result.error,
        needsApproval=result.needs_approval, approvalId=result.approval_id, preview=result.preview,
    )


@app.post("/api/tools/loop", response_model=ToolLoopResponse)
async def tools_loop(body: ToolLoopRequest) -> ToolLoopResponse:
    """Primary voice integration — supervised tool loop (TOOLS.md §6.2)."""
    idle.touch()
    ctx = ToolContext(
        db=app.state.db, session_id=body.sessionId or None,
        agent_id=body.agentId, allowed_paths=body.allowedPaths,
    )
    result = await run_loop(
        ctx=ctx,
        user_message=body.userMessage,
        history=[t.model_dump() for t in body.history],
        tool_names=body.candidates,
        system_prompt=body.systemPrompt,
        api_key=body.apiKey,
        model=body.model,
        base_url=body.baseUrl,
        max_tokens=body.maxTokens,
        temperature=body.temperature,
        posture=body.posture,
    )
    return ToolLoopResponse(**result)


@app.post("/api/tools/approve", response_model=ApproveResponse)
async def tools_approve(body: ApproveRequest) -> ApproveResponse:
    """Resolve a pending tool approval (TOOLS.md §18). Approve -> execute now."""
    from tools import approvals

    pending = approvals.get(body.approvalId)
    if pending is None or pending.status == "expired":
        return ApproveResponse(approved=False, error="approval not found or expired")
    approvals.decide(body.approvalId, body.approved)
    if not body.approved:
        approvals.clear(body.approvalId)
        return ApproveResponse(approved=False, executed=False)

    ctx = ToolContext(
        db=app.state.db, session_id=body.sessionId or None,
        agent_id=body.agentId, allowed_paths=body.allowedPaths,
    )
    # force=True: permission was already granted by the human here.
    result = await tool_executor.execute(pending.tool_name, pending.args, ctx, force=True)
    approvals.clear(body.approvalId)
    return ApproveResponse(
        approved=True, executed=True, ok=result.ok, data=result.data, error=result.error,
    )
