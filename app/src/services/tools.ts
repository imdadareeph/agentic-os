/**
 * Tools runtime client (Phase T0/T1) — thin fetch wrapper over the Python
 * tool loop, via the Vite `/runtime` proxy. Graceful degradation is the
 * contract: every call catches its own failures and returns a safe default.
 * A dead runtime or a tool error must NEVER throw into the voice flow.
 */

const RUNTIME_BASE = '/runtime'

export interface ToolsHealth {
  loaded: boolean
  toolCount: number
  categories: Record<string, number>
}

export interface ToolCatalogEntry {
  name: string
  title: string
  description: string
  category: string
  permission: string
  latencyClass: string
  enabled: boolean
  source: string
}

export interface ToolPlan {
  useTools: boolean
  candidates: string[]
  intent: string
}

export interface ToolRunSummary {
  tool: string
  success: boolean
  error?: string | null
}

export interface ToolLoopResult {
  reply: string | null
  toolRuns: ToolRunSummary[]
  turns: number
  degraded: boolean
  reason?: string | null
}

export interface ToolExecuteResult {
  ok: boolean
  data?: unknown
  error?: string | null
}

async function post(path: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(`${RUNTIME_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return null
  }
}

export async function getToolsHealth(): Promise<ToolsHealth | null> {
  try {
    const res = await fetch(`${RUNTIME_BASE}/api/tools/health`)
    if (!res.ok) return null
    return (await res.json()) as ToolsHealth
  } catch {
    return null
  }
}

export async function getToolCatalog(
  toolsEnabled: boolean,
  categories?: string[]
): Promise<ToolCatalogEntry[]> {
  try {
    const params = new URLSearchParams({ toolsEnabled: String(toolsEnabled) })
    if (categories?.length) params.set('categories', categories.join(','))
    const res = await fetch(`${RUNTIME_BASE}/api/tools/catalog?${params}`)
    if (!res.ok) return []
    return ((await res.json()) as { tools: ToolCatalogEntry[] }).tools ?? []
  } catch {
    return []
  }
}

const NO_TOOLS: ToolPlan = { useTools: false, candidates: [], intent: 'chat' }

export async function planTools(
  userMessage: string,
  categories?: string[],
  sessionId = ''
): Promise<ToolPlan> {
  const res = await post('/api/tools/plan', { userMessage, sessionId, categories })
  if (!res || !res.ok) return NO_TOOLS
  try {
    return (await res.json()) as ToolPlan
  } catch {
    return NO_TOOLS
  }
}

export interface ToolLoopArgs {
  userMessage: string
  history: { role: string; content: string }[]
  candidates: string[]
  systemPrompt: string
  sessionId?: string
  categories?: string[]
  allowedPaths?: string[]
  apiKey?: string
  model?: string
  baseUrl?: string
  maxTokens?: number
  temperature?: number
}

export async function runToolLoop(args: ToolLoopArgs): Promise<ToolLoopResult | null> {
  const res = await post('/api/tools/loop', args)
  if (!res || !res.ok) return null
  try {
    return (await res.json()) as ToolLoopResult
  } catch {
    return null
  }
}

export async function executeTool(
  toolName: string,
  toolArgs: Record<string, unknown> = {},
  allowedPaths?: string[]
): Promise<ToolExecuteResult> {
  const res = await post('/api/tools/execute', { toolName, args: toolArgs, allowedPaths })
  if (!res || !res.ok) return { ok: false, error: 'runtime unavailable' }
  try {
    return (await res.json()) as ToolExecuteResult
  } catch {
    return { ok: false, error: 'bad response' }
  }
}
