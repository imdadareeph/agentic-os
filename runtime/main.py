"""Agentic OS memory runtime — FastAPI app (Phase M0).

Run: cd runtime && uv run uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from memory import conversation
from models.memory import (
    CreateSessionRequest,
    CreateSessionResponse,
    HealthResponse,
    RetrieveRequest,
    RetrieveResponse,
    StoreRequest,
    Turn,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = await conversation.connect()
    yield
    await app.state.db.close()


app = FastAPI(title="Agentic OS Memory Runtime", version="0.1.0", lifespan=lifespan)

# Browser reaches us via the Vite /runtime proxy (same-origin), but allow
# direct localhost access for curl/debug tools.
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
    return HealthResponse(sqlite=sqlite_ok, chroma=None, vault=None, sync=None)


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
    return RetrieveResponse(
        conversation=[Turn(**t) for t in turns],
        semantic=[],
        episodic=[],
        procedural=[],
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
