---
model: claude-sonnet-4-5-20250929
description: Remove a git worktree, delete its branch, and stop its running services
argument-hint: <branch-name>
allowed-tools: Bash, Read, Glob, Grep
---

# Purpose

Remove an existing git worktree from the `trees/` directory AND delete the associated git branch. This includes stopping any running services on its ports, cleaning up processes, removing the worktree directory, and permanently deleting the branch. This ensures complete cleanup without orphaned processes or files.

## Variables

```
PROJECT_CWD: . (current working directory - the main project root)
BRANCH_NAME: $1 (required)
WORKTREE_DIR: trees/<BRANCH_NAME>
```

## Instructions

- This command safely removes a worktree and all associated resources
- Stops any running server and client processes for the worktree
- Removes the git worktree using git's built-in removal command
- Deletes the git branch associated with the worktree (PERMANENT)
- Validates that the worktree and branch were completely removed
- Provides clear feedback about what was removed and any issues encountered
- If services can't be stopped gracefully, force kills them
- Handles cases where worktree is already partially removed
- WARNING: Both worktree and branch deletion are permanent and cannot be undone

## Workflow

### 1. Parse and Validate Arguments

- Read BRANCH_NAME from $1, error if missing
- Construct WORKTREE_DIR path: `PROJECT_CWD/trees/<BRANCH_NAME>`
- Validate branch name format (no spaces, valid git branch name)

### 2. Check Worktree Existence

- List all worktrees: `git worktree list`
- Check if worktree exists at WORKTREE_DIR
- If worktree doesn't exist:
  - Check if directory exists anyway (orphaned directory)
  - If directory exists, note it for manual cleanup
  - If neither exists, error with message that worktree not found

### 3. Identify Port Configuration

- Check if WORKTREE_DIR/apps/server/.env exists
- If exists, read SERVER_PORT from the file
- Check if WORKTREE_DIR/apps/client/.env exists
- If exists, read VITE_PORT from the file
- If env files don't exist, try to infer ports from worktree count:
  - Count existing worktrees in PROJECT_CWD/trees/
  - Estimate ports based on typical offset pattern
  - Note: This is best-effort if env files are missing

### 4. Stop Running Services

- If SERVER_PORT identified, stop processes on that port:
  - Find PIDs: `lsof -ti :<SERVER_PORT>`
  - Kill processes: `kill -9 <PIDs>`
  - Verify processes stopped
- If VITE_PORT identified, stop processes on that port:
  - Find PIDs: `lsof -ti :<VITE_PORT>`
  - Kill processes: `kill -9 <PIDs>`
  - Verify processes stopped
- Check for any remaining processes in WORKTREE_DIR:
  - `ps aux | grep "trees/<BRANCH_NAME>"`
  - Kill any orphaned processes
- Wait 2 seconds for processes to fully terminate

### 5. Remove Git Worktree

- Remove worktree using git: `git worktree remove trees/<BRANCH_NAME>`
- If removal fails with error (e.g., worktree has uncommitted changes):
  - Try force removal: `git worktree remove trees/<BRANCH_NAME> --force`
  - Note the force removal in the report
- Verify worktree was removed: `git worktree list | grep trees/<BRANCH_NAME>`
- Should return nothing if successfully removed

### 6. Clean Up Orphaned Files

- Check if WORKTREE_DIR still exists after git worktree remove
- If directory still exists (shouldn't, but possible with force):
  - Note this in warnings
  - Do NOT automatically delete with rm -rf (security)
  - Provide manual cleanup instructions
- Check for any SQLite WAL files in the removed worktree location
- Check for any lingering lock files

### 7. Delete Git Branch

- After worktree is successfully removed, delete the git branch:
  - First try safe delete: `git branch -d <BRANCH_NAME>`
  - If safe delete fails (unmerged changes), use force delete: `git branch -D <BRANCH_NAME>`
  - Note in report if force delete was used
- Verify branch was deleted: `git branch --list <BRANCH_NAME>`
- Should return nothing if successfully deleted
- Important: This is destructive and permanent

### 8. Validation

- Confirm worktree no longer appears in: `git worktree list`
- Confirm directory no longer exists at WORKTREE_DIR
- Confirm branch no longer exists: `git branch --list <BRANCH_NAME>`
- Confirm no processes running on identified ports
- If any validation fails, include in warnings section

### 9. Report

Follow the Report section format below to provide comprehensive removal information.

## Report

After successful worktree removal, provide a detailed report in the following format:

```
✅ Git Worktree and Branch Removed Successfully!

📁 Worktree Details:
   Location: trees/<BRANCH_NAME>
   Branch: <BRANCH_NAME>
   Status: ❌ REMOVED

🛑 Services Stopped:
   ✓ Server on port <SERVER_PORT> (if identified)
   ✓ Client on port <VITE_PORT> (if identified)
   ✓ All orphaned processes terminated

🗑️  Cleanup:
   ✓ Git worktree removed
   ✓ Git branch deleted
   ✓ Directory removed from trees/
   ✓ No lingering processes

📝 Important Notes:
   • Both the worktree AND branch '<BRANCH_NAME>' have been deleted
   • This removal is PERMANENT and cannot be undone
   • If you need this branch again, create a new one with: /create_worktree <BRANCH_NAME>
   • The new branch will start from your current HEAD

🔍 Verification:
   ✓ Worktree not in git worktree list
   ✓ Branch not in git branch list
   ✓ Directory trees/<BRANCH_NAME> removed
   ✓ Ports <SERVER_PORT>, <VITE_PORT> are free
```

If any issues occurred during removal, include a warnings section:

```
⚠️  Warnings / Issues:
- Used --force flag to remove worktree (had uncommitted changes)
- Used -D flag to force delete branch (had unmerged changes)
- Port <PORT> could not be identified (no .env file found)
- Processes manually killed: <PID1>, <PID2>
```

If worktree was already partially removed or not found:

```
⚠️  Worktree Status:
- Worktree 'trees/<BRANCH_NAME>' was not found in git worktree list
- Directory may have been manually deleted
- Run 'git worktree prune' to clean up worktree metadata

📝 Cleanup Command:
   git worktree prune
```

If orphaned directory exists after removal:

```
⚠️  Manual Cleanup Required:
- Directory trees/<BRANCH_NAME> still exists after git worktree remove
- This should not happen normally
- To manually remove, run from PROJECT_CWD:
   rm -rf trees/<BRANCH_NAME>
- Or use the reset script with port variables:
   SERVER_PORT=<PORT> CLIENT_PORT=<PORT> ./scripts/reset-system.sh
```
