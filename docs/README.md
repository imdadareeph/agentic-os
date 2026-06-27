# Agentic OS — Documentation

Version: 1.0  
Status: Draft

Agentic OS is an open-source, local-first AI operating system. Humans and AI agents collaborate through a persistent knowledge graph, long-term memory, reusable skills, automation loops, and an immersive Mission Control interface.

**Markdown is the source of truth.** Everything else accelerates search, visualization, and execution.

---

## Documentation Index

| Document | Description |
|----------|-------------|
| [PRD.md](./PRD.md) | Product requirements, vision, personas, domain model |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, engines, storage, event flow |
| [DESIGN.md](./DESIGN.md) | Visual language, tokens, motion, layout |
| [FRONTEND.md](./FRONTEND.md) | React application structure, routing, state |
| [KNOWLEDGE_SPHERE.md](./KNOWLEDGE_SPHERE.md) | Living Universe visualization specification |
| [ROADMAP.md](./ROADMAP.md) | Phased implementation plan |

### Planned Documents

| Document | Description |
|----------|-------------|
| BACKEND.md | Rust/Axum backend, engines, workers |
| API.md | REST + WebSocket endpoint contracts |
| DATABASE.md | PostgreSQL, Qdrant, Neo4j schemas |
| AGENTS.md | Agent registry, execution, Claude Code integration |
| SKILLS.md | Skill definitions, versioning, evaluation |
| MEMORY.md | Vault pipeline, indexing, embeddings |
| LOOP_ENGINEERING.md | Self-improvement loops |
| SECURITY.md | Auth, permissions, audit |
| DEPLOYMENT.md | Local, Docker, desktop (Tauri) |
| TESTING.md | Unit, E2E, visual regression |
| TASKS.md | Granular implementation backlog |

### Frontend Sub-Documents (Planned)

`frontend/COMPONENTS.md`, `ROUTING.md`, `STATE_MANAGEMENT.md`, `UI_SYSTEM.md`, `ANIMATIONS.md`, `COMMAND_CENTER.md`, `DASHBOARDS.md`, `SETTINGS.md`, `ACCESSIBILITY.md`, `PERFORMANCE.md`

---

## Quick Reference

### Vault Structure

```
vault/
├── raw/
├── wiki/
├── outputs/
├── runs/
├── skills/
├── automations/
├── agents/
├── projects/
├── index.md
└── claude.md
```

### Stack Summary

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite, TailwindCSS, shadcn/ui, React Three Fiber |
| Backend | Rust, Axum, Tokio, SQLx |
| AI Runtime | Claude Code (headless commands from UI buttons) |
| Storage | Markdown vault + PostgreSQL + Qdrant + Neo4j |
| Real-time | WebSocket + filesystem watcher |

### Mission Control Layout

```
┌────────────────────────────────────────────────────────────────────┐
│ Header                                     Search        Profile   │
├──────────────┬─────────────────────────────┬────────────────────────┤
│ Navigation   │   Living Knowledge Universe │     Command Deck       │
│              │         (~40% screen)       │   Tasks / Agents       │
├──────────────┴─────────────────────────────┴────────────────────────┤
│  System Vitals   Active Agents   Skills   Memory   Loops   Graph    │
├──────────────────────────────────────────────────────────────────────┤
│ Status Bar • Claude Code • Event Bus • Vault • CPU • Memory         │
└──────────────────────────────────────────────────────────────────────┘
```

### Current Implementation Status

The `app/` directory contains the initial React + Vite dashboard prototype:

- Mission Control layout (left / center / right panels)
- Three.js neural sphere (`NeuralSphere.tsx`) with bloom post-processing
- shadcn/ui component library
- Dark cinematic theme

See [ROADMAP.md](./ROADMAP.md) for next steps.
