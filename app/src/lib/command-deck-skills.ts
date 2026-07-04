/**
 * Command Deck skill stubs (T3, TOOLS.md §13.3 minimal-manifest note).
 *
 * Not the full T4 skill loader — just enough to make PLAN-TODAY / AM-REPORT
 * real: each is a preset prompt run through the tool loop so JARVIS can pull
 * live data (vitals, memory, filesystem) instead of toggling a decorative
 * button. Never throws — callers get a plain string result or an error one.
 */
import { toast } from 'sonner'
import { getAiSettings } from '@/stores/ai-settings-store'
import { getToolSettings, enabledCategories, areToolsActive } from '@/stores/tool-settings-store'
import { planTools, runToolLoop, executeTool } from '@/services/tools'

export interface SkillDefinition {
  id: string
  label: string
  prompt: string
}

export const COMMAND_DECK_SKILLS: Record<string, SkillDefinition> = {
  'plan-today': {
    id: 'plan-today',
    label: 'Plan Today',
    prompt:
      'Give me a short plan for today. Check system status and any relevant recent notes, then summarize in 3-5 bullet points.',
  },
  'am-report': {
    id: 'am-report',
    label: 'AM Report',
    prompt:
      'Give me a brief morning report: current vitals, system status, and anything notable from recent memory.',
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
  const provider = ai.providers[ai.activeProvider]
  if (ai.activeProvider !== 'anthropic' || !provider.apiKey) {
    toast.info(`${skill.label}: requires Anthropic active with an API key`)
    return null
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
      apiKey: provider.apiKey,
      model: provider.model || undefined,
      baseUrl: provider.baseUrl,
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

/** METRICS-PULL: log a real vitals.fetch tool run (T3 exit criterion 1). */
export async function pullMetricsViaTool(): Promise<void> {
  const res = await executeTool('vitals.fetch', {})
  if (!res.ok && !res.needsApproval) {
    toast.error('METRICS-PULL: vitals.fetch failed', { description: res.error ?? undefined })
  }
}
