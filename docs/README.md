# Agentic OS — Documentation Index

> Git-tracked project specs, playbooks, and reference material.  
> **North star:** [`../goal.md`](../goal.md) · **Agent rules:** [`../CLAUDE.md`](../CLAUDE.md)

---

## Specs (authoritative)

| Document | Description |
| -------- | ----------- |
| [`specs/memory.md`](specs/memory.md) | Five-layer memory model, schemas, sync, settings |
| [`specs/MEMORY_IMPLEMENTATION_PLAN.md`](specs/MEMORY_IMPLEMENTATION_PLAN.md) | Executable M0–M4 build order |
| [`specs/MEMORY_DECISION.md`](specs/MEMORY_DECISION.md) | Memory classification and decision flow |
| [`specs/TOOLS.md`](specs/TOOLS.md) | Tool registry, loop, permissions, T0–T4 |
| [`specs/CONVERSATION_AGENTS.md`](specs/CONVERSATION_AGENTS.md) | Tool Router, Tool Agents, Permission Agent |

---

## Playbooks (`/goal` copy-paste)

| Document | Description |
| -------- | ----------- |
| [`playbooks/claude_goals.md`](playbooks/claude_goals.md) | Memory phases M0–M4 |
| [`playbooks/claude_tools_goals.md`](playbooks/claude_tools_goals.md) | Tools phases T0–T4 |
| [`playbooks/friday-goal.md`](playbooks/friday-goal.md) | Friday prototype porting patterns |

---

## Plans (feature-specific)

| Document | Description |
| -------- | ----------- |
| [`plans/fix.md`](plans/fix.md) | Voice latency / slow-response fix plan |
| [`plans/memory-view.md`](plans/memory-view.md) | Memory Galaxy View (Phase MV) |
| [`plans/MEMORY_EVOLUTION_PLAN.md`](plans/MEMORY_EVOLUTION_PLAN.md) | Prefetch (MP), Profile (MF), Persona (ME) — Mem0/VoiceMem patterns |
| [`plans/WEB_TERMINAL_ANALYSIS.md`](plans/WEB_TERMINAL_ANALYSIS.md) | Voice-opened web PTY vs ttyd/Wetty/Xterm.js; Ghost OS + aictl fit |
| [`plans/WEB_TERMINAL_EXTRACTION.md`](plans/WEB_TERMINAL_EXTRACTION.md) | File-level extract from local aictl + Ghost OS clones |
| [`plans/OBSIDIAN_VAULT_SWITCH_FIX.md`](plans/OBSIDIAN_VAULT_SWITCH_FIX.md) | Dual Obsidian REST config + `run.sh` TLS probe runbook |
| [`plans/GITNEXUS_IPV6_BIND_FIX.md`](plans/GITNEXUS_IPV6_BIND_FIX.md) | GitNexus `serve` IPv6-only bind vs `127.0.0.1` health checks |

---

## Reference

| Document | Description |
| -------- | ----------- |
| [`reference/overview.md`](reference/overview.md) | What's built vs aspirational; Python-first decision |
| [`reference/AUTHOR.md`](reference/AUTHOR.md) | Author context and collaboration preferences |
| [`reference/mem0.md`](reference/mem0.md) | Claude Memory (claude-mem) quick reference |
| [`reference/knowledge-scoring-engine.md`](reference/knowledge-scoring-engine.md) | KnowledgeForge scoring formulas |
| [`reference/memory-claude-notes.md`](reference/memory-claude-notes.md) | Notes on how JARVIS writes memory |

---

## App & local-only docs

| Document | Description |
| -------- | ----------- |
| [`../app/README.md`](../app/README.md) | Frontend setup, voice & JARVIS settings |
| [`.cursor/aidocs/docs/`](../.cursor/aidocs/docs/) | Local engineering docs (gitignored; read freely in Cursor) |
