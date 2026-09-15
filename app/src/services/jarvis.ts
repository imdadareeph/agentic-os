import type { ConversationTurn } from '@/hooks/useRealtimeConversation'
import {
  buildChatMessages,
  buildSystemPrompt,
  effectiveMaxTokens,
} from '@/lib/jarvis-prompt'
import { chatWithActiveProvider } from '@/services/llm/router'
import { llmGenerate } from '@/services/voicebox'
import { getJarvisSettings } from '@/stores/jarvis-settings-store'
import { getVoiceSettings } from '@/stores/voice-settings-store'
import { getAiSettings } from '@/stores/ai-settings-store'
import { getMemorySettings } from '@/stores/memory-settings-store'
import {
  areToolsActive,
  enabledCategories,
  getToolSettings,
} from '@/stores/tool-settings-store'
import { planTools, runToolLoop, approveTool } from '@/services/tools'
import { mightNeedTools } from '@/lib/tool-plan'
import { requestApprovals } from '@/lib/tool-approval-broker'
import { logActivity } from '@/services/activity-log'
import { getOllamaModels } from '@/services/llm/ollama'
import type { VitalsResponse } from '@/types/vitals'
import { speakText } from '@/services/voice'

export async function think(
  userMessage: string,
  history: ConversationTurn[] = [],
  vitals?: VitalsResponse | null,
  signal?: AbortSignal,
  memoryContext?: string | null
): Promise<string> {
  const settings = getJarvisSettings()
  const base = buildSystemPrompt(settings, vitals)
  // Retrieved-memory block (M2) appended after persona/vitals, per memory.md §8.
  const system = memoryContext ? `${base}\n\n${memoryContext}` : base
  const messages = buildChatMessages(history, userMessage, system)

  try {
    return await chatWithActiveProvider({
      messages,
      temperature: settings.temperature,
      maxTokens: effectiveMaxTokens(settings),
      think: settings.deepThinking,
      signal,
    })
  } catch (providerErr) {
    const voiceSettings = getVoiceSettings()
    if (voiceSettings.voiceboxEnabled) {
      return llmGenerate(userMessage, system)
    }
    const message =
      providerErr instanceof Error ? providerErr.message : 'LLM request failed'
    throw new Error(
      message.includes('model') || message.includes('Deep thinking') || message.includes('API key')
        ? message
        : `No LLM available — ${message}`
    )
  }
}

/**
 * Tool-aware think (T0/T1). If tools are enabled and the message warrants a
 * tool, run the supervised tool loop; otherwise fall through to `think()`.
 * Any failure or degradation falls back to plain `think()` — the voice path
 * must never break because of tools.
 *
 * The tool loop is Anthropic-native (best tool support); other providers
 * degrade to text, so we only attempt the loop when Anthropic is active with
 * a key. Everything else is a normal think().
 */
export async function thinkWithTools(
  userMessage: string,
  history: ConversationTurn[] = [],
  vitals?: VitalsResponse | null,
  signal?: AbortSignal,
  memoryContext?: string | null,
  sessionId = ''
): Promise<string> {
  if (!areToolsActive()) {
    return think(userMessage, history, vitals, signal, memoryContext)
  }

  const ai = getAiSettings()
  const providerId = ai.activeProvider
  const cfg = ai.providers[providerId]
  // Native tool loop runs on Anthropic (needs a key) or Ollama (local, tool-
  // capable models only — e.g. llama3.1, qwen2.5). Other providers chat only.
  if (providerId !== 'anthropic' && providerId !== 'ollama') {
    return think(userMessage, history, vitals, signal, memoryContext)
  }
  if (providerId === 'anthropic' && !cfg.apiKey) {
    return think(userMessage, history, vitals, signal, memoryContext)
  }
  let resolvedModel = cfg.model || undefined
  if (providerId === 'ollama' && !resolvedModel) {
    resolvedModel = (await getOllamaModels(cfg.baseUrl))[0]
    if (!resolvedModel) return think(userMessage, history, vitals, signal, memoryContext)
  }

  // Zero-RTT local gate first: most turns are plain chat, and the server plan
  // round-trip on every one of them is pure added voice latency.
  if (!mightNeedTools(userMessage)) {
    return think(userMessage, history, vitals, signal, memoryContext)
  }
  const categories = enabledCategories()
  const plan = await planTools(userMessage, categories, sessionId)
  if (!plan.useTools) {
    return think(userMessage, history, vitals, signal, memoryContext)
  }

  const settings = getJarvisSettings()
  const baseSystem = buildSystemPrompt(settings, vitals)
  const base = memoryContext ? `${baseSystem}\n\n${memoryContext}` : baseSystem
  const toolCfg = getToolSettings()

  const result = await runToolLoop({
    userMessage,
    history: history.map(t => ({ role: t.role, content: t.text })),
    candidates: plan.candidates,
    systemPrompt: base,
    sessionId,
    categories,
    allowedPaths: toolCfg.allowedPaths.length ? toolCfg.allowedPaths : undefined,
    provider: providerId,
    apiKey: cfg.apiKey || undefined,
    model: resolvedModel,
    // Frontend baseUrl fields are Vite proxy aliases (`/anthropic`, `/ollama`)
    // — meaningless from the backend process. Let the runtime use its own
    // absolute default per provider (matches memory/embedder.py's OLLAMA_URL).
    maxTokens: effectiveMaxTokens(settings),
    temperature: settings.temperature,
    posture: toolCfg.defaultPermission,
    proceduralEnabled: getMemorySettings().proceduralMemoryEnabled,
  })

  // A mutating tool needs approval: ask the user via the dialog, then run the
  // approved ones. Approval + execution (e.g. docker.run pulling an image) can
  // take a while — voice latency is sacred, so we speak the ack NOW, before
  // waiting on the dialog or any tool work, then speak the outcome separately
  // once everything resolves (TOOLS.md §6.2 ack-then-async).
  if (result?.approvalRequired?.length) {
    const allowedPaths = toolCfg.allowedPaths.length ? toolCfg.allowedPaths : undefined
    if (result.reply) {
      try {
        await speakText(result.reply, getVoiceSettings().voiceboxProfile)
      } catch {
        // Voicebox down — the dialog still opens; the follow-up reply below
        // gets spoken normally by the caller once it's ready.
      }
    }
    const decisions = await requestApprovals(
      result.approvalRequired.map(a => ({
        approvalId: a.approvalId,
        toolName: a.toolName,
        args: a.args,
        preview: a.preview,
      }))
    )
    const outcomes: string[] = []
    for (const req of result.approvalRequired) {
      const approved = decisions[req.approvalId] === true
      const res = await approveTool(req.approvalId, approved, sessionId, allowedPaths)
      if (!approved) outcomes.push(`${req.toolName}: skipped (you declined)`)
      else if (res.ok) outcomes.push(`${req.toolName}: done`)
      else outcomes.push(`${req.toolName}: failed — ${res.error ?? 'error'}`)
    }
    return `${outcomes.join('. ')}.`
  }

  // Degraded / no reply / runtime down → fall back to the normal path. This
  // costs a SECOND full LLM generation on top of the failed loop — surface it
  // in Live Activity so silent 2x-latency turns are diagnosable, not invisible.
  if (!result || result.degraded || !result.reply) {
    logActivity(
      'tool',
      'Tool loop degraded — falling back to plain think()',
      'error',
      result?.reason ?? 'runtime unavailable'
    )
    return think(userMessage, history, vitals, signal, memoryContext)
  }
  return result.reply
}

export async function respondWithVoice(
  userMessage: string,
  history: ConversationTurn[] = [],
  vitals?: VitalsResponse | null
): Promise<string> {
  const reply = await think(userMessage, history, vitals)
  const settings = getVoiceSettings()
  await speakText(reply, settings.voiceboxProfile)
  return reply
}
