# Agentic OS — Product Requirements Document

Version: 1.0  
Status: Draft

---

## Vision

Agentic OS is an open-source AI operating system that enables humans and AI agents to collaborate through a persistent knowledge graph, long-term memory, reusable skills, automation loops, and an immersive command center.

Unlike traditional chat interfaces, Agentic OS acts as a **living workspace** where knowledge, tasks, workflows, and AI reasoning become permanent organizational assets.

The system should feel less like using ChatGPT and more like operating a futuristic command center that continuously learns, improves, and executes work.

**Inspired by:** Obsidian's vault concept — but Obsidian is the knowledge store, not the UI. Claude Code generates and executes. React provides Mission Control.

---

## Product Goals

The platform enables users to:

- Build a second brain using Markdown
- Organize knowledge into a structured hierarchy
- Create reusable AI skills
- Convert skills into automations
- Build self-improving execution loops
- Visualize organizational knowledge as a **Living Universe**
- Execute AI agents through a graphical command deck
- Replace repetitive work with deterministic workflows
- Operate entirely on local infrastructure

---

## Non-Goals

Agentic OS is **not**:

- A general-purpose note-taking app (Obsidian handles authoring; we orchestrate)
- A replacement for VS Code
- A replacement for GitHub
- A generic chatbot
- A workflow builder like n8n

It orchestrates these capabilities into one coherent operating system.

---

## Core Principles

### Local First

All data belongs to the user. Markdown remains the source of truth. Internet connectivity is optional.

### AI Native

Every screen assumes an AI agent is participating. The interface is designed for both humans and agents.

### Explainable

Every AI action produces: reasoning, execution log, artifacts, references, and evaluation.

### Deterministic

Skills execute consistently. Outputs improve through iteration, not randomness.

### Modular

Every subsystem functions independently and communicates via APIs and events.

---

## Expanded Domain Model

Everything in Agentic OS is a first-class entity:

```
Workspace
 ├── Vault
 ├── Memory
 ├── Knowledge
 ├── Projects
 ├── Agents
 ├── Skills
 ├── Workflows
 ├── Loops
 ├── Models
 ├── Tools
 ├── Prompts
 ├── Personas
 ├── Evaluations
 ├── Datasets
 ├── Automations
 ├── Artifacts
 ├── Sessions
 ├── Observability
 └── Settings
```

This model drives backend APIs, database schema, engine design, and the plugin ecosystem.

---

## Target Users

| Persona | Primary Needs |
|---------|---------------|
| Individual Developers | Personal AI assistant, code generation, memory, project organization |
| AI Engineers | Prompt management, evaluation, datasets, workflows, agent orchestration |
| Research Teams | Knowledge graph, document organization, citations, reusable reports |
| Content Creators | Content pipeline, planning, automation, publishing |
| Organizations | Institutional memory, reusable SOPs, AI knowledge workers |

---

## Product Pillars

1. **Memory** — Persistent long-term knowledge
2. **Skills** — Reusable AI capabilities
3. **Agents** — Specialized workers
4. **Automations** — Scheduled and event-triggered execution
5. **Loop Engineering** — Self-improvement through evaluation
6. **Knowledge Graph** — Visual representation of organizational memory
7. **Dashboard** — Operational Mission Control
8. **Projects** — Workspace management
9. **Analytics** — Performance metrics
10. **Search** — Semantic + keyword hybrid
11. **Settings** — Configuration and themes

---

## User Journey

```
Install Agentic OS
    ↓
Create a Vault
    ↓
Import Markdown
    ↓
Index documents
    ↓
Create first Skill
    ↓
Run Skill (via Command Deck button → Claude Code)
    ↓
Create Automation
    ↓
View results in dashboard
    ↓
Evaluate output → create improvement loop
    ↓
System continuously improves
```

---

## Primary Navigation

Dashboard · Memory · Projects · Agents · Skills · Automations · Knowledge Graph · Analytics · Search · Settings

---

## Information Architecture

```
Vault
├── Projects
├── Memory
├── Skills
├── Agents
├── Automations
├── Outputs
├── Runs
├── Wiki
├── Raw
└── Archive
```

### Vault Folder Conventions

| Path | Purpose |
|------|---------|
| `raw/` | Unprocessed captures, imports, drafts |
| `wiki/` | Curated, linked knowledge base |
| `outputs/` | Generated artifacts from skills and agents |
| `runs/` | Execution logs and run metadata |
| `skills/` | Skill definitions (Markdown + frontmatter) |
| `automations/` | Scheduled and triggered workflows |
| `agents/` | Agent configs, prompts, tool bindings |
| `projects/` | Project-scoped documents and metadata |
| `index.md` | Vault entry point and map |
| `claude.md` | Claude Code project instructions |

---

## Functional Requirements

The application must:

- Read and write Markdown
- Watch filesystem changes and propagate updates
- Index documents (keyword + semantic)
- Maintain graph relationships
- Execute AI agents via **Claude Code** (headless, button-triggered)
- Stream responses over WebSocket
- Maintain execution history
- Visualize knowledge as a Living Universe (Three.js)
- Support plugins
- Expose REST API
- Operate offline where possible
- Support multiple LLM providers (Claude Code primary; open-source stack for everything else)
- Maintain audit logs
- Support themes (dark primary)
- Provide command palette (⌘K)
- Execute workflows with retries and dependencies
- Manage prompts and personas
- Support voice interaction (future)

---

## Dashboard — Mission Control

The landing page is **not** a traditional dashboard. It is Mission Control for an AI operating system.

### Layout

| Zone | Content |
|------|---------|
| Left panel | Live metrics: subscribers, views, runs, memory, loops, recent outputs/documents |
| Center (~40%) | **Living Knowledge Universe** — real-time visualization of system intelligence |
| Right panel | **Command Deck** — agent command buttons |
| Bottom | KPI row: views, tasks, reports, memory growth, knowledge nodes, skill executions |
| Footer | Status bar: connection, Claude Code, event bus, vault, CPU, memory |

### Command Deck Actions

Each button calls the backend API, which triggers headless Claude Code:

| Command | Purpose |
|---------|---------|
| Morning Brief | Daily summary from vault |
| Deep Research | Multi-document analysis |
| Metrics Pull | Analytics snapshot |
| Weekly Review | Retrospective report |
| Vault Cleanup | Deduplicate, reorganize |
| Run Agent | Execute selected agent |
| Generate Report | Structured output artifact |
| Deploy | Push automation or skill |

### Real-Time Pipeline

```
Markdown file changes
    ↓
Filesystem Watcher
    ↓
Backend indexes + graph update
    ↓
WebSocket push
    ↓
Frontend updates (metrics, universe, panels)
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Startup | < 2 seconds |
| Search | < 100 ms |
| Graph render | < 500 ms |
| Markdown load | < 100 ms |
| AI response | Streaming |
| Scale | 100,000+ Markdown files |
| Graph | 1M edges |
| Automations | 100 simultaneous |
| Availability | Offline capable, cross-platform |

---

## Technology Constraints

| Component | Choice | Notes |
|-----------|--------|-------|
| AI execution | **Claude Code** | Headless commands from UI; not Ollama |
| Frontend | React, Vite, TypeScript | Open source |
| Backend | Rust (Axum, Tokio) | Open source, high performance |
| Knowledge store | Obsidian-compatible Markdown vault | Source of truth |
| UI generation | Claude Code | Scaffold and iterate on React UI |
| Databases | PostgreSQL, Qdrant, Neo4j | Hybrid; Markdown remains canonical |

---

## Future Vision

Agentic OS becomes an extensible platform where every organization builds its own AI operating system through plugins, custom agents, reusable skills, and persistent organizational memory — without depending on proprietary cloud platforms.
