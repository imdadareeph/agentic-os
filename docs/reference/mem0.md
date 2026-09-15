# mem0 — Claude Memory (claude-mem)

> Quick reference for the local memory worker and how it integrates with Claude Code sessions.

---

## Key things you can do

- **`/learn-codebase`** — front-load ingest whole repo (~5 min), optional, speeds up early context.
- **`mem-search` skill** — query project history in natural language ("what did we decide about X").
- **Web viewer** — open [http://localhost:37701](http://localhost:37701) in browser, see live observation stream as Claude works.
- **`<private>...</private>` tags** — wrap anything you don't want captured/stored.
- **`npx claude-mem status`** — check worker health.
- **`npx claude-mem start` / `stop`** — control worker manually (needed each reboot since autostart skipped in this env).
- **`/how-it-works`** — in-session help command for details.
- **Config:** `~/.claude-mem/settings.json` — model, port, data dir, log level, context-injection behavior.

---

## Context injection

Memory injection into context starts your **second session** in a given project — the first session just builds the history.
