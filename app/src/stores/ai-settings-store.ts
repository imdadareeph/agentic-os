import { useCallback, useEffect, useState } from 'react'
import {
  AI_PROVIDER_REGISTRY,
  type AiProviderId,
} from '@/config/ai-providers'
import { loadJarvisSettings } from '@/stores/jarvis-settings-store'

export const AI_SETTINGS_SCHEMA_VERSION = 1
const STORAGE_KEY = 'agentic-os-ai-settings'

export interface AiProviderConfig {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
  systemInstructions: string
  metadata: Record<string, string>
}

export interface AiSettings {
  schemaVersion: number
  activeProvider: AiProviderId
  providers: Record<AiProviderId, AiProviderConfig>
}

function defaultProviderConfig(id: AiProviderId, modelOverride = ''): AiProviderConfig {
  const def = AI_PROVIDER_REGISTRY.find(p => p.id === id)!
  return {
    enabled: id === 'ollama',
    baseUrl: def.defaultUrl,
    apiKey: '',
    model: modelOverride || def.defaultModel,
    systemInstructions: def.defaultSystemInstructions,
    metadata: {},
  }
}

export function getDefaultAiSettings(): AiSettings {
  return {
    schemaVersion: AI_SETTINGS_SCHEMA_VERSION,
    activeProvider: 'ollama',
    providers: {
      ollama: defaultProviderConfig('ollama'),
      anthropic: defaultProviderConfig('anthropic'),
      gemini: defaultProviderConfig('gemini'),
    },
  }
}

function migrate(stored: Partial<AiSettings>): AiSettings {
  const defaults = getDefaultAiSettings()
  const merged: AiSettings = {
    ...defaults,
    ...stored,
    schemaVersion: AI_SETTINGS_SCHEMA_VERSION,
    providers: { ...defaults.providers },
  }

  for (const id of AI_PROVIDER_REGISTRY.map(p => p.id)) {
    merged.providers[id] = {
      ...defaults.providers[id],
      ...(stored.providers?.[id] ?? {}),
      metadata: {
        ...defaults.providers[id].metadata,
        ...(stored.providers?.[id]?.metadata ?? {}),
      },
    }
  }

  if ((stored.schemaVersion ?? 0) < 1) {
    const jarvis = loadJarvisSettings()
    if (jarvis.ollamaModel) {
      merged.providers.ollama.model = jarvis.ollamaModel
    }
  }

  return merged
}

export function loadAiSettings(): AiSettings {
  if (typeof window === 'undefined') return getDefaultAiSettings()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDefaultAiSettings()
    return migrate(JSON.parse(raw) as Partial<AiSettings>)
  } catch {
    return getDefaultAiSettings()
  }
}

export function saveAiSettings(partial: Partial<AiSettings>): AiSettings {
  const next = migrate({ ...loadAiSettings(), ...partial })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('ai-settings-changed', { detail: next }))
  return next
}

export function updateAiProvider(
  id: AiProviderId,
  partial: Partial<AiProviderConfig>
): AiSettings {
  const current = loadAiSettings()
  return saveAiSettings({
    providers: {
      ...current.providers,
      [id]: { ...current.providers[id], ...partial },
    },
  })
}

export function resetAiSettings(): AiSettings {
  localStorage.removeItem(STORAGE_KEY)
  const defaults = getDefaultAiSettings()
  window.dispatchEvent(new CustomEvent('ai-settings-changed', { detail: defaults }))
  return defaults
}

export function getAiSettings(): AiSettings {
  return loadAiSettings()
}

export function getActiveProviderConfig(): AiProviderConfig {
  const settings = loadAiSettings()
  return settings.providers[settings.activeProvider]
}

export function useAiSettings(): [AiSettings, (partial: Partial<AiSettings>) => void] {
  const [settings, setSettings] = useState(loadAiSettings)

  useEffect(() => {
    const onChange = (e: Event) => {
      setSettings((e as CustomEvent<AiSettings>).detail)
    }
    window.addEventListener('ai-settings-changed', onChange)
    return () => window.removeEventListener('ai-settings-changed', onChange)
  }, [])

  const update = useCallback((partial: Partial<AiSettings>) => {
    setSettings(saveAiSettings(partial))
  }, [])

  return [settings, update]
}
