# Memory Galaxy View — Phase MV

> Navigation panel below System Vitals + full-page 3D vault graph.
>
> **Visual reference:** [`.cursor/aidocs/memory view.png`](.cursor/aidocs/memory%20view.png)
>
> **Session rules:** [`../../CLAUDE.md`](../../CLAUDE.md) — autonomy, secrets, minimal diff, voice latency sacred.
>
> **Related specs:** [`../../goal.md`](../../goal.md) (on-disk layout), [`../specs/memory.md`](../specs/memory.md) (vault + Chroma), [`../specs/MEMORY_DECISION.md`](../specs/MEMORY_DECISION.md) (background jobs).

---

## Objective

Below **System Vitals** in the left panel, add a **Mission Links** strip with navigable pages. The first live page is **Memory Galaxy** — a 3D star-field visualization of the Obsidian vault (`~/jarvis/vault`): notes/chunks as floating nodes, wikilinks as faint edges, recency as brightness (“brighter & whiter = more recently touched”).

Voice Mission Control (`/`) stays unchanged. Graph data loads only on `/memory` — never during conversation.

---

## Part A — Left panel navigation

**File:** `app/src/sections/LeftPanel.tsx`

- Insert **Mission Links** directly **below** the System Vitals block (~lines 93–145), above `ActivitySection` / `QuickSettingsSection`.
- Title: `Mission Links` (same `text-label` style as System Vitals).
- Links array (extensible config, not one-off buttons):

| Label | Route | Status |
|-------|-------|--------|
| Memory Galaxy | `/memory` | **Ship in MV** |
| Agents | `/agents` | Soon (disabled) |
| Tools | `/tools` | Soon (disabled) |
| Vault Browser | `/vault` | Soon (disabled) |

- Typography: match existing panel (9–11px, `text-white/50`, `border-wire-hover` on hover).

---

## Part B — Routing

**Files:** `app/src/main.tsx`, `app/src/App.tsx`

- `BrowserRouter` already mounted — add `Routes`:
  - `/` → existing three-panel Mission Control (unchanged)
  - `/memory` → `MemoryGalaxyPage`
- Memory page chrome: `← Mission Control` back link top-left; full viewport; may hide side panels.

---

## Part C — Runtime graph API

**Files:** `runtime/main.py` + new `runtime/memory/graph.py`

### `GET /api/memory/graph`

Query params: `granularity=note|chunk` (default `note`), `maxNodes` (default 500), `maxLinks` (default 2000).

```json
{
  "stats": { "nodes": 0, "links": 0, "notes": 0, "chunks": 0 },
  "truncated": false,
  "nodes": [
    {
      "id": "learnings/docker.md",
      "label": "Docker",
      "path": "learnings/docker.md",
      "kind": "note",
      "folder": "learnings",
      "chunkIndex": null,
      "touchedAt": "2026-07-04T12:00:00Z",
      "linkDegree": 4
    }
  ],
  "links": [
    { "source": "learnings/docker.md", "target": "projects/agents.md", "kind": "wikilink" }
  ]
}
```

**Nodes:**

- Walk `~/jarvis/vault` dirs: `agents/`, `learnings/`, `projects/`, `wiki/` (`*.md`).
- Default: one node per file. `granularity=chunk`: one node per Chroma chunk (`sync_files.chunk_count`).
- `touchedAt`: `sync_files.embedded_at` → fallback file mtime.

**Links:**

- Parse Obsidian `[[wikilinks]]` from markdown bodies.
- Optional weak same-folder edges (lower opacity in UI).

**Limits:** Cap nodes/links; set `truncated: true` when capped. Empty vault → empty arrays, not 500.

**Frontend:** `app/src/services/memory.ts` → `fetchMemoryGraph()` — graceful degradation like other memory calls.

---

## Part D — Memory Galaxy page

**File:** `app/src/pages/MemoryGalaxyPage.tsx` (or `app/src/sections/MemoryGalaxyView.tsx`)

Match reference mockup (`.cursor/aidocs/memory view.png`):

| UI element | Behavior |
|------------|----------|
| Header | “Memory — Obsidian Vault” + live stats (`{chunks} chunks · {notes} notes`) |
| Tabs | Recent 12 \| Notes \| **Graph** \| Galaxy — Graph active; others stub “Soon” for MV |
| Viewport | 3D galaxy via `@react-three/fiber` + `@react-three/drei` + Bloom |
| Nodes | Glowing spheres; size ∝ `linkDegree`; brightness ∝ recency |
| Links | Faint instanced lines between related nodes |
| Hint | “drag to orbit · scroll to zoom · click a star · double-click to pause flight” |
| Click | Show path + title; optional “Open in Obsidian” (display path only — no REST in MV) |
| Flight | Slow auto-orbit; double-click pauses |
| Empty | Runtime offline or empty vault → message + back link |

**Visual language:** Reuse `NeuralSphere.tsx` palette (`#050505` bg, `#E5A93D` amber, Bloom) — this is a **graph**, not the voice sphere.

**Performance:** 60fps target ~400 nodes; degrade labels/links above 500.

---

## Part E — Docs

- Add **Phase MV** section to `goal.md` with exit criteria below.
- Optional: `.cursor/aidocs/docs/MEMORY_GALAXY.md` (API + interaction spec).

---

## Do NOT

- Fetch graph during voice conversation (on-demand at `/memory` only).
- Read `.env`, `.cursor/aidocs/do-not-commit/`, or `*-key.md` files.
- Add Neo4j/Qdrant — vault walk + Chroma/sync_files only.
- Implement Obsidian REST API in MV (path display is enough).

---

## Exit criteria

1. **Mission Links** appears below System Vitals; “Memory Galaxy” navigates to `/memory`; `/` Mission Control unchanged.
2. `curl http://127.0.0.1:8000/api/memory/graph` returns nodes + links when vault has markdown with wikilinks.
3. Galaxy renders floating nodes + link lines; recently synced files brighter than stale.
4. Orbit, zoom, click work in Chrome; offline runtime + empty vault show graceful UI.
5. `npm run runtime:test` passes; app typecheck clean; zero `/api/memory/graph` calls during voice session.

---

## How to test

```bash
./run.sh
# Open http://localhost:3000 → left panel → Memory Galaxy
curl -s http://127.0.0.1:8000/api/memory/graph | head -c 500
```

---

## `/goal` command

```
/goal Build Phase MV (Memory Galaxy View) per docs/plans/memory-view.md. Read docs/plans/memory-view.md end-to-end first, then CLAUDE.md session rules. Visual reference: .cursor/aidocs/memory view.png. Implement every section (Parts A–E) and keep working until ALL exit criteria in docs/plans/memory-view.md pass — verify with curl, browser, and runtime tests before claiming done. One phase only (MV); do not start MV.2 or unrelated work.
```

Session preamble (optional):

```
/config permissionMode=acceptEdits
/effort high
```

---

## MV.2 — Vault markdown preview (shipped)

- **Preview on click:** selecting a graph star loads `GET /api/memory/vault/note?path=…` and renders markdown in a side panel (`VaultNotePanel`).
- **Open in Obsidian:** footer link via `obsidian://open?vault=jarvis&file=…` (vault name assumes default `~/jarvis/vault` layout).
- **Wikilink chips:** outbound links shown as clickable chips; resolved targets re-select the graph node.

### Still deferred (MV.3+)

- Recent 12 / Notes tab implementations
- Obsidian Local REST for content reads
- Live graph updates via WebSocket
- Chunk-level granularity toggle in UI
- Inline `[[wikilink]]` rendering inside markdown body (chips only in MV.2)
