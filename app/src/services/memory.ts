/**
 * Memory runtime client (Phase M0) — thin fetch wrapper over the Python
 * FastAPI runtime, reached through the Vite `/runtime` proxy.
 *
 * Graceful degradation is the contract: every call catches its own failures
 * and returns an empty/degraded result. A dead runtime must never throw into
 * the voice flow.
 */

import { logActivity } from '@/services/activity-log'
import { fetchWithTimeout, fetchWithTimeoutAndSignal, isAbortError } from '@/lib/fetch'

const RUNTIME_BASE = '/runtime'

// Voice latency is sacred: retrieve sits ON the hot path (awaited before the
// LLM call), so a slow/hung runtime must degrade to empty fast, not stall the
// turn — raw fetch has no timeout and hangs as long as the socket does.
const RETRIEVE_TIMEOUT_MS = 1500
// Off-path (fire-and-forget) calls still get a bound so they can't pile up.
const DEFAULT_TIMEOUT_MS = 5000

export interface MemoryTurn {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  refined?: boolean
  createdAt?: string
}

export interface MemoryHealth {
  sqlite: boolean
  chroma: boolean | null
  vault: boolean | null
  sync: boolean | null
  /** null = Obsidian API key not configured yet; true/false = reachable or not. */
  obsidianApi: boolean | null
}

export interface ObsidianConfigInfo {
  baseUrl: string
  configured: boolean
}

export interface SemanticHit {
  path: string | null
  text: string
  score: number
}

export interface RetrieveResult {
  conversation: MemoryTurn[]
  semantic: SemanticHit[]
  episodic: unknown[]
  procedural: unknown[]
  contextBlock: string
}

export interface RetrieveOptions {
  semanticEnabled?: boolean
  semanticTopK?: number
  semanticMinScore?: number
  /** Max conversation turns from SQLite (pairs × 2). */
  conversationLimit?: number
  /** Memory Budget: hard cap on injected memories (primary retrieve cap). */
  maxRetrievedMemories?: number
  /** Memory Budget: total inject token budget for the prompt. */
  sessionContextTokens?: number
  /** Cancel in-flight retrieve on barge-in / turn abort (MP1). */
  signal?: AbortSignal
}

/** MP1 — session-scoped prefetch cache; ~30s TTL, invalidated on store. */
const PREFETCH_TTL_MS = 30_000

interface PrefetchCacheEntry {
  sessionId: string
  queryKey: string
  result: RetrieveResult
  ts: number
}

let prefetchCache: PrefetchCacheEntry | null = null
const inFlightRetrieves = new Map<string, Promise<RetrieveResult>>()

interface SpeculativePrefetch {
  sessionId: string
  userMessage: string
  queryKey: string
  promise: Promise<RetrieveResult>
  controller: AbortController
}

let speculativePrefetch: SpeculativePrefetch | null = null

/** Abort interim speculative retrieve (barge-in / session end). */
export function cancelSpeculativePrefetch(): void {
  if (!speculativePrefetch) return
  speculativePrefetch.controller.abort()
  speculativePrefetch = null
}

export function invalidatePrefetchCache(): void {
  prefetchCache = null
  inFlightRetrieves.clear()
  cancelSpeculativePrefetch()
}

/** Drop cached retrieve results after a new turn is stored; keep in-flight fetches. */
function invalidatePrefetchResultCache(): void {
  prefetchCache = null
}

function buildRetrieveQueryKey(
  sessionId: string,
  userMessage: string,
  options: RetrieveOptions
): string {
  return [
    sessionId,
    userMessage,
    options.semanticEnabled ?? false,
    options.conversationLimit ?? 20,
    options.semanticTopK ?? 3,
    options.semanticMinScore ?? 0.65,
    options.maxRetrievedMemories ?? 25,
    options.sessionContextTokens ?? 8192,
  ].join('\0')
}

const EMPTY_RETRIEVE: RetrieveResult = {
  conversation: [],
  semantic: [],
  episodic: [],
  procedural: [],
  contextBlock: '',
}

async function post(
  path: string,
  body: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response | null> {
  try {
    return await fetchWithTimeout(
      `${RUNTIME_BASE}${path}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      timeoutMs
    )
  } catch {
    return null
  }
}

export async function getMemoryHealth(): Promise<MemoryHealth | null> {
  try {
    const res = await fetch(`${RUNTIME_BASE}/api/memory/health`)
    if (!res.ok) return null
    return (await res.json()) as MemoryHealth
  } catch {
    return null
  }
}

/** Current Obsidian API config. Never returns the raw key — only whether one is set. */
export async function getObsidianConfig(): Promise<ObsidianConfigInfo | null> {
  try {
    const res = await fetch(`${RUNTIME_BASE}/api/memory/obsidian/config`)
    if (!res.ok) return null
    return (await res.json()) as ObsidianConfigInfo
  } catch {
    return null
  }
}

/** Save Obsidian base URL + API key. The key is stored server-side (~/jarvis/obsidian.json), never in the browser. */
export async function saveObsidianConfig(
  baseUrl: string,
  apiKey: string
): Promise<ObsidianConfigInfo | null> {
  const res = await post('/api/memory/obsidian/config', { baseUrl, apiKey })
  if (!res || !res.ok) return null
  try {
    return (await res.json()) as ObsidianConfigInfo
  } catch {
    return null
  }
}

/** Create a backend session. Returns null when the runtime is unavailable. */
export async function createSession(
  options: { sessionMemoryEnabled?: boolean; incognito?: boolean } = {}
): Promise<string | null> {
  const res = await post('/api/sessions', options)
  if (!res || !res.ok) return null
  try {
    const data = (await res.json()) as { sessionId?: string }
    return data.sessionId ?? null
  } catch {
    return null
  }
}

/** Mark a session ended. Fire-and-forget safe. */
export async function endSession(sessionId: string): Promise<void> {
  try {
    await fetch(`${RUNTIME_BASE}/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    })
  } catch {
    // Runtime down — nothing to do.
  }
}

/** Persist one turn. Fire-and-forget safe — never throws. */
export async function storeTurn(
  sessionId: string,
  turn: MemoryTurn,
  agentId = 'jarvis'
): Promise<void> {
  invalidatePrefetchResultCache()
  const res = await post('/api/memory/store', { sessionId, turn, agentId })
  logActivity('memory', 'Store turn', res?.ok ? 'ok' : 'error')
}

async function postRetrieve(
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Response | null> {
  try {
    return await fetchWithTimeoutAndSignal(
      `${RUNTIME_BASE}/api/memory/retrieve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      RETRIEVE_TIMEOUT_MS,
      signal
    )
  } catch (err) {
    if (isAbortError(err) || signal?.aborted) return null
    return null
  }
}

/** Fetch memory for a session. Degrades to an empty envelope on any failure. */
export async function retrieveMemory(
  sessionId: string,
  userMessage: string,
  options: RetrieveOptions = {},
  agentId = 'jarvis'
): Promise<RetrieveResult> {
  const { signal } = options
  if (signal?.aborted) return EMPTY_RETRIEVE

  const queryKey = buildRetrieveQueryKey(sessionId, userMessage, options)
  const now = Date.now()
  const cached = prefetchCache
  if (
    cached &&
    cached.sessionId === sessionId &&
    cached.queryKey === queryKey &&
    now - cached.ts < PREFETCH_TTL_MS
  ) {
    logActivity('memory', 'Retrieve memory', 'ok', 'cache hit')
    return cached.result
  }

  const inFlight = inFlightRetrieves.get(queryKey)
  if (inFlight) return inFlight

  const promise = (async (): Promise<RetrieveResult> => {
    const startedAt = performance.now()
    const res = await postRetrieve(
      {
        sessionId,
        userMessage,
        agentId,
        limit: options.conversationLimit ?? 20,
        semanticEnabled: options.semanticEnabled ?? false,
        semanticTopK: options.semanticTopK ?? 3,
        semanticMinScore: options.semanticMinScore ?? 0.65,
        maxRetrievedMemories: options.maxRetrievedMemories ?? 25,
        sessionContextTokens: options.sessionContextTokens ?? 8192,
      },
      signal
    )
    const ms = Math.round(performance.now() - startedAt)
    if (signal?.aborted) return EMPTY_RETRIEVE
    if (!res || !res.ok) {
      logActivity('memory', 'Retrieve memory', 'error', `${ms}ms`)
      return EMPTY_RETRIEVE
    }
    try {
      const result = (await res.json()) as RetrieveResult
      logActivity(
        'memory',
        'Retrieve memory',
        'ok',
        `${ms}ms · ${result.conversation.length} conv · ${result.semantic.length} semantic`
      )
      prefetchCache = { sessionId, queryKey, result, ts: Date.now() }
      return result
    } catch {
      if (signal?.aborted) return EMPTY_RETRIEVE
      logActivity('memory', 'Retrieve memory', 'error')
      return EMPTY_RETRIEVE
    }
  })().finally(() => {
    inFlightRetrieves.delete(queryKey)
  })

  inFlightRetrieves.set(queryKey, promise)
  return promise
}

/** Matches runtime orchestrator semantic timeout (MP2 final await cap). */
export const SEMANTIC_BUDGET_MS = 300

function prefetchMatchesFinal(
  prefetch: SpeculativePrefetch,
  sessionId: string,
  finalText: string,
  options: RetrieveOptions
): boolean {
  if (prefetch.sessionId !== sessionId) return false
  const final = finalText.trim().toLowerCase()
  const pref = prefetch.userMessage.trim().toLowerCase()
  if (final === pref || final.startsWith(pref) || pref.startsWith(final)) return true
  return buildRetrieveQueryKey(sessionId, finalText, options) === prefetch.queryKey
}

async function awaitWithBudget(
  promise: Promise<RetrieveResult>,
  budgetMs: number,
  signal?: AbortSignal
): Promise<RetrieveResult> {
  if (signal?.aborted) return EMPTY_RETRIEVE
  if (budgetMs <= 0) return EMPTY_RETRIEVE

  return new Promise(resolve => {
    let settled = false
    const finish = (result: RetrieveResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve(result)
    }
    const onAbort = () => finish(EMPTY_RETRIEVE)
    const timer = setTimeout(() => finish(EMPTY_RETRIEVE), budgetMs)
    promise.then(finish).catch(() => finish(EMPTY_RETRIEVE))
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** MP2: start retrieve while the user is still speaking (after local gate passes). */
export function startSpeculativeRetrieve(
  sessionId: string,
  userMessage: string,
  options: RetrieveOptions
): void {
  if (!options.semanticEnabled) return

  const trimmed = userMessage.trim()
  if (!trimmed) return

  const queryKey = buildRetrieveQueryKey(sessionId, trimmed, options)
  if (
    speculativePrefetch &&
    speculativePrefetch.sessionId === sessionId &&
    speculativePrefetch.queryKey === queryKey
  ) {
    return
  }

  cancelSpeculativePrefetch()

  const controller = new AbortController()
  const promise = retrieveMemory(sessionId, trimmed, {
    ...options,
    signal: controller.signal,
  })

  speculativePrefetch = {
    sessionId,
    userMessage: trimmed,
    queryKey,
    promise,
    controller,
  }
}

/**
 * MP2: on final transcript, reuse matching interim prefetch (≤300ms await) or
 * fall through to MP1 retrieve. Never blocks STT — call only from processTurn.
 */
export async function finalizeRetrieve(
  sessionId: string,
  userMessage: string,
  options: RetrieveOptions = {},
  agentId = 'jarvis'
): Promise<RetrieveResult> {
  const { signal } = options
  if (signal?.aborted) return EMPTY_RETRIEVE

  const prefetch = speculativePrefetch
  if (prefetch && prefetchMatchesFinal(prefetch, sessionId, userMessage, options)) {
    speculativePrefetch = null
    logActivity('memory', 'Retrieve memory', 'ok', 'interim prefetch')
    return awaitWithBudget(prefetch.promise, SEMANTIC_BUDGET_MS, signal)
  }

  cancelSpeculativePrefetch()
  return retrieveMemory(sessionId, userMessage, options, agentId)
}

export interface SearchResult {
  hits: SemanticHit[]
}

export interface UserFact {
  id: string
  key: string
  value: string
  confidence: number
  sourceTurnId?: string | null
  createdAt: string
  updatedAt: string
}

export interface ProfileResult {
  facts: UserFact[]
}

/** Active profile facts (MF0). Empty on failure — never throws into UI. */
export async function fetchProfileFacts(limit = 100): Promise<UserFact[]> {
  try {
    const res = await fetch(`${RUNTIME_BASE}/api/memory/profile?limit=${limit}`)
    if (!res.ok) return []
    return ((await res.json()) as ProfileResult).facts ?? []
  } catch {
    return []
  }
}

/** Debug semantic search (Memory Settings → Debug). Empty on failure. */
export async function searchMemory(
  query: string,
  topK = 3,
  minScore = 0.65
): Promise<SemanticHit[]> {
  const res = await post('/api/memory/search', { query, topK, minScore })
  if (!res || !res.ok) return []
  try {
    return ((await res.json()) as SearchResult).hits ?? []
  } catch {
    return []
  }
}

export interface SyncResult {
  embedded: number
  deleted: number
  vault: boolean
  errors: string[]
}

/** Trigger a vault → Chroma reconcile. Null on failure. */
export async function syncMemory(): Promise<SyncResult | null> {
  // Full reconcile re-embeds every changed file — minutes on a big vault.
  const res = await post('/api/memory/sync', {}, 300_000)
  if (!res || !res.ok) {
    logActivity('obsidian', 'Vault sync', 'error')
    return null
  }
  try {
    const result = (await res.json()) as SyncResult
    logActivity('obsidian', 'Vault sync', 'ok', `${result.embedded} embedded · ${result.deleted} deleted`)
    return result
  } catch {
    logActivity('obsidian', 'Vault sync', 'error')
    return null
  }
}

export interface EpisodicWrite {
  title: string
  body: string
  sessionId?: string
  agentId?: string
  tags?: string[]
  sources?: string[]
}

/**
 * Write an episodic note to the vault (M3). Fire-and-forget safe — a failed
 * write must never affect the voice flow. Returns whether it actually
 * succeeded, for callers (e.g. explicit user-initiated saves) that need to
 * know before proceeding — fire-and-forget callers can just `void` it.
 */
export async function writeEpisodic(note: EpisodicWrite): Promise<boolean> {
  const res = await post('/api/memory/episodic', {
    title: note.title,
    body: note.body,
    sessionId: note.sessionId ?? '',
    agentId: note.agentId ?? 'jarvis',
    tags: note.tags ?? [],
    sources: note.sources ?? [],
  })
  logActivity('obsidian', `Vault note: ${note.title}`, res?.ok ? 'ok' : 'error')
  return res?.ok ?? false
}

export interface MemoryBudget {
  maxParallelMemoryJobs?: number
  embeddingBudgetPerDay?: number
  dailyReflectionMinutes?: number
  maxBackgroundCpuPercent?: number
  maxBackgroundGpuPercent?: number
}

/**
 * Heartbeat while a conversation is active: keeps the runtime's activity clock
 * warm (so idle background memory work stands down) and mirrors the Memory
 * Budget into the idle worker. Fire-and-forget safe.
 */
export async function sendHeartbeat(budget: MemoryBudget = {}): Promise<void> {
  await post('/api/memory/heartbeat', budget)
}

/** Client-side heuristic mirroring the runtime intent gate — is this worth persisting? */
export function looksResearchy(text: string): boolean {
  return /\b(how|why|what|set ?up|configure|install|research|decide|decision|explain|document)\b/i.test(
    text
  )
}

// --- Memory Galaxy (Phase MV) ------------------------------------------------
// On-demand only — fetched from MemoryGalaxyPage (`/memory`), never during a
// voice conversation. Same graceful-degradation contract as the rest of this
// file: a dead runtime yields an empty graph, never a throw.

export interface GraphNode {
  id: string
  label: string
  path: string
  kind: 'note' | 'chunk'
  folder: string
  chunkIndex: number | null
  touchedAt: string
  linkDegree: number
}

export interface GraphLink {
  source: string
  target: string
  kind: 'wikilink' | 'folder'
}

export interface GraphStats {
  nodes: number
  links: number
  notes: number
  chunks: number
}

export interface MemoryGraph {
  stats: GraphStats
  truncated: boolean
  nodes: GraphNode[]
  links: GraphLink[]
}

const EMPTY_GRAPH: MemoryGraph = {
  stats: { nodes: 0, links: 0, notes: 0, chunks: 0 },
  truncated: false,
  nodes: [],
  links: [],
}

export interface GraphOptions {
  granularity?: 'note' | 'chunk'
  maxNodes?: number
  maxLinks?: number
}

export async function fetchMemoryGraph(options: GraphOptions = {}): Promise<MemoryGraph> {
  try {
    const params = new URLSearchParams({
      granularity: options.granularity ?? 'note',
      maxNodes: String(options.maxNodes ?? 500),
      maxLinks: String(options.maxLinks ?? 2000),
    })
    const res = await fetch(`${RUNTIME_BASE}/api/memory/graph?${params}`)
    if (!res.ok) return EMPTY_GRAPH
    return (await res.json()) as MemoryGraph
  } catch {
    return EMPTY_GRAPH
  }
}

// --- Vault note preview (Phase MV.2) -----------------------------------------
// On-demand only — fetched when a graph star is selected, never during voice.

export interface VaultLink {
  label: string
  path: string | null
  resolved: boolean
}

export interface VaultNote {
  path: string
  title: string
  body: string
  frontmatter: Record<string, unknown>
  outboundLinks: VaultLink[]
  touchedAt: string
  embedded: boolean
  truncated: boolean
}

export async function fetchVaultNote(path: string): Promise<VaultNote | null> {
  try {
    const params = new URLSearchParams({ path })
    const res = await fetchWithTimeout(
      `${RUNTIME_BASE}/api/memory/vault/note?${params}`,
      {},
      5000
    )
    if (!res.ok) return null
    return (await res.json()) as VaultNote
  } catch {
    return null
  }
}
