# Agentic OS — Implementation Roadmap

Version: 1.0  
Status: Draft

---

## Philosophy

Build incrementally as a real software project. Design system before components. The Living Knowledge Universe is a product in its own right — not a decorative widget.

---

## Phase 1 — Design System ✓ (Documented)

- [x] DESIGN.md — visual specification
- [x] KNOWLEDGE_SPHERE.md — Living Universe spec
- [x] PRD.md, ARCHITECTURE.md, FRONTEND.md

---

## Phase 2 — Frontend Foundation (In Progress)

Current state in `app/`:

- [x] Initialize React + Vite + TypeScript
- [x] Install shadcn/ui, Three.js, React Three Fiber, Framer Motion, Recharts
- [x] Mission Control layout (left / center / right)
- [x] Neural sphere prototype with bloom (`NeuralSphere.tsx`)
- [ ] TailwindCSS v4 migration (currently v3)
- [ ] TanStack Router
- [ ] TanStack Query
- [ ] Zustand stores
- [ ] Design tokens file (CSS custom properties from DESIGN.md)
- [ ] Project structure per FRONTEND.md

### Dependencies to Add

| Category | Library |
|----------|---------|
| Router | TanStack Router |
| Data | TanStack Query |
| State | Zustand |
| Graph | React Flow |
| Markdown | react-markdown, TipTap |
| Editor | Monaco Editor |
| Terminal | XTerm.js |
| Forms | React Hook Form + Zod (installed) |

---

## Phase 3 — Global Theme

- [ ] Design tokens (colors, spacing, radius, motion)
- [ ] Typography (Inter, IBM Plex Mono, Space Grotesk for KPIs)
- [ ] Glassmorphism card system
- [ ] Motion system (Framer Motion presets)
- [ ] Dark theme default; light/cyber/terminal future

---

## Phase 4 — Mission Control Layout

- [ ] Header (search, project, notifications, model, profile)
- [ ] Left sidebar — System Vitals with sparklines
- [ ] Right sidebar — Command Deck
- [ ] Footer status bar
- [ ] Responsive collapse (tablet/mobile monitoring mode)

---

## Phase 5 — Living Knowledge Universe

- [ ] Upgrade sphere → universe (see KNOWLEDGE_SPHERE.md)
- [ ] Event-driven animations (WebSocket)
- [ ] Node types by domain entity color
- [ ] LOD + instanced rendering for scale
- [ ] Inspector panel on node selection

---

## Phase 6 — Dashboard Panels

- [ ] Metrics row with animated counters
- [ ] Recent activity feed
- [ ] Running agents list
- [ ] Automation status
- [ ] Notification stack

---

## Phase 7 — Backend (Rust)

- [ ] Axum REST API scaffold
- [ ] Filesystem watcher (notify crate)
- [ ] Markdown parser pipeline
- [ ] PostgreSQL + SQLx migrations
- [ ] Qdrant embedding queue
- [ ] Neo4j graph sync
- [ ] WebSocket event bus
- [ ] Ollama + vault execution bridge

---

## Phase 7a — JARVIS Voice (In Progress)

- [x] Vite proxy for Voicebox, Ollama, GitNexus, Whisper
- [x] Service health status bar + Voice Settings sheet
- [x] Real-time conversation mode (browser live captions + Whisper refine)
- [x] Push-to-talk fallback mode
- [x] Ollama chat with optional Voicebox LLM fallback
- [x] Browser TTS + optional Voicebox TTS (Jarvis profile)
- [x] Living Universe reactivity from real audio
- [ ] jarvis-voice.wav asset committed + Voicebox profile docs
- [ ] Obsidian vault path + context injection
- [ ] GitNexus query for code questions
- [ ] Command Deck → skill execution

---

## Phase 8 — Integration

- [ ] Vault mount and watch
- [ ] Command Deck → API → Claude Code
- [ ] Real-time metrics from runs/
- [ ] Search (Tantivy keyword + Qdrant semantic)
- [ ] Command palette (⌘K)

---

## Phase 9 — Polish

- [ ] Accessibility (WCAG AA, reduced motion)
- [ ] Performance (virtual lists, code splitting)
- [ ] Error boundaries and offline indicators
- [ ] E2E tests (Playwright)

---

## Phase 10 — Platform

- [ ] Plugin engine
- [ ] Tauri desktop wrapper (optional)
- [ ] Docker deployment
- [ ] Multi-user auth

---

## Current Prototype Mapping

| Spec Component | Current File |
|----------------|--------------|
| Center visualization | `app/src/components/NeuralSphere.tsx` |
| Left panel | `app/src/sections/LeftPanel.tsx` |
| Right panel / Command Deck | `app/src/sections/RightPanel.tsx` |
| Center wrapper | `app/src/sections/CenterPanel.tsx` |
| Main layout | `app/src/App.tsx` |

Next implementation task: align existing components with DESIGN.md tokens and expand Command Deck buttons to call stub API endpoints.
