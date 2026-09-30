# Feature Specification: Voice Web Terminal

**Feature Branch**: `001-voice-web-terminal`

**Created**: 2026-09-15

**Status**: Draft

**Input**: User description: "Baseline spec from prior analysis: P0 harden the existing spoken command runner (split pipes/and, block substitution, scrub secrets from the command environment, block sensitive paths, stop hung commands). Then P1 voice 'open a terminal' — live in-HUD terminal bound to the JARVIS session, spoken ack within 3 seconds then attach in the background. Out of scope: Ghost MCP, ttyd sidecar, Wetty."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Safer spoken commands (Priority: P1)

The operator already talks to JARVIS to run a one-shot command (“run git status”). That path MUST keep working, and it MUST refuse dangerous work even when the danger is hidden behind a pipe, “and”, a prefix like “env”, or a substitution. Hung commands MUST stop. Secret-like environment values MUST NOT ride along into the command. Sensitive locations (credential folders, system password files) MUST stay unreachable through this path. JARVIS still acknowledges within the voice ceiling; the command itself MAY finish later.

**Why this priority**: This is the voice path that already exists. Hardening it delivers safety without a new surface and makes the live terminal (Story 2) less dangerous to add.

**Independent Test**: With the terminal category enabled, speak a safe command and a chained dangerous command. Safe command is approved (or allowed) and returns output. Dangerous command is refused without executing. A command that hangs is stopped and the operator is told it timed out. First spoken reply still starts within 3 seconds.

**Acceptance Scenarios**:

1. **Given** the terminal category is on and posture is not “cautious-only”, **When** the operator says “run git status”, **Then** JARVIS speaks an ack or result start within 3 seconds, the Permission Agent still applies, and a successful run reports status text (or a short spoken summary).
2. **Given** a spoken command that chains a listing with a destructive remove, **When** JARVIS evaluates it, **Then** the command is refused, nothing destructive runs, and the operator is told it was blocked.
3. **Given** a spoken command that uses substitution or process substitution to hide another command, **When** JARVIS evaluates it, **Then** it is refused.
4. **Given** a spoken command that would read or write credential or system-password locations, **When** JARVIS evaluates it, **Then** it is refused.
5. **Given** a spoken command that does not finish within the existing time limit, **When** the limit is reached, **Then** the command is stopped (no leftover runaway process) and the operator is informed of the timeout.
6. **Given** conversation mode is active, **When** a mutating command needs approval, **Then** JARVIS does not wait in silence: it speaks first, then the existing approve/deny flow runs.

---

### User Story 2 - Open a live terminal by voice (Priority: P2)

The operator says “Jarvis, open a terminal.” Mission Control shows a real interactive terminal in the HUD (not a dump of last command output). Opening is slow work: JARVIS MUST speak an acknowledgment within 3 seconds, then attach the live session in the background. The live terminal is bound to the current JARVIS conversation session, listens only on the local machine, and stays off until the operator enables the terminal category. Opening requires approval unless the session is already elevated.

**Why this priority**: This is the requested product. It depends on Story 1 remaining the default for “run this command,” so one-shot and live session stay distinct.

**Independent Test**: Enable the terminal category, say “open a terminal,” confirm approval, hear an ack within 3 seconds, then see a live terminal in Mission Control where typing produces a real shell prompt. Starting a new JARVIS session hides and destroys that terminal.

**Acceptance Scenarios**:

1. **Given** the terminal category is off, **When** the operator asks to open a terminal, **Then** JARVIS does not spawn a live session and explains that the category is disabled.
2. **Given** the terminal category is on, **When** the operator says “open a terminal”, **Then** JARVIS speaks an ack within 3 seconds (“Opening a terminal.” or equivalent) before the panel is guaranteed to be ready.
3. **Given** approval is required, **When** the operator denies, **Then** no live terminal appears.
4. **Given** approval is granted, **When** the session attaches, **Then** Mission Control shows one live terminal for this JARVIS session where the operator can type and see a real prompt, colors, and cursor.
5. **Given** a live terminal is open, **When** the operator starts a NEW SESSION (or the conversation session ends), **Then** the live terminal is destroyed and the panel hides. No orphan shell remains.
6. **Given** a live terminal is requested, **When** it is offered on the network, **Then** it is reachable only from the local machine (not the wider network).

---

### User Story 3 - Drive and close the live session by voice (Priority: P3)

After a live terminal is open, the operator can speak further commands into it (“run docker ps”) or say “close the terminal.” If no live session is open, “run …” uses the one-shot command runner from Story 1. JARVIS MUST NOT read the raw terminal stream aloud; it speaks a one-line summary or tells the operator to watch the panel. While JARVIS is injecting text, the HUD MUST show that JARVIS is typing so the operator and JARVIS do not silently collide.

**Why this priority**: Completes voice control of the live session. Story 2 is already a demoable MVP without this, but the original request was voice-controlled.

**Independent Test**: Open a live terminal, speak a command, see it appear and run in the panel, hear a short summary (not the raw dump). Speak “close the terminal” and the panel goes away.

**Acceptance Scenarios**:

1. **Given** a live terminal is open, **When** the operator says “run docker ps”, **Then** the text is sent into that live session (not as a disconnected one-shot) after any required approval, and JARVIS does not speak the full output.
2. **Given** no live terminal is open, **When** the operator says “run docker ps”, **Then** Story 1 one-shot behavior applies.
3. **Given** a live terminal is open, **When** the operator says “close the terminal”, **Then** the session is destroyed, the panel hides, and JARVIS confirms.
4. **Given** JARVIS is injecting into the live terminal, **When** the operator looks at the HUD, **Then** a “JARVIS typing” (or equivalent) state is visible; operator keystrokes MUST NOT be silently mixed with JARVIS input during that injection.

---

### Edge Cases

- Terminal category off: all live-session and (if gated by category) one-shot terminal tools refuse with a spoken explanation.
- Cautious posture: only the existing read-only allowlist runs as one-shot; live-session open remains ask/deny (MUST NOT silently become a full shell).
- Two writers: operator typing vs JARVIS injecting — lock or queue operator input while JARVIS writes (Story 3).
- Spoken shell syntax: speech-to-text MUST NOT be dumped raw into a live terminal when it could be a destructive phrase; the model-proposed command text is what is sent after permission checks.
- Idle live terminal: unused session auto-closes after a bounded idle period so a forgotten shell does not sit open.
- Resize of the Mission Control panel: the live terminal remains usable (prompt/layout follows the panel).
- Runtime or attach failure after ack: JARVIS speaks a failure follow-up; no zombie session.
- Approval timeout: treat as deny; no live session.
- Multiple “open a terminal” requests: v1 keeps **one** live terminal per JARVIS session; a second open focuses the existing one.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The existing one-shot spoken command capability MUST remain available and MUST stay the default for “run \<command\>” when no live terminal is open.
- **FR-002**: One-shot command evaluation MUST refuse destructive work even when it is hidden behind pipes, “and”/“or” chaining, extra prefixes, or command/process substitution.
- **FR-003**: One-shot commands MUST NOT run with secret-like environment values (keys, tokens, passwords) inherited into the child.
- **FR-004**: One-shot commands MUST NOT read or write blocked sensitive locations (operator credential directories and system password/sudo files).
- **FR-005**: One-shot commands that exceed the existing time limit MUST be stopped, including child processes, and reported as timed out.
- **FR-006**: One-shot command output returned to the language model MUST be sanitized so it cannot impersonate tool or system instructions.
- **FR-007**: Operators MUST be able to open exactly one live interactive terminal in Mission Control by voice or explicit request, bound to the current JARVIS conversation session.
- **FR-008**: Opening a live terminal is slow work: first spoken audio MUST start within 3 seconds of the final transcript; attach MAY complete after that.
- **FR-009**: Live terminal open, and mutating one-shot commands, MUST go through the Permission Agent (approve / deny / existing session-trust posture). Deny means no execution.
- **FR-010**: The live terminal MUST be destroyed on NEW SESSION, conversation end, explicit close, and idle timeout. No orphan shells.
- **FR-011**: The live terminal MUST accept operator keystrokes and JARVIS-injected text as a real interactive session (prompt, cursor, color, interactive programs).
- **FR-012**: JARVIS MUST NOT speak raw live-terminal output. Spoken follow-ups are a one-line summary or a pointer to the panel.
- **FR-013**: The terminal category MUST remain off by default. Disabled category means no one-shot mutating shell and no live session.
- **FR-014**: Live terminal connectivity MUST be local-machine only.
- **FR-015**: Every one-shot run and live-session open/write/close MUST be recorded in procedural memory (success, deny, failure, duration).
- **FR-016**: This feature MUST NOT include native-app computer-use (email/Slack/Finder “hands”), a third-party web-SSH product, or a separate share-the-local-shell sidecar.

### Key Entities

- **One-shot command run**: A single spoken or requested command with approval outcome, blocked/allowed status, truncated output, duration, and session id.
- **Live terminal session**: At most one per JARVIS conversation; created, written, resized, and killed as a unit; idle timer; attach token or equivalent so only Mission Control for that session can connect.
- **Approval request**: Existing Mission Control approve/deny (and spoken yes/no) for mutating shell work and live-session open.
- **JARVIS conversation session**: Lifetime owner of the live terminal; NEW SESSION ends both.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the operator finishes speaking a terminal request, they hear JARVIS start talking within 3 seconds in at least 95% of attempts on a healthy local setup (ack counts; the command or panel MAY still be in progress).
- **SC-002**: 100% of tested chained or substitution-based destructive one-shot commands are refused with no side effect on the machine.
- **SC-003**: An operator who enabled the terminal category can go from “open a terminal” plus approval to a usable prompt in Mission Control without leaving the JARVIS HUD.
- **SC-004**: After NEW SESSION, zero live terminal processes from the previous conversation remain.
- **SC-005**: Operators can complete “open → type a directory listing → close” without using a separate desktop terminal app.
- **SC-006**: Hung one-shot commands stop by the existing time limit; operators are told they timed out rather than left waiting indefinitely.
- **SC-007**: With the terminal category off, 100% of open-live-terminal and mutating one-shot attempts are refused.

## Assumptions

- Analysis in `docs/plans/WEB_TERMINAL_ANALYSIS.md` and `docs/plans/WEB_TERMINAL_EXTRACTION.md` is the research baseline; this spec is the delivery contract.
- Constitution v1.0.0 applies: 3s voice ceiling, local-first, runtime executes, Permission Agent, no vendoring of aictl/Ghost/Hyper source.
- Existing approve/deny dialog and spoken yes/no are reused; no second permission chrome.
- Existing one-shot time limit (today 30 seconds) stays unless a later spec changes it.
- v1 is one live terminal per JARVIS session; tabs/splits are out of scope.
- Working directory for one-shot and live session defaults to the project / allowed roots already used by filesystem tools.
- Pattern libraries (aictl security ideas, Hyper session protocol) are reimplemented inside this project; third-party apps are not shipped.
- Ghost OS MCP, ttyd-as-product, and Wetty are explicitly later or never for this feature.
- Speech-to-text errors are handled by sending model-proposed command text through permissions, not by piping raw transcripts into a live shell.
- Planning (`/speckit-plan`) will choose concrete libraries and process layout; this spec does not require a particular emulator or server framework in the success criteria.
- **Latency disclosure (constitution I):** opening a live terminal and running one-shot commands are slow. Implementation MUST speak an ack first. The coding agent MUST state that in the same turn when writing that path.
