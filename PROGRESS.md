## Obsidian MCP vault-switch fix — 2026-09-27

### Issue
`mcp__obsidian-vault__*` tools stopped connecting after switching which Obsidian vault was open. The `obsidian-vault` MCP server (`uvx mcp-obsidian`, configured in `~/.claude.json` under `mcpServers.obsidian-vault`) is pinned to a fixed `OBSIDIAN_API_KEY` + `OBSIDIAN_PORT`. Each Obsidian vault's **Local REST API** plugin instance has its own API key and port, so switching the open vault can leave the MCP config pointing at stale credentials — calls fail with 401/connection errors.

Separately, `runtime/memory/obsidian_config.py` in agentic-os keeps its own copy of `baseUrl`/`apiKey` in `~/jarvis/obsidian.json` for the app's health-check UI — a second, independent source of truth that can also drift out of sync with whichever vault is actually open.

### Fix
1. In Obsidian: Settings → Community plugins → **Local REST API** → note the API key and port (`https://127.0.0.1:27124/` by default).
2. Update `~/.claude.json` → `mcpServers.obsidian-vault.env.OBSIDIAN_API_KEY` / `OBSIDIAN_PORT` to match.
3. Update `~/jarvis/obsidian.json` (`obsidian_config.save(base_url, api_key)`) to match the same vault.
4. Restart Claude Code — the `obsidian-vault` MCP server is `stdio`, so env vars are only read at process spawn; no hot reload.

### Verified
Confirmed via screenshot that the currently open vault's Local REST API key (`82d658b7d0...`) and port (`27124`, HTTPS) already matched `~/.claude.json`. Called `mcp__obsidian-vault__obsidian_list_files_in_vault` — returned the vault listing successfully, confirming the connection is healthy on this session.
