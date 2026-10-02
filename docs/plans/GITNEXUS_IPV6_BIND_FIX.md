# GitNexus daemon — IPv6-only bind fix

## Issue

`gitnexus serve` (port 4747) showed `offline` in agentic-os's `run.sh` dashboard even while its own terminal log said `GitNexus server running on http://localhost:4747`.

`run.sh` health-checks `GITNEXUS_URL="http://127.0.0.1:4747"`. `curl http://127.0.0.1:4747` → connection refused. `curl http://localhost:4747` → 200 OK. `lsof -i :4747` showed the listener as IPv6 only (`TCP localhost:4747 (LISTEN)`, no IPv4 entry).

## Root cause

`gitnexus/src/cli/serve.ts`:

```ts
// Default to 'localhost' so the OS decides whether to bind to 127.0.0.1 or
// ::1 based on system configuration, ...
const host = options?.host ?? 'localhost';
...
await createServer(port, host);   // → app.listen(port, 'localhost', ...)
```

Node's `server.listen(port, hostname)` does **not** dual-bind for a hostname string — it resolves `'localhost'` to one address and binds only that socket. On this machine the resolver returned `::1` first, so the server was IPv6-only. Any `127.0.0.1` client (agentic-os's `run.sh`, plain `curl -4`) got refused, despite `localhost` itself resolving fine in a browser.

The CLI's own `--host` flag documents its default as `127.0.0.1` (`src/cli/index.ts:93`), and `createServer()`'s default param is `'127.0.0.1'` — `serveCommand` was the one place silently overriding that to `'localhost'`.

## Fix

Default `host` to `'127.0.0.1'` in `serveCommand`, matching the rest of the codebase:

```diff
-  // Default to 'localhost' so the OS decides whether to bind to 127.0.0.1 or
-  // ::1 based on system configuration, avoiding spurious CORS errors when the
-  // hosted frontend at gitnexus.vercel.app connects to localhost.
-  const host = options?.host ?? 'localhost';
+  // Node's listen() binds a single resolved address for a hostname string —
+  // 'localhost' is not dual-stack, it picks whichever of ::1/127.0.0.1 the
+  // resolver returns first. Default to 127.0.0.1 (matches --host's own
+  // documented default) so 127.0.0.1 clients (health checks, curl) work.
+  const host = options?.host ?? '127.0.0.1';
```

Applied in two places:
- `~/Desktop/ai-projects/GitNexus/gitnexus/src/cli/serve.ts` (source — repo has no `node_modules` installed, so this only takes effect once rebuilt/reinstalled)
- `~/.nvm/versions/node/v22.22.3/lib/node_modules/gitnexus/dist/cli/serve.js` (the actual running global install — patched directly so the fix is live now)

## Verified

Killed the stale IPv6-only instance, restarted `gitnexus serve`:

```
GitNexus server running on http://127.0.0.1:4747
```

```
curl 127.0.0.1:4747 → 200
curl localhost:4747 → 200
```

`run.sh`'s dashboard now reports `GitNexus daemon … online`.

## Outstanding

Global npm package (`gitnexus@1.6.8`) is patched in place. Next real publish of the `gitnexus` package must carry this fix forward — the source-tree edit alone won't survive a `npm i -g gitnexus` reinstall until published.
