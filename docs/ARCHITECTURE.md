# Agentic OS — Architecture

Version: 1.0  
Status: Draft

---

## Overview

Agentic OS is a **local-first, modular, event-driven AI operating system**.

Independent engines communicate through events and APIs. Every subsystem evolves independently. Markdown in the vault is the canonical source of truth; databases accelerate search, graph traversal, and metrics.

---

## High-Level Architecture

```
                    React Dashboard (Mission Control)
                              │
                 REST API + WebSocket
                              │
                    Rust Backend (Axum)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   Memory Engine        Agent Engine          Search Engine
   Skills Engine        Graph Engine          Plugin Engine
   Automation Engine    Index Engine          Voice Engine
   Loop Engine          Notification Engine
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                    Internal Event Bus
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   Markdown Vault        PostgreSQL           Qdrant (vectors)
        │                SQLite (cache)         Neo4j (graph)
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                      Claude Code (AI runtime)
                              │
                    MCP Servers (extensible tools)
```

---

## Design Philosophy

**Everything is an Engine.** Each engine owns its domain. No engine directly mutates another's state.

Communication channels:

- REST (CRUD, configuration)
- WebSocket (streaming, live updates)
- Internal event bus (decoupled reactions)

### Principles

- Local First
- AI Native
- Event Driven
- Modular
- Extensible

---

## Layer Model

### Layer 1 — Knowledge Base (Vault)

Obsidian-compatible Markdown vault. Source of truth. Human-editable. Git-syncable.

```
vault/
├── raw/          # Captures, imports
├── wiki/         # Curated knowledge
├── outputs/      # Generated artifacts
├── runs/         # Execution logs
├── skills/       # Skill definitions
├── automations/  # Workflow configs
├── agents/       # Agent configs
├── projects/     # Project scope
├── index.md
└── claude.md     # Claude Code instructions
```

### Layer 2 — Backend (Rust / Axum)

**Not Obsidian as UI.** Backend responsibilities:

- Read/write Markdown
- Build and update knowledge graph
- Watch filesystem (notify crate)
- Run agents via Claude Code
- Launch workflows
- Store metrics
- Expose REST + WebSocket

Alternative considered: FastAPI or Spring Boot. **Recommended: Rust (Axum)** for AI-heavy, high-concurrency workloads.

### Layer 3 — Hybrid Storage

| Store | Role |
|-------|------|
| Markdown files | Source of truth |
| PostgreSQL | Operational data, metrics, users |
| SQLite | Local metadata cache |
| Qdrant | Vector / semantic search |
| Neo4j | Knowledge graph relationships |
| Redis (optional) | Hot cache |

### Layer 4 — Dashboard (React / Vite)

Mission Control UI. See FRONTEND.md and DESIGN.md.

Visualization stack: React Three Fiber, React Flow, D3, Framer Motion, Recharts.

---

## Backend Stack (Rust)

| Component | Library |
|-----------|---------|
| HTTP | Axum |
| Async runtime | Tokio |
| SQL | SQLx (PostgreSQL) |
| Vector DB | Qdrant client |
| Graph DB | Neo4j driver |
| Full-text search | Tantivy |
| File watcher | notify |
| Desktop (optional) | Tauri |
| AI execution | Claude Code CLI bridge |
| Tool protocol | MCP support |
| Real-time | WebSockets, SSE |
| RPC (optional) | gRPC |

---

## Engine Specifications

### Memory Engine

- Read/write Markdown
- Watch vault filesystem
- Parse frontmatter and AST
- Resolve `[[wikilinks]]`
- Maintain document index
- Queue embedding generation
- Publish `DocumentCreated`, `DocumentUpdated`, `DocumentDeleted`

### Skills Engine

- Store skill definitions in `vault/skills/`
- Execute via Claude Code with skill context
- Version, validate, evaluate outputs
- Schedule and manual trigger support

### Automation Engine

- Cron, event, manual, conditional triggers
- Dependency chains, retries, history
- Writes run logs to `vault/runs/`

### Loop Engine

- Evaluate outputs against criteria
- Reflection and improvement suggestions
- Regression detection, historical comparison
- Feeds back into skill/agent prompts

### Knowledge Graph Engine

Nodes: documents, projects, skills, agents, tags, topics, people, tasks.  
Edges: references, dependencies, execution, ownership, similarity.

Provides: traversal, recommendations, visualization data, impact analysis.

Syncs to Neo4j; serves React Three Fiber universe.

### Agent Engine

- Agent registry from `vault/agents/`
- Planning, delegation, tool usage via MCP
- Claude Code as execution runtime
- Streaming logs over WebSocket

### Search Engine

- Keyword (Tantivy) + semantic (Qdrant) hybrid
- Filters, ranking, highlights, suggestions

### Plugin Engine

Frontend plugins, backend plugins, skill packs, themes, custom widgets, AI provider adapters.

### Notification Engine

System, agent, automation alerts. WebSocket push to dashboard.

### Voice Engine (Future)

STT, TTS, wake word, voice commands.

---

## Event Flow Example

```
Markdown file updated in vault/wiki/
    ↓
Filesystem Watcher (notify)
    ↓
Memory Engine — parse, extract links
    ↓
Update PostgreSQL metadata
    ↓
Queue embedding → Qdrant
    ↓
Update Neo4j graph
    ↓
Publish GraphUpdated event
    ↓
WebSocket → Frontend
    ↓
Living Universe animates + dashboard metrics refresh
    ↓
Search index updated (Tantivy)
```

---

## AI Provider Layer

**Primary runtime: Claude Code** (headless, triggered from Command Deck buttons).

Provider interface abstraction for future:

| Provider | Use |
|----------|-----|
| Claude Code | Primary agent execution, UI generation |
| OpenAI-compatible APIs | Optional cloud models |
| Local open models | Optional via compatible gateways |

Every provider implements: chat, embeddings, tool calling, streaming, model discovery, health check.

---

## Tool System

First-class tools via MCP:

- Filesystem, Git, Terminal, Browser
- Search, Database, Calendar
- Custom MCP servers

Each tool: metadata, JSON schema, permissions, execution, audit trail.

---

## API Design

### REST

CRUD for vault entities, configuration, auth, admin.

### WebSocket Channels

| Channel | Payload |
|---------|---------|
| `metrics` | Live KPI updates |
| `graph` | Node/edge changes |
| `agent` | Streaming tokens, status |
| `automation` | Run progress |
| `notification` | Alerts |
| `vault` | File change events |

---

## Authentication & Permissions

| Role | Capabilities |
|------|--------------|
| Viewer | Read vault, view dashboard |
| Editor | Read/write Markdown |
| Operator | Run skills, agents, automations |
| Administrator | Config, users, plugins |
| Owner | Full control |

Scopes apply per vault, project, agent, skill, automation.

Methods: local user, API keys, OIDC/OAuth (future).

---

## Frontend State

| Concern | Tool |
|---------|------|
| Remote/server state | TanStack Query |
| UI state | Zustand |
| Navigation | TanStack Router / URL |
| Offline cache | IndexedDB |

---

## Real-Time Updates

```
Frontend
    ↑ WebSocket
Backend
    ↑ Filesystem Watcher
Vault (Markdown)
```

Any Markdown change propagates automatically to metrics, universe, search, and panels.

---

## Performance Targets

| Operation | Target |
|-----------|--------|
| Startup | < 2s |
| Search | < 100ms |
| Graph update | < 200ms |
| Markdown parse | < 20ms |
| Embedding | Async queue |
| Dashboard | 60 FPS |
| Documents | 100k+ supported |

---

## Deployment

| Mode | Description |
|------|-------------|
| Local dev | Vite + Axum side by side |
| Docker | Compose: app, postgres, qdrant, neo4j |
| Desktop | Tauri wrapper (optional) |
| Future | Kubernetes, cloud sync, team vaults |

---

## Extensibility

Every engine exposes: events, REST endpoints, plugin hooks, CLI commands, configuration.

Core source should not require modification for common extensions.

---

## Architecture Summary

Agentic OS is a collection of loosely coupled engines over a Markdown vault. The React Mission Control frontend visualizes live system intelligence. Claude Code executes agent work. Hybrid storage accelerates everything without replacing human-readable files as the source of truth.
