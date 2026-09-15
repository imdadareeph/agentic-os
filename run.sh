#!/usr/bin/env bash
# Agentic OS — start JARVIS and local service stack, print URL status dashboard.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$ROOT/app"
RUNTIME="$ROOT/runtime"

# ── URLs ──────────────────────────────────────────────────────────────────────
JARVIS_URL="http://localhost:3000"
VITALS_URL="http://localhost:3000/api/vitals"
MEMORY_URL="http://localhost:8000"
MEMORY_HEALTH_URL="$MEMORY_URL/api/memory/health"
WHISPER_URL="http://localhost:9000"
OLLAMA_URL="http://localhost:11434"
VOICEBOX_URL="http://localhost:17493"
GITNEXUS_URL="http://localhost:4747"

# ── Colors ────────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  CYAN='\033[0;36m'
  DIM='\033[2m'
  BOLD='\033[1m'
  NC='\033[0m'
else
  GREEN='' YELLOW='' CYAN='' DIM='' BOLD='' NC=''
fi

PIDS=()
STARTED_OLLAMA=0
STARTED_VITE=0
OLLAMA_PID=""

# Server-side default so any request that forgets to pass its own keep_alive
# (e.g. a stray curl) still keeps the model resident — the actual fix for the
# 20s+ cold-reload latency is the per-request keep_alive in ollama.ts/loop.py;
# this is defense-in-depth, not a substitute for it.
export OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:-30m}"
# Chat model (llama3.2) + embed model (nomic-embed-text) are BOTH in play every
# turn. Ollama's defaults serve one request at a time and may evict one model
# to load the other — an embed queued behind a generation (or a cold reload)
# lands straight on the voice path. Two parallel slots + two resident models.
export OLLAMA_NUM_PARALLEL="${OLLAMA_NUM_PARALLEL:-2}"
export OLLAMA_MAX_LOADED_MODELS="${OLLAMA_MAX_LOADED_MODELS:-2}"

# ── Helpers ───────────────────────────────────────────────────────────────────
probe() {
  curl -sf --max-time "${2:-3}" "$1" >/dev/null 2>&1
}

wait_for() {
  local url="$1"
  local label="$2"
  local attempts="${3:-40}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if probe "$url"; then
      return 0
    fi
    sleep 0.25
  done
  echo "  Warning: $label did not become ready in time." >&2
  return 1
}

kill_port() {
  local port="$1"
  local label="$2"
  local pids

  pids="$(lsof -ti ":$port" 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    return 0
  fi

  echo "  Stopping ${label} on :${port}…"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 0.5

  pids="$(lsof -ti ":$port" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    sleep 0.3
  fi
}

cleanup() {
  trap - SIGINT SIGTERM EXIT
  echo ""
  echo "Shutting down Agentic OS services…"

  if [[ "$STARTED_OLLAMA" -eq 1 ]] && [[ -n "$OLLAMA_PID" ]] && kill -0 "$OLLAMA_PID" 2>/dev/null; then
    kill "$OLLAMA_PID" 2>/dev/null || true
  fi

  if ((${#PIDS[@]})); then
    for pid in "${PIDS[@]}"; do
      kill "$pid" 2>/dev/null || true
    done
  fi

  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

print_status() {
  local name="$1"
  local url="$2"
  local probe_url="$3"
  local role="${4:-}"
  local note=""

  if [[ -n "$role" ]]; then
    note="  ${DIM}($role)${NC}"
  fi

  if probe "$probe_url"; then
    printf "  ${GREEN}●${NC} %-14s ${CYAN}%-32s${NC} ${GREEN}online${NC}%b\n" "$name" "$url" "$note"
  else
    printf "  ${YELLOW}○${NC} %-14s ${CYAN}%-32s${NC} ${YELLOW}offline${NC}%b\n" "$name" "$url" "$note"
  fi
}

print_dashboard() {
  echo ""
  echo "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
  echo "${BOLD}  Agentic OS — JARVIS${NC}"
  echo "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  print_status "JARVIS UI" "$JARVIS_URL" "$JARVIS_URL/" "voice command center"
  print_status "Vitals API" "$VITALS_URL" "$VITALS_URL" "YouTube · Instagram · Ollama stats"
  print_status "Memory Runtime" "$MEMORY_URL" "$MEMORY_HEALTH_URL" "conversation persistence · SQLite"
  print_status "Whisper STT" "$WHISPER_URL" "$WHISPER_URL/v1/models" "optional · refine transcription"
  print_status "Ollama LLM" "$OLLAMA_URL" "$OLLAMA_URL/api/tags" "JARVIS brain"
  print_status "Voicebox" "$VOICEBOX_URL" "$VOICEBOX_URL/health" "optional STT/TTS"
  print_status "GitNexus" "$GITNEXUS_URL" "$GITNEXUS_URL" "optional code graph"
  echo ""
  echo "${DIM}  Proxies (via Vite): /runtime · /whisper · /voicebox · /ollama · /anthropic · /gemini · /gitnexus${NC}"
  echo "${DIM}  Press Ctrl+C to stop all services started by this script.${NC}"
  echo ""
}

# ── Per-service start (idempotent: restarts if already running) ─────────────
start_ollama() {
  if ! command -v ollama >/dev/null 2>&1; then
    echo "  Ollama not installed — install from https://ollama.com" >&2
    return
  fi
  if probe "$OLLAMA_URL/api/tags"; then
    echo "  Restarting Ollama…"
    kill_port 11434 "Ollama"
  else
    echo "  Starting Ollama…"
  fi
  ollama serve >/dev/null 2>&1 &
  OLLAMA_PID=$!
  STARTED_OLLAMA=1
  wait_for "$OLLAMA_URL/api/tags" "Ollama" || true
  warm_chat_model
}

# Cold-loading the chat model costs ~6s and lands on the FIRST voice turn if
# nothing pre-warms it (runtime/main.py already warms the embed model). Load it
# now, in the background, with the same keep_alive the app uses.
JARVIS_CHAT_MODEL="${JARVIS_CHAT_MODEL:-llama3.2:latest}"
warm_chat_model() {
  echo "  Warming chat model ${JARVIS_CHAT_MODEL}…"
  curl -s --max-time 60 "$OLLAMA_URL/api/generate" \
    -d "{\"model\":\"$JARVIS_CHAT_MODEL\",\"prompt\":\"\",\"keep_alive\":\"30m\"}" \
    >/dev/null 2>&1 &
}

start_memory_runtime() {
  if [[ ! -d "$RUNTIME" ]]; then
    echo "  Memory runtime not found at $RUNTIME — skipping." >&2
    return
  fi
  if ! command -v uv >/dev/null 2>&1; then
    echo "  uv not installed — memory runtime skipped (install: https://docs.astral.sh/uv/)" >&2
    return
  fi
  if probe "$MEMORY_HEALTH_URL"; then
    echo "  Restarting memory runtime…"
    kill_port 8000 "Memory runtime"
  else
    echo "  Starting memory runtime…"
  fi
  (cd "$APP" && npm run runtime:dev) &
  PIDS+=("$!")
  wait_for "$MEMORY_HEALTH_URL" "Memory runtime" || true
}

start_jarvis() {
  if probe "$JARVIS_URL/"; then
    echo "  Restarting JARVIS dev server…"
    kill_port 3000 "JARVIS"
  else
    echo "  Starting JARVIS dev server…"
  fi
  (cd "$APP" && npm run dev) &
  PIDS+=("$!")
  STARTED_VITE=1
  wait_for "$JARVIS_URL/" "JARVIS" || true
}

usage() {
  cat >&2 <<EOF
Usage:
  $0                       Start (or restart, if already running) the full stack, stays in foreground
  $0 restart               Restart every service, one-shot (does not block afterward)
  $0 restart ollama        Restart only Ollama
  $0 restart memory        Restart only the memory runtime (FastAPI)
  $0 restart jarvis        Restart only the JARVIS dev server (Vite)
EOF
}

# ── Argument parsing ──────────────────────────────────────────────────────────
ACTION="${1:-start}"

if [[ "$ACTION" == "-h" || "$ACTION" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "$ACTION" == "restart" ]]; then
  TARGET="${2:-all}"
  echo "Agentic OS — restarting ${TARGET}…"
  case "$TARGET" in
    ollama) start_ollama ;;
    memory) start_memory_runtime ;;
    jarvis) start_jarvis ;;
    all)
      start_ollama
      start_memory_runtime
      start_jarvis
      ;;
    *)
      echo "Unknown target: $TARGET" >&2
      usage
      exit 1
      ;;
  esac
  print_dashboard
  echo "  (Restarted service(s) keep running in the background — this command has exited.)"
  trap - SIGINT SIGTERM EXIT
  exit 0
elif [[ "$ACTION" != "start" ]]; then
  echo "Unknown command: $ACTION" >&2
  usage
  exit 1
fi

# ── Preflight ─────────────────────────────────────────────────────────────────
echo "Agentic OS — starting services…"

if [[ ! -d "$APP/node_modules" ]]; then
  echo "  Installing app dependencies…"
  (cd "$APP" && npm install --no-fund --no-audit)
fi

start_ollama
start_memory_runtime
start_jarvis

print_dashboard

# ── Foreground: keep alive until interrupted ──────────────────────────────────
wait "${PIDS[@]}"
