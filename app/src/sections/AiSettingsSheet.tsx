import { useEffect, useState } from 'react'
import { Cpu, ChevronDown, ChevronRight, RotateCcw, Zap } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  AI_PROVIDER_REGISTRY,
  type AiProviderId,
} from '@/config/ai-providers'
import { getOllamaModels } from '@/services/llm/ollama'
import { checkProviderHealth } from '@/services/llm/router'
import {
  getDefaultAiSettings,
  resetAiSettings,
  updateAiProvider,
  useAiSettings,
  type AiProviderConfig,
} from '@/stores/ai-settings-store'

interface AiSettingsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 border-b border-white/10 pb-5">
      <h3 className="text-[10px] uppercase tracking-widest text-amber-400/70">{title}</h3>
      {children}
    </div>
  )
}

function ProviderPanel({
  id,
  config,
  expanded,
  onToggleExpand,
  onUpdate,
}: {
  id: AiProviderId
  config: AiProviderConfig
  expanded: boolean
  onToggleExpand: () => void
  onUpdate: (partial: Partial<AiProviderConfig>) => void
}) {
  const def = AI_PROVIDER_REGISTRY.find(p => p.id === id)!
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [testStatus, setTestStatus] = useState<string | null>(null)
  const [testLoading, setTestLoading] = useState(false)

  useEffect(() => {
    if (!expanded || id !== 'ollama') return
    void getOllamaModels(config.baseUrl).then(setOllamaModels)
  }, [expanded, id, config.baseUrl])

  const set = <K extends keyof AiProviderConfig>(key: K, value: AiProviderConfig[K]) => {
    onUpdate({ [key]: value })
  }

  return (
    <div className="border border-white/10 rounded-md overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
        onClick={onToggleExpand}
      >
        <span className="flex items-center gap-2 text-xs text-white/80">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {def.label}
        </span>
        <span
          className={`text-[9px] ${config.enabled ? 'text-emerald-400/70' : 'text-white/25'}`}
        >
          {config.enabled ? 'enabled' : 'disabled'}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-white/10 pt-3">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-white/70">Enabled</Label>
            <Switch checked={config.enabled} onCheckedChange={v => set('enabled', v)} />
          </div>

          <div>
            <Label className="text-white/70 text-xs">Base URL</Label>
            <Input
              className="mt-1 bg-white/5 border-white/10 text-white/80 text-xs font-mono"
              value={config.baseUrl}
              onChange={e => set('baseUrl', e.target.value)}
            />
          </div>

          <div>
            <Label className="text-white/70 text-xs">
              API key {def.requiresApiKey ? '' : '(optional)'}
            </Label>
            <Input
              type="password"
              className="mt-1 bg-white/5 border-white/10 text-white/80 text-xs font-mono"
              value={config.apiKey}
              onChange={e => set('apiKey', e.target.value)}
              placeholder={def.requiresApiKey ? 'Required for this provider' : 'Not required for Ollama'}
            />
            <p className="text-[9px] text-white/25 mt-1">Stored in this browser only.</p>
          </div>

          <div>
            <Label className="text-white/70 text-xs">Model</Label>
            {id === 'ollama' ? (
              <Select
                value={config.model || '__auto__'}
                onValueChange={v => set('model', v === '__auto__' ? '' : v)}
              >
                <SelectTrigger className="mt-1 w-full bg-white/5 border-white/10">
                  <SelectValue placeholder="Auto (first available)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto (first available)</SelectItem>
                  {ollamaModels.map(m => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                className="mt-1 bg-white/5 border-white/10 text-white/80 text-xs font-mono"
                value={config.model}
                onChange={e => set('model', e.target.value)}
                placeholder={def.defaultModel}
              />
            )}
          </div>

          <div>
            <Label className="text-white/70 text-xs">System instructions (provider persona)</Label>
            <Textarea
              className="mt-1 min-h-[100px] bg-white/5 border-white/10 text-white/80 text-xs leading-relaxed font-mono"
              value={config.systemInstructions}
              onChange={e => set('systemInstructions', e.target.value)}
            />
          </div>

          <div>
            <Label className="text-white/70 text-xs">Notes (metadata)</Label>
            <Input
              className="mt-1 bg-white/5 border-white/10 text-white/80 text-xs"
              value={config.metadata.notes ?? ''}
              onChange={e =>
                set('metadata', { ...config.metadata, notes: e.target.value })
              }
              placeholder="Optional notes for this provider"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/10 text-white/70"
            disabled={testLoading}
            onClick={() => {
              setTestLoading(true)
              setTestStatus(null)
              void checkProviderHealth(id, config)
                .then(h => {
                  setTestStatus(
                    h.online
                      ? `Connected${h.model ? ` · ${h.model}` : ''}`
                      : h.error ?? 'Unreachable'
                  )
                })
                .catch(e =>
                  setTestStatus(e instanceof Error ? e.message : 'Test failed')
                )
                .finally(() => setTestLoading(false))
            }}
          >
            <Zap size={14} className="mr-1" />
            {testLoading ? 'Testing…' : 'Test connection'}
          </Button>
          {testStatus && (
            <p
              className={`text-[9px] ${
                testStatus.startsWith('Connected') ? 'text-emerald-400/80' : 'text-red-400/80'
              }`}
            >
              {testStatus}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function AiSettingsSheet({ open, onOpenChange }: AiSettingsSheetProps) {
  const [settings, update] = useAiSettings()
  const [expanded, setExpanded] = useState<AiProviderId>('ollama')

  useEffect(() => {
    if (open) setExpanded(settings.activeProvider)
  }, [open, settings.activeProvider])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-[#0a0a0a] border-white/10 text-white overflow-y-auto scrollbar-jarvis px-6"
      >
        <SheetHeader className="px-0">
          <SheetTitle className="text-white flex items-center gap-2">
            <Cpu size={16} className="text-amber-400" />
            AI Settings
          </SheetTitle>
          <SheetDescription className="text-white/40">
            LLM providers, models, and base system instructions. Saved in this browser.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 pb-6">
          <Section title="Active provider">
            <div className="space-y-2">
              {AI_PROVIDER_REGISTRY.map(def => (
                <label
                  key={def.id}
                  className="flex items-center gap-2 cursor-pointer text-xs text-white/70"
                >
                  <input
                    type="radio"
                    name="activeProvider"
                    checked={settings.activeProvider === def.id}
                    onChange={() => update({ activeProvider: def.id })}
                    className="accent-amber-400"
                  />
                  {def.label}
                </label>
              ))}
            </div>
          </Section>

          <Section title="Providers">
            <div className="space-y-2">
              {AI_PROVIDER_REGISTRY.map(def => (
                <ProviderPanel
                  key={def.id}
                  id={def.id}
                  config={settings.providers[def.id]}
                  expanded={expanded === def.id}
                  onToggleExpand={() => setExpanded(def.id)}
                  onUpdate={partial => {
                    updateAiProvider(def.id, partial)
                  }}
                />
              ))}
            </div>
          </Section>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-white/40"
            onClick={() => resetAiSettings()}
          >
            <RotateCcw size={14} className="mr-1" />
            Reset all AI settings
          </Button>
          <p className="text-[9px] text-white/20">
            Default active provider: {getDefaultAiSettings().activeProvider}. JARVIS additional
            instructions layer on top of the provider base prompt.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
