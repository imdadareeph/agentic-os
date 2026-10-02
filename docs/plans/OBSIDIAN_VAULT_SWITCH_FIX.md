# Obsidian vault switch — issue, migration, fix

## The actual issue

agentic-os talks to Obsidian's Local REST API plugin through **two independent configs**, each caching its own `apiKey`/`baseUrl`:

1. `~/.claude.json` → `mcpServers.obsidian-vault.env` — used by the `mcp__obsidian-vault__*` MCP tools (stdio server, `uvx mcp-obsidian`).
2. `~/jarvis/obsidian.json` → read by `runtime/memory/obsidian_config.py` — used by the agentic-os app's own health-check UI (`MemorySettingsSheet.tsx`).

Each Obsidian **vault** runs its own copy of the Local REST API plugin with its own API key and port. There is no single source of truth — switching which vault Obsidian has open does not propagate to either config automatically.

## Changing to the new vault

Runtime memory lives in the canonical vault at `~/jarvis/vault/` (per `docs/specs/memory.md`). Read the active key and port from that vault's plugin data:

`~/jarvis/vault/.obsidian/plugins/obsidian-local-rest-api/data.json` → `apiKey`, `port` (HTTPS).

Update **both** consumers with those values:

- MCP: `~/.claude.json` → `mcpServers.obsidian-vault.env` (`OBSIDIAN_API_KEY`, `OBSIDIAN_HOST` / base URL as required by your MCP server).
- App health check: `~/jarvis/obsidian.json` with `baseUrl` (e.g. `https://127.0.0.1:<port>`) and `apiKey`.

If MCP works but Memory settings show disconnected, `~/jarvis/obsidian.json` is usually still pointing at a **previous vault's** key.

## Fix

Sync `~/jarvis/obsidian.json` to match the vault plugin (never commit real keys):

```bash
# Example — substitute values from data.json on your machine
cat > ~/jarvis/obsidian.json <<'EOF'
{
  "baseUrl": "https://127.0.0.1:PORT",
  "apiKey": "YOUR_LOCAL_REST_API_KEY"
}
EOF
chmod 600 ~/jarvis/obsidian.json
```

(Equivalent to calling `obsidian_config.save(base_url, api_key)` from the running app.)

No MCP restart needed for this half — `runtime/main.py` reads the file per request (not cached at import).

## Second bug found via run.sh dashboard

`run.sh`'s status dashboard showed `Obsidian REST … offline` even when auth was correct. Root cause: `probe()` used `curl -sf` without `-k` — Obsidian's Local REST API uses a self-signed cert, so TLS verification failed (exit 60). Fixed on `main`:

```diff
-  curl -sf --max-time "${2:-3}" "$1" >/dev/null 2>&1
+  curl -skf --max-time "${2:-3}" "$1" >/dev/null 2>&1
```

## Takeaway

Any vault switch must update **both** configs — `~/.claude.json` (MCP) and `~/jarvis/obsidian.json` (app) — from the **same** vault's Local REST API plugin. Nothing in-repo keeps them in sync automatically.
