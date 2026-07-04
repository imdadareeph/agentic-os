import { useCallback, useEffect, useState } from 'react'
import { getJarvisSettings } from '@/stores/jarvis-settings-store'

export const MEMORY_SETTINGS_SCHEMA_VERSION = 1
const STORAGE_KEY = 'agentic-os-memory-settings'

export type EmbeddingProvider = 'ollama' | 'openai'

export interface MemorySettings {
  schemaVersion: number

  // User level — master
  memoryEnabled: boolean

  // User level — layers
  conversationMemoryEnabled: boolean
  semanticMemoryEnabled: boolean
  episodicMemoryEnabled: boolean
  proceduralMemoryEnabled: boolean

  // User level — conversation
  /** Migrated from JarvisSettings.conversationMemory — one slider, one source of truth. */
  conversationTurnLimit: number
  conversationRetentionDays: number

  // User level — semantic (ships in Phase M2)
  semanticTopK: number
  semanticMinScore: number
  semanticMaxTokens: number
  embeddingProvider: EmbeddingProvider
  embeddingModel: string

  // User level — episodic (ships in Phase M3)
  vaultPath: string
  allowAgentWrites: boolean
  episodicNamespace: string

  // User level — procedural (ships in Phase M4)
  proceduralRetentionDays: number

  // User level — sync (ships in Phase M2)
  autoSyncEnabled: boolean
  syncIntervalMinutes: number

  // Session level — scoped to one conversation; NEW SESSION resets both
  sessionMemoryEnabled: boolean
  incognitoMode: boolean
}

export function getDefaultMemorySettings(): MemorySettings {
  return {
    schemaVersion: MEMORY_SETTINGS_SCHEMA_VERSION,
    memoryEnabled: true,
    conversationMemoryEnabled: true,
    semanticMemoryEnabled: false,
    episodicMemoryEnabled: false,
    proceduralMemoryEnabled: false,
    conversationTurnLimit: 4,
    conversationRetentionDays: 30,
    semanticTopK: 3,
    semanticMinScore: 0.65,
    semanticMaxTokens: 800,
    embeddingProvider: 'ollama',
    embeddingModel: 'nomic-embed-text',
    vaultPath: '~/jarvis/vault',
    allowAgentWrites: true,
    episodicNamespace: 'agents/',
    proceduralRetentionDays: 90,
    autoSyncEnabled: true,
    syncIntervalMinutes: 15,
    sessionMemoryEnabled: true,
    incognitoMode: false,
  }
}

/**
 * One-time migration: JarvisSettings.conversationMemory → conversationTurnLimit.
 * Same pattern as the ollamaModel → AI Settings migration in jarvis-settings-store.
 */
function migrateConversationMemoryFromJarvisSettings(): number | null {
  try {
    const jarvis = getJarvisSettings()
    if (typeof jarvis.conversationMemory === 'number') {
      return Math.max(0, jarvis.conversationMemory)
    }
  } catch {
    // Jarvis settings unreadable — fall back to defaults.
  }
  return null
}

function migrate(stored: Partial<MemorySettings>): MemorySettings {
  const defaults = getDefaultMemorySettings()
  const version = stored.schemaVersion ?? 0

  let conversationTurnLimit = stored.conversationTurnLimit
  if (version < 1 && conversationTurnLimit === undefined) {
    conversationTurnLimit =
      migrateConversationMemoryFromJarvisSettings() ?? defaults.conversationTurnLimit
  }

  return {
    ...defaults,
    ...stored,
    conversationTurnLimit: conversationTurnLimit ?? defaults.conversationTurnLimit,
    schemaVersion: MEMORY_SETTINGS_SCHEMA_VERSION,
  }
}

export function loadMemorySettings(): MemorySettings {
  if (typeof window === 'undefined') return getDefaultMemorySettings()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return migrate({})
    return migrate(JSON.parse(raw) as Partial<MemorySettings>)
  } catch {
    return getDefaultMemorySettings()
  }
}

export function saveMemorySettings(partial: Partial<MemorySettings>): MemorySettings {
  const next = migrate({ ...loadMemorySettings(), ...partial })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('memory-settings-changed', { detail: next }))
  return next
}

export function resetMemorySettings(): MemorySettings {
  localStorage.removeItem(STORAGE_KEY)
  const defaults = getDefaultMemorySettings()
  window.dispatchEvent(new CustomEvent('memory-settings-changed', { detail: defaults }))
  return defaults
}

export function getMemorySettings(): MemorySettings {
  return loadMemorySettings()
}

/** memory.md §4.1 effective rule — persistence happens only when every gate is open. */
export function isMemoryPersistenceEnabled(): boolean {
  const s = getMemorySettings()
  return s.memoryEnabled && s.sessionMemoryEnabled && !s.incognitoMode
}

/** Reset session-scoped toggles (called on NEW SESSION). */
export function resetSessionMemoryFlags(): void {
  saveMemorySettings({ sessionMemoryEnabled: true, incognitoMode: false })
}

export function useMemorySettings(): [
  MemorySettings,
  (partial: Partial<MemorySettings>) => void,
] {
  const [settings, setSettings] = useState(loadMemorySettings)

  useEffect(() => {
    const onChange = (e: Event) => {
      setSettings((e as CustomEvent<MemorySettings>).detail)
    }
    window.addEventListener('memory-settings-changed', onChange)
    return () => window.removeEventListener('memory-settings-changed', onChange)
  }, [])

  const update = useCallback((partial: Partial<MemorySettings>) => {
    setSettings(saveMemorySettings(partial))
  }, [])

  return [settings, update]
}
