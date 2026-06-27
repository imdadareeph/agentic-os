# Vault Concept — Understanding from Chase AI

Source: [The Agentic OS Setup That Will 10x Claude Code](https://www.youtube.com/watch?v=HRw-vP0j8OM) (Chase AI, ~31 min)  
Status: Synthesis document — adapted for **local models (Ollama)**  
Related: `ARCHITECTURE.md`, `PRD.md`, `ROADMAP.md`

---

## Agentic OS Adaptation (Local Models)

This project does **not** use Claude Code as the execution engine. The vault concepts from the video still apply; only the **runtime layer** differs.

| Video (Claude Code) | Agentic OS (local) |
|---------------------|-------------------|
| `cd vault && claude` | Rust backend watches vault; frontend/API calls **Ollama** |
| `CLAUDE.md` auto-loaded | **`agents.md`** (or equivalent) injected into system prompt |
| Built-in Read / Grep / Glob tools | Backend file APIs + Tantivy keyword + Qdrant semantic search |
| Headless `claude -p` from UI buttons | Command Deck → API → **Ollama + vault execution bridge** (Phase 7) |
| API token billing | **No per-token cost** — context window limits matter instead |
| `.claudeignore` | Ignore patterns for attachments, `.obsidian/`, templates when building context |

**What stays identical:** vault = folder of Markdown; Karpathy-style layout; `index.md` navigation maps; skills/automations/loops; Mission Control as Level 3 wrapper; 90% of value in Levels 1–2.

Current voice path (`app/src/services/jarvis.ts`): Ollama primary → Voicebox LLM fallback. Vault context injection is on the roadmap (`ROADMAP.md` Phase 7a).

---

## Summary

In Chase AI's Agentic OS framework, the **vault is not a product feature or a visual layer**. It is the **memory and state backbone** (Level 2) — a folder of Markdown files the agent reads, writes, and navigates. The fancy Mission Control UI (Level 3) is optional chrome; **~90% of the value lives in skills + vault structure** (Levels 1–2).

> "When we're talking about a vault, again, it's literally just a folder."

The video uses Claude Code as the agent/story. For Agentic OS, substitute **Ollama (local LLM) + Rust backend** everywhere the video says "Claude."

---

## What the Vault Is

| Property | Definition |
|----------|------------|
| Physical form | A normal folder on disk — Obsidian's term for "a place where notes live" |
| Creation | Create a new folder, or designate an existing folder as the vault in Obsidian |
| Connection (video) | `cd` into vault, run `claude` |
| Connection (Agentic OS) | Configure vault path → backend watches filesystem → agents/skills read/write via API |
| Role | Personal assistant filing cabinet + execution log + second brain |

Obsidian is optional. A well-organized plain file tree (or database) achieves the same result.

---

## Why the Vault Matters (Level 2)

| Level | Focus | Vault role |
|-------|-------|------------|
| 1 | Skills, automations, loop engineering | Skills produce outputs that must land somewhere |
| **2** | **Memory & state control** | **Vault is the canonical store the agent draws from** |
| 3 | Custom UI (Mission Control) | Visual wrapper over vault + skills |
| 4 | Distribution to team/clients | Share the packaged system; outputs sync back to vault |

Level 2 answers: *When I ask the agent about something buried in thousands of files, can it find the answer quickly and accurately?*

### Local-model nuance

The video emphasizes **API token cost** when the agent scans irrelevant files. With Ollama there is no cloud bill, but the constraint shifts:

- **Smaller context windows** — local models often fit less text per call than Claude Max
- **Slower inference** — reading 10,000 files worth of context is impractical locally too
- **Navigation matters more, not less** — `index.md` maps and `wiki/` vs `raw/` separation are critical

Without structure, the agent brute-forces search. With structure, it follows a **map**.

---

## Mental Model: The Vault as a Map

```
Human asks a question (voice, Command Deck, or chat)
        ↓
Backend / agent enters vault
        ↓
Reads agents.md + index.md at root → learns layout + rules
        ↓
Routes to correct subfolder (e.g. wiki/)
        ↓
Reads index.md in subfolder → finds specific document
        ↓
Ollama generates answer from targeted context (not whole vault)
```

Obsidian's graph view illustrates this: nodes are files, edges are links. The ideal vault gives the agent the same clarity a human would get from a well-labeled filing cabinet.

**Key insight:** The power is not the specific folder names — it is the **index files and navigation pattern** at every level.

---

## Recommended Structure (Karpathy Pattern)

Andrej Karpathy's widely shared Obsidian + LLM setup — three pipeline stages:

```
vault/
├── raw/          ← Unstructured captures (articles, research dumps, imports)
├── wiki/         ← Structured knowledge (Wikipedia-style synthesis from raw)
├── outputs/      ← Deliverables (slide decks, reports, artifacts)
├── runs/         ← Execution logs (loop engineering)
├── skills/       ← Skill definitions (Markdown + frontmatter)
├── agents/       ← Agent configs and prompts
├── index.md      ← Root navigation map
└── agents.md     ← Persistent instructions (vault conventions, navigation rules)
```

### Data flow example

1. Research on "AI agents" lands in `raw/` (messy, multi-source).
2. A skill (Ollama + skill prompt) distills it into `wiki/ai-agents.md`.
3. Another skill turns that into a report saved to `outputs/`.

This mirrors Agentic OS PRD conventions.

### What is actually mandatory

| Required | Optional / inspirational |
|----------|--------------------------|
| `index.md` at each meaningful folder level | Exact `raw/` / `wiki/` / `outputs/` names |
| Root instructions file (`agents.md`) | Karpathy's three-folder split |
| Coherent hierarchy + navigation rules | Obsidian itself |
| Logical place for run logs (`runs/`) | Graph plugins |

> "You don't have to do raw. You don't have to do outputs… You just need a map that makes sense."

---

## index.md — The Highest-Leverage File

An `index.md` is a Markdown table of contents for a folder. At each level it tells the agent:

- What lives in this folder
- What the subfolders are for
- Which file to open for a given topic

**Mall-directory metaphor (from Gemini narration):** Without an index, the agent wanders. With one, it gets instant spatial awareness — "you are here" → direct path to the right file.

**Why it matters at scale:** With hundreds or thousands of documents, indexes are the difference between a 3-hop lookup and stuffing the entire vault into a local model's context window.

---

## agents.md — Vault Conventions for the Local Agent

The video calls this `CLAUDE.md`. For Agentic OS, use **`agents.md`** at the vault root (or inject equivalent content via the backend system prompt).

Document:

- **Vault structure** — what each top-level folder contains
- **Navigation pattern** — path to follow when searching (e.g. "for topic summaries → wiki first")
- **Formatting rules** — how outputs should be written back
- Behavioral rules aligned with skills and automations

This is instructions for the agent, not documentation for humans. Write it like onboarding a new assistant.

The JARVIS voice layer currently uses a fixed system prompt (`app/src/config/services.ts`). Long-term, vault-aware context should merge `agents.md` + relevant `index.md` chains into that prompt (roadmap: Obsidian vault path + context injection).

---

## Tie-In: Skills, Automations, and Loop Engineering

The vault is not read-only memory. It is the **write target** for the whole Agentic OS loop:

```
Level 1: Skill executes (Ollama + skill markdown from vault/skills/)
              ↓
Level 2: Output saved to vault (structured path)
              ↓
         Run logged to runs/ + optional lessons-learned notes
              ↓
Future run reads past runs → self-improves
```

### Loop engineering (from Gemini narration)

1. Skill runs → produces output (e.g. draft report).
2. Evaluator skill checks output against a rubric.
3. On failure, write **Lessons Learned** to a persistent file in the vault.
4. Next run's first step: read lessons learned → avoid repeating mistakes.

Skills only become self-improving when outputs and run history land in predictable vault locations.

---

## Connection to Agentic OS (This Project)

| Video concept | Agentic OS implementation |
|---------------|---------------------------|
| Vault = folder + agent inside it | Layer 1 Knowledge Base in `ARCHITECTURE.md` |
| Karpathy raw / wiki / outputs | PRD vault folder conventions |
| index.md navigation map | `index.md` per folder in PRD |
| CLAUDE.md → agents.md | Root instructions injected into Ollama system prompt |
| Run logs for loops | `runs/` folder + loop engine |
| Obsidian graph as mental model | Living Knowledge Universe (`KNOWLEDGE_SPHERE.md`) |
| Command Deck → headless agent | Right panel → API → Ollama vault bridge (Phase 7–8) |
| JARVIS voice | Ollama + Voicebox TTS (`jarvis.ts`) — vault context TBD |
| 90% value in Levels 1–2 | Roadmap prioritizes vault bridge before UI polish |

The Living Knowledge Universe is Level 3 — visual expression of vault/graph relationships. It reflects real vault data; it does not replace the vault as source of truth.

---

## Practical Setup Checklist (adapted for local)

1. Choose or create a folder — that is your vault.
2. Define folder structure (Karpathy pattern or custom — ask Ollama to propose one if needed).
3. Add `index.md` at root and in each major subfolder.
4. Add `agents.md` with structure + navigation rules.
5. Copy or symlink domain data into the vault.
6. Point Agentic OS at the vault path (backend watch + context injection — Phase 7a/8).
7. Define skills as Markdown in `vault/skills/`; backend loads prompt + calls Ollama.
8. Log runs to `runs/`; add lessons-learned files for loop engineering.
9. Wire Command Deck buttons to API → Ollama skill execution (Phase 8).
10. Mission Control UI (Level 3) once Levels 1–2 are solid.

---

## What the Author Warns Against

- **Chasing the dashboard first** — visual Agentic OS setups are "smoke and mirrors" without skills + vault underneath.
- **Flat file dumps** — one folder with millions of unlinked files defeats the purpose (worse with small local context windows).
- **Treating folder names as gospel** — structure must fit *your* domains; Karpathy is inspiration, not law.
- **Assuming Obsidian is the product** — Obsidian is the store; Ollama + backend is the engine; Mission Control is optional chrome.

---

## Open Questions for Agentic OS Implementation

- Vault mount path configuration (`ROADMAP.md`: Obsidian vault path + context injection).
- How much of `agents.md` + `index.md` chain to inject per Ollama call vs rely on Tantivy/Qdrant retrieval.
- Ignore patterns for `.obsidian/`, attachments, templates when building context.
- Sync conflicts when vault is git-synced or Obsidian Sync–enabled while the backend writes.
- Command Deck skill execution: single Ollama call vs multi-step agent loop with file tools.
- Model selection per skill (fast local model for triage, larger model for synthesis).

---

## Key Quotes (source video — engine-agnostic)

> "Think of Obsidian as essentially your filing cabinet for everything."

> "The real beauty is that at every level of this, we have an index.md file… The power comes from that, not necessarily the somewhat arbitrary folders we created."

> "If you master those two levels [skills + memory/state], you have 90% of the power of an AIOS already at your fingertips."

> "Truthfully… if you just set up [your agent] with a file structure that is coherent and makes sense, you're like 99% of the way there."
