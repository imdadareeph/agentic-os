/** Local service endpoints — proxied via Vite in dev (see vite.config.ts). */
export const OLLAMA_BASE = '/ollama'
export const GITNEXUS_BASE = '/gitnexus'

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = import.meta.env[name]
  if (raw === undefined || raw === '') return defaultValue
  return raw === 'true' || raw === '1'
}

/** When false, skip GitNexus health probes (avoids Vite proxy errors if :4747 is down). */
export const GITNEXUS_ENABLED = envFlag('VITE_GITNEXUS_ENABLED', false)

/** @deprecated Use VOICE_CONFIG.voicebox.profile — kept for jarvis imports */
export const JARVIS_VOICE_PROFILE = 'Jarvis'

export const DEFAULT_JARVIS_SYSTEM_PROMPT = `You are JARVIS, the voice assistant for Agentic OS — a local AI command center.
Be concise, confident, and calm. Answer in 1–3 sentences unless the user asks for detail.
You help with knowledge, tasks, code questions, and running automations.`

/** @deprecated Use DEFAULT_JARVIS_SYSTEM_PROMPT */
export const JARVIS_SYSTEM_PROMPT = DEFAULT_JARVIS_SYSTEM_PROMPT
