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
import {
  areToolsActive,
  enabledCategories,
  getToolSettings,
} from '@/stores/tool-settings-store'
import { planTools, runToolLoop, approveTool } from '@/services/tools'
import { requestApprovals } from '@/lib/tool-approval-broker'
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
  // Only Anthropic runs the native tool loop for now; else normal chat.
  if (providerId !== 'anthropic' || !cfg.apiKey) {
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
    apiKey: cfg.apiKey,
    model: cfg.model || undefined,
    baseUrl: cfg.baseUrl,
    maxTokens: effectiveMaxTokens(settings),
    temperature: settings.temperature,
    posture: toolCfg.defaultPermission,
  })

  // A mutating tool needs approval: ask the user via the dialog, then run the
  // approved ones. The loop is paused server-side; we speak the outcome.
  if (result?.approvalRequired?.length) {
    const allowedPaths = toolCfg.allowedPaths.length ? toolCfg.allowedPaths : undefined
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
    const ack = result.reply ? `${result.reply}\n` : ''
    return `${ack}${outcomes.join('. ')}.`
  }

  // Degraded / no reply / runtime down → fall back to the normal path.
  if (!result || result.degraded || !result.reply) {
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
