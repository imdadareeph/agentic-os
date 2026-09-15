/**
 * Command Deck skills (T3/T4, TOOLS.md §10/§13.3).
 *
 * Two flavors:
 * - Direct composite tools (PLAN-TODAY, AM-REPORT): instant, deterministic,
 *   call the registered skill.* tools (runtime/tools/handlers/skills.py)
 *   straight via executeTool — no LLM round-trip, no provider restriction.
 * - Preset-prompt skills (TREND-SCAN, GH-TRENDING, WK-REVIEW): need free-form
 *   web synthesis an LLM has to phrase, so they run through the tool loop.
 * Never throws — callers get a plain string result or an error one.
 */
import { toast } from 'sonner'
import { getAiSettings } from '@/stores/ai-settings-store'
import { getToolSettings, enabledCategories, areToolsActive } from '@/stores/tool-settings-store'
import { planTools, runToolLoop, executeTool } from '@/services/tools'
import { getOllamaModels } from '@/services/llm/ollama'

export interface SkillDefinition {
  id: string
  label: string
  prompt: string
}

export const COMMAND_DECK_SKILLS: Record<string, SkillDefinition> = {
  'trend-scan': {
    id: 'trend-scan',
    label: 'Trend Scan',
    prompt:
      'Search the web for what is trending today in AI agents and local-first software. Summarize the top 3 items in one line each.',
  },
  'gh-trending': {
    id: 'gh-trending',
    label: 'GH Trending',
    prompt:
      'Search the web for today\'s trending GitHub repositories. List the top 3 with a one-line description each.',
  },
  'wk-review': {
    id: 'wk-review',
    label: 'Week Review',
    prompt:
      'Review this week: check recent notes and system status, then summarize what happened in 3-5 bullet points.',
  },
}

/** Run a preset skill prompt through the tool loop. Toasts progress; never throws. */
export async function runSkill(skillId: string, sessionId = ''): Promise<string | null> {
  const skill = COMMAND_DECK_SKILLS[skillId]
  if (!skill) return null

  if (!areToolsActive()) {
    toast.info(`${skill.label}: enable Tools in settings to run this`)
    return null
  }

  const ai = getAiSettings()
  const providerId = ai.activeProvider
  const provider = ai.providers[providerId]
  if (providerId !== 'anthropic' && providerId !== 'ollama') {
    toast.info(`${skill.label}: requires Anthropic or Ollama active`)
    return null
  }
  if (providerId === 'anthropic' && !provider.apiKey) {
    toast.info(`${skill.label}: requires an Anthropic API key`)
    return null
  }
  let model = provider.model || undefined
  if (providerId === 'ollama' && !model) {
    model = (await getOllamaModels(provider.baseUrl))[0]
    if (!model) {
      toast.info(`${skill.label}: no Ollama models available`)
      return null
    }
  }

  const toastId = toast.loading(`${skill.label} — running…`)
  try {
    const categories = enabledCategories()
    const plan = await planTools(skill.prompt, categories, sessionId)
    const toolCfg = getToolSettings()
    const result = await runToolLoop({
      userMessage: skill.prompt,
      history: [],
      candidates: plan.candidates,
      systemPrompt: 'You are JARVIS. Be concise — this output is read, not spoken.',
      sessionId,
      categories,
      allowedPaths: toolCfg.allowedPaths.length ? toolCfg.allowedPaths : undefined,
      posture: toolCfg.defaultPermission,
      provider: providerId,
      apiKey: provider.apiKey || undefined,
      model,
      maxTokens: 400,
    })

    if (result?.approvalRequired?.length) {
      toast.info(`${skill.label}: needs approval — open Tool Settings > Debug`, { id: toastId })
      return null
    }
    if (!result || result.degraded || !result.reply) {
      toast.error(`${skill.label}: unavailable — ${result?.reason ?? 'no reply'}`, { id: toastId })
      return null
    }
    toast.success(skill.label, { id: toastId, description: result.reply })
    return result.reply
  } catch {
    toast.error(`${skill.label}: failed`, { id: toastId })
    return null
  }
}

/** PLAN-TODAY / AM-REPORT: call the registered composite skill tool directly. */
export async function runDirectSkill(toolName: string, label: string): Promise<void> {
  const toastId = toast.loading(`${label} — running…`)
  const res = await executeTool(toolName, {})
  if (res.needsApproval) {
    toast.info(`${label}: needs approval — open Tool Settings > Debug`, { id: toastId })
    return
  }
  if (!res.ok) {
    toast.error(`${label}: failed`, { id: toastId, description: res.error ?? undefined })
    return
  }
  const summary = (res.data as { summary?: string } | null)?.summary ?? 'Done.'
  toast.success(label, { id: toastId, description: summary })
}

/** RESEARCH: run the composite research agent (agent.research.run) with a user-supplied query. */
export async function runResearchSkill(): Promise<void> {
  const query = window.prompt('Research query:')?.trim()
  if (!query) return
  const toastId = toast.loading(`Research — "${query}"…`)
  const res = await executeTool('agent.research.run', { query })
  if (res.needsApproval) {
    toast.info('Research: needs approval — open Tool Settings > Debug', { id: toastId })
    return
  }
  if (!res.ok) {
    toast.error('Research: failed', { id: toastId, description: res.error ?? undefined })
    return
  }
  const data = res.data as { notePath?: string; resultCount?: number } | null
  toast.success('Research saved', {
    id: toastId,
    description: data?.notePath ?? 'Note written under agents/research/',
  })
}

/** METRICS-PULL: log a real vitals.fetch tool run (T3 exit criterion 1). */
export async function pullMetricsViaTool(): Promise<void> {
  const res = await executeTool('vitals.fetch', {})
  if (!res.ok && !res.needsApproval) {
    toast.error('METRICS-PULL: vitals.fetch failed', { description: res.error ?? undefined })
  }
}
