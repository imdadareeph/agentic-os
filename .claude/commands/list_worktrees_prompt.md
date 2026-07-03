---
model: claude-sonnet-4-5-20250929
description: List all git worktrees with their configuration and status
allowed-tools: Bash, Read, Glob, Grep
---

# Purpose

List all git worktrees in the `trees/` directory with comprehensive information including branch names, directories, environment variables, port configuration, and service status.

## Variables

```
PROJECT_CWD: . (current working directory - the main project root)
WORKTREE_BASE_DIR: trees/
```

## Instructions

- List all worktrees managed by git
- For each worktree in trees/, gather configuration details
- Read environment files to extract port configuration
- Check if services are running on configured ports
- Display comprehensive information in a clear, organized format
- Show which worktrees are active vs stopped
- Provide quick action commands for each worktree

## Workflow

### 1. List Git Worktrees

- Run: `git worktree list`
- Parse output to identify all worktrees
- Filter for worktrees in PROJECT_CWD/trees/ directory
- Extract:
  - Worktree path
  - Branch name
  - Commit hash (if available)

### 2. Gather Configuration for Each Worktree

For each worktree found in trees/:

**Extract Branch/Directory Info:**
- Worktree directory: `trees/<branch-name>`
- Branch name from git worktree list
- Working directory path

**Read Server Configuration:**
- Check if `<worktree>/apps/server/.env` exists
- If exists, read and extract:
  - `SERVER_PORT`
  - `DB_PATH`
- If doesn't exist, note as "Not configured"

**Read Client Configuration:**
- Check if `<worktree>/apps/client/.env` exists
- If exists, read and extract:
  - `VITE_PORT`
  - `VITE_API_URL`
  - `VITE_WS_URL`
  - `VITE_MAX_EVENTS_TO_DISPLAY`
- If doesn't exist, note as "Not configured"

**Read Root Configuration:**
- Check if `<worktree>/.env` exists
- Note presence/absence (contains API keys, don't display values)

### 3. Check Service Status

For each worktree with port configuration:

**Check Server Status:**
- If SERVER_PORT identified, check: `lsof -i :<SERVER_PORT>`
- Determine if process is running
- Extract PID if running

**Check Client Status:**
- If VITE_PORT identified, check: `lsof -i :<VITE_PORT>`
- Determine if process is running
- Extract PID if running

### 4. Check Dependencies

For each worktree:
- Check if `<worktree>/apps/server/node_modules` exists
- Check if `<worktree>/apps/client/node_modules` exists
- Note if dependencies are installed or missing

### 5. Calculate Statistics

- Total number of worktrees
- Number with services running
- Number with services stopped
- Total ports in use
- Available port offsets (suggest next available)

### 6. Report

Follow the Report section format below.

## Report

After gathering all information, provide a comprehensive report in the following format:

```
📊 Git Worktrees Overview

═══════════════════════════════════════════════════════════════

📈 Summary:
   Total Worktrees: <count>
   Running: <count> | Stopped: <count>
   Next Available Port Offset: <offset>

═══════════════════════════════════════════════════════════════

🌳 Main Repository (Default)
   📁 Location: <project-root>
   🌿 Branch: <current-branch>
   🔌 Ports: 4000 (server), 5173 (client)
   🎯 Status: <RUNNING|STOPPED>

   Actions:
   └─ Start: ./scripts/start-system.sh
   └─ Stop: ./scripts/reset-system.sh

───────────────────────────────────────────────────────────────

🌳 Worktree: <branch-name>
   📁 Location: trees/<branch-name>
   🌿 Branch: <branch-name>
   📝 Commit: <commit-hash-short>

   ⚙️  Configuration:
   ├─ Server Port: <SERVER_PORT>
   ├─ Client Port: <VITE_PORT>
   ├─ Database: <DB_PATH>
   ├─ API URL: <VITE_API_URL>
   └─ WebSocket: <VITE_WS_URL>

   📦 Dependencies:
   ├─ Server: <✓ Installed | ❌ Missing>
   └─ Client: <✓ Installed | ❌ Missing>

   🎯 Service Status:
   ├─ Server: <🟢 RUNNING (PID: xxxx) | 🔴 STOPPED>
   └─ Client: <🟢 RUNNING (PID: xxxx) | 🔴 STOPPED>

   🌐 Access URLs (if running):
   ├─ Dashboard: http://localhost:<VITE_PORT>
   ├─ Server API: http://localhost:<SERVER_PORT>
   └─ WebSocket: ws://localhost:<SERVER_PORT>/stream

   Actions:
   ├─ Start: cd trees/<branch-name> && SERVER_PORT=<port> CLIENT_PORT=<port> sh scripts/start-system.sh
   ├─ Stop: SERVER_PORT=<port> CLIENT_PORT=<port> ./scripts/reset-system.sh
   └─ Remove: /remove_worktree <branch-name>

───────────────────────────────────────────────────────────────

[Repeat for each worktree]

═══════════════════════════════════════════════════════════════

💡 Quick Commands:

Create new worktree:
└─ /create_worktree <branch-name> [port-offset]

Remove worktree:
└─ /remove_worktree <branch-name>

Start a stopped worktree:
└─ cd trees/<branch-name> && SERVER_PORT=<port> CLIENT_PORT=<port> sh scripts/start-system.sh &

Stop a running worktree:
└─ lsof -ti :<SERVER_PORT> | xargs kill -9 && lsof -ti :<CLIENT_PORT> | xargs kill -9

View this list again:
└─ /list_worktrees

═══════════════════════════════════════════════════════════════
```

If no worktrees exist in trees/:

```
📊 Git Worktrees Overview

═══════════════════════════════════════════════════════════════

🌳 Main Repository (Default)
   📁 Location: <project-root>
   🌿 Branch: <current-branch>
   🔌 Ports: 4000 (server), 5173 (client)
   🎯 Status: <RUNNING|STOPPED>

═══════════════════════════════════════════════════════════════

ℹ️  No worktrees found in trees/ directory

💡 Create your first worktree:
   /create_worktree <branch-name>

   This will:
   • Create isolated git worktree
   • Configure unique ports (4010, 5183)
   • Install dependencies
   • Start services automatically

═══════════════════════════════════════════════════════════════
```

If worktrees have configuration issues:

```
⚠️  Configuration Warnings:

• trees/<branch-name>: Missing .env files
  └─ Fix: Recreate with /create_worktree <branch-name>

• trees/<branch-name>: Dependencies not installed
  └─ Fix: cd trees/<branch-name>/apps/server && bun install
  └─ Fix: cd trees/<branch-name>/apps/client && bun install

• trees/<branch-name>: Services running but ports mismatch
  └─ Fix: Stop services and update .env files
```

## Notes

- Main repository is always shown first (uses default ports)
- Worktrees are sorted alphabetically by branch name
- Service status is checked in real-time
- Port conflicts are detected and highlighted
- Orphaned worktrees (in git but not in trees/) are noted
- PIDs are shown for running processes for easy termination
- All commands are copy-paste ready
