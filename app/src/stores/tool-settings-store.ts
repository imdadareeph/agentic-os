import { useCallback, useEffect, useState } from 'react'

export const TOOL_SETTINGS_SCHEMA_VERSION = 1
const STORAGE_KEY = 'agentic-os-tool-settings'

export type ToolCategory =
  | 'memory'
  | 'system'
  | 'filesystem'
  | 'git'
  | 'docker'
  | 'terminal'
  | 'browser'
  | 'mcp'
export type DefaultPermission = 'cautious' | 'balanced' | 'trusted'

export interface ToolSettings {
  schemaVersion: number

  // Master
  toolsEnabled: boolean

  // Category toggles (T1 live: memory/system/filesystem/git/docker; rest later phases)
  categories: Record<ToolCategory, boolean>

  // Permission posture (T2 uses this; stored now for continuity)
  defaultPermission: DefaultPermission

  // Filesystem allowlist for read tools
  allowedPaths: string[]

  // Voice: only run fast tools inline (slow tools ack async — T2)
  inlineFastToolsOnly: boolean

  // Session scope
  toolsEnabledForSession: boolean
}

function defaultCategories(): Record<ToolCategory, boolean> {
  return {
    memory: true,
    system: true,
    filesystem: true,
    git: true,
    docker: true,
    terminal: false, // approval-gated; user opts in explicitly
    browser: false, // approval-gated + external network; user opts in explicitly
    mcp: false, // external servers; user opts in explicitly
  }
}

export function getDefaultToolSettings(): ToolSettings {
  return {
    schemaVersion: TOOL_SETTINGS_SCHEMA_VERSION,
    toolsEnabled: false, // opt-in — voice path is unchanged until the user enables tools
    categories: defaultCategories(),
    defaultPermission: 'balanced',
    allowedPaths: [],
    inlineFastToolsOnly: true,
    toolsEnabledForSession: true,
  }
}

function migrate(stored: Partial<ToolSettings>): ToolSettings {
  const defaults = getDefaultToolSettings()
  return {
    ...defaults,
    ...stored,
    categories: { ...defaults.categories, ...(stored.categories ?? {}) },
    schemaVersion: TOOL_SETTINGS_SCHEMA_VERSION,
  }
}

export function loadToolSettings(): ToolSettings {
  if (typeof window === 'undefined') return getDefaultToolSettings()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDefaultToolSettings()
    return migrate(JSON.parse(raw) as Partial<ToolSettings>)
  } catch {
    return getDefaultToolSettings()
  }
}

export function saveToolSettings(partial: Partial<ToolSettings>): ToolSettings {
  const next = migrate({ ...loadToolSettings(), ...partial })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('tool-settings-changed', { detail: next }))
  return next
}

export function resetToolSettings(): ToolSettings {
  localStorage.removeItem(STORAGE_KEY)
  const defaults = getDefaultToolSettings()
  window.dispatchEvent(new CustomEvent('tool-settings-changed', { detail: defaults }))
  return defaults
}

export function getToolSettings(): ToolSettings {
  return loadToolSettings()
}

/** Tools run only when master + session are both on. */
export function areToolsActive(): boolean {
  const s = getToolSettings()
  return s.toolsEnabled && s.toolsEnabledForSession
}

/** Enabled category names for catalog/plan filtering. */
export function enabledCategories(): ToolCategory[] {
  const s = getToolSettings()
  return (Object.keys(s.categories) as ToolCategory[]).filter(c => s.categories[c])
}

export function useToolSettings(): [ToolSettings, (partial: Partial<ToolSettings>) => void] {
  const [settings, setSettings] = useState(loadToolSettings)

  useEffect(() => {
    const onChange = (e: Event) => setSettings((e as CustomEvent<ToolSettings>).detail)
    window.addEventListener('tool-settings-changed', onChange)
    return () => window.removeEventListener('tool-settings-changed', onChange)
  }, [])

  const update = useCallback((partial: Partial<ToolSettings>) => {
    setSettings(saveToolSettings(partial))
  }, [])

  return [settings, update]
}
