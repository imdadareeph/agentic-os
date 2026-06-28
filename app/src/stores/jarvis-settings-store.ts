import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_JARVIS_SYSTEM_PROMPT } from '@/config/services'

export const JARVIS_SETTINGS_SCHEMA_VERSION = 1
const STORAGE_KEY = 'agentic-os-jarvis-settings'

export type JarvisPersonality = 'default' | 'technical' | 'casual' | 'executive'
export type JarvisFormality = 'neutral' | 'formal' | 'first_name'

export interface JarvisSettings {
  schemaVersion: number
  systemInstructions: string
  shortAnswers: boolean
  deepThinking: boolean
  ollamaModel: string
  temperature: number
  maxTokens: number
  conversationMemory: number
  personality: JarvisPersonality
  injectVitalsContext: boolean
  formality: JarvisFormality
}

export function getDefaultJarvisSettings(): JarvisSettings {
  return {
    schemaVersion: JARVIS_SETTINGS_SCHEMA_VERSION,
    systemInstructions: DEFAULT_JARVIS_SYSTEM_PROMPT,
    shortAnswers: true,
    deepThinking: false,
    ollamaModel: '',
    temperature: 0.7,
    maxTokens: 150,
    conversationMemory: 4,
    personality: 'default',
    injectVitalsContext: true,
    formality: 'neutral',
  }
}

function migrate(stored: Partial<JarvisSettings>): JarvisSettings {
  const defaults = getDefaultJarvisSettings()
  return { ...defaults, ...stored, schemaVersion: JARVIS_SETTINGS_SCHEMA_VERSION }
}

export function loadJarvisSettings(): JarvisSettings {
  if (typeof window === 'undefined') return getDefaultJarvisSettings()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDefaultJarvisSettings()
    return migrate(JSON.parse(raw) as Partial<JarvisSettings>)
  } catch {
    return getDefaultJarvisSettings()
  }
}

export function saveJarvisSettings(partial: Partial<JarvisSettings>): JarvisSettings {
  const next = migrate({ ...loadJarvisSettings(), ...partial })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('jarvis-settings-changed', { detail: next }))
  return next
}

export function resetJarvisSettings(): JarvisSettings {
  localStorage.removeItem(STORAGE_KEY)
  const defaults = getDefaultJarvisSettings()
  window.dispatchEvent(new CustomEvent('jarvis-settings-changed', { detail: defaults }))
  return defaults
}

export function getJarvisSettings(): JarvisSettings {
  return loadJarvisSettings()
}

export function useJarvisSettings(): [JarvisSettings, (partial: Partial<JarvisSettings>) => void] {
  const [settings, setSettings] = useState(loadJarvisSettings)

  useEffect(() => {
    const onChange = (e: Event) => {
      setSettings((e as CustomEvent<JarvisSettings>).detail)
    }
    window.addEventListener('jarvis-settings-changed', onChange)
    return () => window.removeEventListener('jarvis-settings-changed', onChange)
  }, [])

  const update = useCallback((partial: Partial<JarvisSettings>) => {
    setSettings(saveJarvisSettings(partial))
  }, [])

  return [settings, update]
}
