# Agentic OS — Frontend Specification

Version: 1.0  
Status: Draft

---

## Overview

The frontend is the primary human interface to Agentic OS — a **command center**, not a CRUD dashboard.

It continuously communicates:

- AI activity and agent status
- Knowledge growth and graph changes
- Automation execution progress
- Organizational memory state

Built with feature-based modularity so AI coding agents can scaffold with minimal ambiguity.

---

## Technology Stack

### Core

| Tool | Version / Notes |
|------|-----------------|
| React | 19 |
| TypeScript | Strict mode |
| Vite | 7.x |

### Styling

| Tool | Purpose |
|------|---------|
| TailwindCSS | v4 target (v3 in current prototype) |
| shadcn/ui | Component primitives |
| tailwind-merge + cva | Class composition |

### State & Data

| Tool | Purpose |
|------|---------|
| Zustand | UI and local state |
| TanStack Query | Server state, caching |
| TanStack Router | Type-safe routing |

### Visualization

| Tool | Purpose |
|------|---------|
| React Three Fiber + Three.js | Living Knowledge Universe |
| @react-three/drei | R3F helpers |
| @react-three/postprocessing | Bloom, DOF |
| React Flow | Workflow / dependency graphs |
| D3 | Charts and custom viz |
| Recharts | Dashboard sparklines |

### Content

| Tool | Purpose |
|------|---------|
| TipTap | Rich Markdown editor |
| react-markdown | Read-only rendering |
| Mermaid | Diagrams in docs |
| Monaco Editor | Code blocks, configs |
| XTerm.js | Terminal output |

### Forms & Validation

React Hook Form + Zod

### Animation

Framer Motion

### Icons

Lucide React

### Utilities

date-fns, nanoid

---

## Directory Structure

```
app/src/
├── app/                 # App bootstrap, providers
├── assets/
├── components/
│   ├── ui/              # shadcn primitives
│   ├── cards/
│   ├── graph/           # Universe, React Flow
│   ├── navigation/
│   └── ...
├── features/
│   ├── dashboard/
│   ├── memory/
│   ├── graph/
│   ├── agents/
│   ├── skills/
│   ├── projects/
│   ├── search/
│   ├── settings/
│   ├── automation/
│   ├── analytics/
│   └── voice/
├── hooks/
├── layouts/
│   ├── MainLayout.tsx
│   ├── MissionControlLayout.tsx
│   └── ...
├── lib/
├── pages/
├── providers/
├── routes/
├── sections/            # Current prototype panels
├── services/
│   └── api/
├── stores/
├── styles/
│   └── tokens.css       # Design tokens from DESIGN.md
├── types/
└── utils/
```

Each feature owns: `components/`, `hooks/`, `pages/`, `services/`, `stores/`, `types/`, `routes/`, `index.ts`.

---

## Application Shell

```
App
 └── ThemeProvider
      └── QueryClientProvider
           └── RouterProvider
                └── MissionControlLayout
                     └── Current Route
```

---

## Mission Control Layout

```
┌────────────────────────────────────────────────────────────────────┐
│ TopNav — search, project, notifications, model, profile, theme     │
├──────────────┬─────────────────────────────┬────────────────────────┤
│ Sidebar      │ LivingKnowledgeUniverse     │ CommandDeck            │
│ (280px)      │ (~40% viewport)             │ (320px)                │
├──────────────┴─────────────────────────────┴────────────────────────┤
│ MetricsBar — KPI cards with sparklines                               │
├──────────────────────────────────────────────────────────────────────┤
│ StatusBar — connection, Claude Code, vault, CPU, memory, version     │
└──────────────────────────────────────────────────────────────────────┘
```

### Sidebar (Left)

- Primary navigation
- System Vitals (live metrics)
- Recent outputs / documents
- Collapsible: 80px ↔ 280px

### Center

Living Knowledge Universe — see [KNOWLEDGE_SPHERE.md](./KNOWLEDGE_SPHERE.md).

### Command Deck (Right)

Agent command buttons. Each triggers `POST /api/commands/{id}` → backend → Claude Code.

| Button | API Action |
|--------|------------|
| Morning Brief | `morning-brief` |
| Deep Research | `deep-research` |
| Metrics Pull | `metrics-pull` |
| Weekly Review | `weekly-review` |
| Vault Cleanup | `vault-cleanup` |
| Run Agent | `run-agent` |
| Generate Report | `generate-report` |
| Deploy | `deploy` |

Voice toggle (prototype in `RightPanel.tsx`).

### Footer Status Bar

Connection status, active model, embedding queue depth, running agent count, vault sync state, resource usage.

---

## Routing

| Path | Page |
|------|------|
| `/` | Dashboard (Mission Control) |
| `/projects` | Project list |
| `/projects/:id` | Project detail |
| `/memory` | Memory explorer |
| `/memory/:document` | Document viewer/editor |
| `/wiki`, `/raw` | Vault folder views |
| `/runs` | Execution history |
| `/skills`, `/skills/:id` | Skills |
| `/agents`, `/agents/:id` | Agents |
| `/automations` | Automations |
| `/analytics` | Analytics |
| `/search` | Search results |
| `/settings` | Settings |
| `/plugins`, `/themes`, `/help` | Platform |

---

## Dashboard Composition

| Section | Components |
|---------|------------|
| Metrics row | `MetricCard`, `SparklineChart`, animated counter |
| Universe | `LivingKnowledgeUniverse` |
| Activity | `ActivityFeed`, `RunTimeline` |
| Agents | `AgentStatusCard`, `RunningAgentsList` |
| Quick actions | Command palette shortcuts |

---

## Living Knowledge Universe (Summary)

Centerpiece — not decorative. Real-time mirror of OS state.

Layers (back to front):

1. Core (AI sun)
2. Knowledge nodes (instanced)
3. Relationship edges
4. Particle field
5. Orbit rings / trails
6. Selection / highlight layer
7. Labels (LOD)

Full spec: [KNOWLEDGE_SPHERE.md](./KNOWLEDGE_SPHERE.md).

Current prototype: `components/NeuralSphere.tsx` — particle sphere with bloom. Upgrade path documented in roadmap.

---

## State Management

| State Type | Tool | Examples |
|------------|------|----------|
| Server/remote | TanStack Query | Documents, metrics, graph |
| UI | Zustand | Sidebar collapsed, selection |
| URL | Router search params | Filters, active node |
| Persistent | IndexedDB | Offline cache, draft edits |

### Store Examples

- `useDashboardStore` — KPIs, vitals
- `useGraphStore` — selected node, filters, universe camera
- `useAgentStore` — running agents, logs
- `useNotificationStore` — toast queue

---

## API Layer

```
services/api/
├── client.ts          # fetch wrapper, auth headers
├── memory.ts
├── skills.ts
├── agents.ts
├── graph.ts
├── search.ts
├── analytics.ts
├── commands.ts        # Command Deck actions
└── websocket.ts       # Event subscriptions
```

Each service: typed responses, Zod validation, abort/cancel, retry with backoff.

---

## WebSocket Integration

Subscribe on dashboard mount:

```typescript
ws.subscribe('metrics', updateDashboard)
ws.subscribe('graph', updateUniverse)
ws.subscribe('agent', streamAgentOutput)
ws.subscribe('notification', pushNotification)
ws.subscribe('vault', invalidateMemoryQueries)
```

---

## Command Palette

Shortcut: **⌘K** (Ctrl+K on Windows/Linux)

Raycast-inspired: centered, blurred backdrop, keyboard-first.

Search: commands, documents, projects, skills, agents, settings, recent history.

---

## Markdown

### Viewer

Headings, tables, code, math, Mermaid, callouts, wikilinks, task lists, embeds.

### Editor

Split view, outline, autosave, syntax highlighting, version history (future).

---

## Theme System

Design tokens in `styles/tokens.css`. Components consume CSS variables only.

Themes: dark (default), light, cyber, terminal (future).

---

## Error Handling

- Route-level and feature-level error boundaries
- Retry actions on transient failures
- Fallback UI with error detail (never bare "Error")
- Client-side logging to observability endpoint

---

## Loading Patterns

- Skeleton shimmer for cards and lists
- Streaming text for agent output
- Progress bars for determinate operations
- `React.lazy` + Suspense for heavy routes (universe, editor)

---

## Performance

| Technique | Apply To |
|-----------|----------|
| Virtual lists | Document lists, run history |
| React.memo | Metric cards, node labels |
| Code splitting | Routes, Monaco, universe |
| Web Workers | Search indexing preview |
| InstancedMesh | Universe nodes |
| LOD | Universe at 10k+ nodes |

Targets: startup < 2s, universe 60 FPS desktop / 30 FPS integrated GPU.

---

## Accessibility

- WCAG 2.2 AA
- Full keyboard navigation
- `aria-live="polite"` for metric updates
- Focus visible on all controls
- Reduced motion → static graph mode
- High contrast theme token set

---

## Security

- No secrets in frontend bundle
- Sanitize Markdown HTML output
- Permission-aware UI (hide actions user cannot perform)
- Validate all API responses with Zod

---

## Testing

| Layer | Tool |
|-------|------|
| Unit | Vitest |
| Component | Testing Library |
| E2E | Playwright |
| Visual | Storybook |

---

## Coding Standards

- Strict TypeScript, no `any`
- Functional components only
- PascalCase components, `use*` hooks, `use*Store` stores
- Small focused components, composition over inheritance
- Feature colocation — keep related code together

---

## Current Prototype Map

| Spec | File | Status |
|------|------|--------|
| Mission Control grid | `App.tsx` | ✓ Basic |
| Left vitals panel | `sections/LeftPanel.tsx` | ✓ Static data |
| Center universe | `components/NeuralSphere.tsx` | ✓ Sphere v1 |
| Command deck | `sections/RightPanel.tsx` | ✓ UI only |
| shadcn/ui | `components/ui/*` | ✓ Installed |
| Design tokens | — | Pending |
| API integration | — | Pending |
| WebSocket | — | Pending |

---

## Success Criteria

- Application starts in under two seconds
- Universe renders at 60 FPS on discrete GPU
- 100,000+ markdown files remain responsive (virtualized lists + LOD graph)
- Every action keyboard accessible
- Every screen receives live WebSocket updates
- Interface feels alive — system is always thinking, not static
