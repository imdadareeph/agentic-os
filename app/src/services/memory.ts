/**
 * Memory runtime client (Phase M0) — thin fetch wrapper over the Python
 * FastAPI runtime, reached through the Vite `/runtime` proxy.
 *
 * Graceful degradation is the contract: every call catches its own failures
 * and returns an empty/degraded result. A dead runtime must never throw into
 * the voice flow.
 */

import { logActivity } from '@/services/activity-log'
import { fetchWithTimeout } from '@/lib/fetch'

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
  /** Memory Budget: hard cap on injected memories (primary retrieve cap). */
  maxRetrievedMemories?: number
  /** Memory Budget: total inject token budget for the prompt. */
  sessionContextTokens?: number
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
  const res = await post('/api/memory/store', { sessionId, turn, agentId })
  logActivity('memory', 'Store turn', res?.ok ? 'ok' : 'error')
}

/** Fetch memory for a session. Degrades to an empty envelope on any failure. */
export async function retrieveMemory(
  sessionId: string,
  userMessage: string,
  options: RetrieveOptions = {},
  agentId = 'jarvis'
): Promise<RetrieveResult> {
  const startedAt = performance.now()
  const res = await post(
    '/api/memory/retrieve',
    {
    sessionId,
    userMessage,
    agentId,
    semanticEnabled: options.semanticEnabled ?? false,
    semanticTopK: options.semanticTopK ?? 3,
    semanticMinScore: options.semanticMinScore ?? 0.65,
    maxRetrievedMemories: options.maxRetrievedMemories ?? 25,
    sessionContextTokens: options.sessionContextTokens ?? 8192,
    },
    RETRIEVE_TIMEOUT_MS
  )
  const ms = Math.round(performance.now() - startedAt)
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
    return result
  } catch {
    logActivity('memory', 'Retrieve memory', 'error')
    return EMPTY_RETRIEVE
  }
}

export interface SearchResult {
  hits: SemanticHit[]
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
