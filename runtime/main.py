"""Agentic OS memory runtime — FastAPI app (Phase M0 + M2).

Run: cd runtime && uv run uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from memory import conversation, embedder, episodic, orchestrator, semantic, sync
from memory.context_builder import build_context_block
from models.memory import (
    CreateSessionRequest,
    CreateSessionResponse,
    EpisodicWriteRequest,
    EpisodicWriteResponse,
    HealthResponse,
    RetrieveRequest,
    RetrieveResponse,
    SearchRequest,
    SearchResponse,
    SemanticHit,
    StoreRequest,
    SyncResponse,
    Turn,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = await conversation.connect()
    await sync.ensure_migrations(app.state.db)
    # Bring the vault into Chroma on boot, then watch for edits.
    loop = asyncio.get_running_loop()
    asyncio.create_task(embedder.warmup())
    if sync.vault_ready():
        asyncio.create_task(sync.reconcile())
        sync.start_watcher(loop)
    yield
    sync.stop_watcher()
    await app.state.db.close()


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
    turns = await conversation.recent_turns(app.state.db, body.sessionId, body.limit)
    hits: list[dict] = []
    if body.semanticEnabled and body.userMessage:
        hits = await orchestrator.semantic_hits(
            body.userMessage, body.semanticTopK, body.semanticMinScore
        )
    return RetrieveResponse(
        conversation=[Turn(**t) for t in turns],
        semantic=[SemanticHit(**h) for h in hits],
        episodic=[],
        procedural=[],
        contextBlock=build_context_block(hits),
    )


@app.post("/api/memory/store", status_code=204)
async def store(body: StoreRequest) -> Response:
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
