/** Local service endpoints — proxied via Vite in dev (see vite.config.ts). */
export const OLLAMA_BASE = '/ollama'
export const GITNEXUS_BASE = '/gitnexus'

/** @deprecated Use VOICE_CONFIG.voicebox.profile — kept for jarvis imports */
export const JARVIS_VOICE_PROFILE = 'Jarvis'

export const JARVIS_SYSTEM_PROMPT = `You are JARVIS, the voice assistant for Agentic OS — a local AI command center.
Be concise, confident, and calm. Answer in 1–3 sentences unless the user asks for detail.
You help with knowledge, tasks, code questions, and running automations.`
