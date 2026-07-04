import { useEffect, useState } from 'react'
import { Database, RotateCcw } from 'lucide-react'
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
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { getMemoryHealth, type MemoryHealth } from '@/services/memory'
import {
  getDefaultMemorySettings,
  resetMemorySettings,
  useMemorySettings,
  type MemorySettings,
} from '@/stores/memory-settings-store'

interface MemorySettingsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function Section({
  title,
  children,
  phase,
}: {
  title: string
  children?: React.ReactNode
  /** When set, section is disabled with a "ships in Phase X" note. */
  phase?: string
}) {
  return (
    <div
      className={`space-y-3 border-b border-white/10 pb-5 ${phase ? 'opacity-40 pointer-events-none select-none' : ''}`}
    >
      <h3 className="text-[10px] uppercase tracking-widest text-amber-400/70">
        {title}
        {phase && (
          <span className="ml-2 normal-case tracking-normal text-white/30">
            ships in Phase {phase}
          </span>
        )}
      </h3>
      {children}
    </div>
  )
}

function HealthPill({ label, state }: { label: string; state: boolean | null | undefined }) {
  const color =
    state === true ? 'bg-emerald-400' : state === false ? 'bg-red-400/80' : 'bg-white/20'
  const text =
    state === true ? 'text-white/55' : state === false ? 'text-red-400/70' : 'text-white/25'
  return (
    <span className="flex items-center gap-1 text-[9px] tracking-wider">
      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />
      <span className={text}>{label}</span>
    </span>
  )
}

export default function MemorySettingsSheet({ open, onOpenChange }: MemorySettingsSheetProps) {
  const [settings, update] = useMemorySettings()
  const [health, setHealth] = useState<MemoryHealth | null>(null)
  const [healthChecked, setHealthChecked] = useState(false)

  const set = <K extends keyof MemorySettings>(key: K, value: MemorySettings[K]) => {
    update({ [key]: value })
  }

  // Poll runtime health while the sheet is open (matches useServiceHealth's pattern).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const poll = async () => {
      const h = await getMemoryHealth()
      if (!cancelled) {
        setHealth(h)
        setHealthChecked(true)
      }
    }
    void poll()
    const interval = setInterval(() => void poll(), 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [open])

  const runtimeDown = healthChecked && health === null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-[#0a0a0a] border-white/10 text-white overflow-y-auto scrollbar-jarvis px-6"
      >
        <SheetHeader className="px-0">
          <SheetTitle className="text-white flex items-center gap-2">
            <Database size={16} className="text-amber-400" />
            Memory Settings
          </SheetTitle>
          <SheetDescription className="text-white/40">
            Persistent conversation memory via the Python runtime. Saved in this browser.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 pb-6">
          <Section title="Master">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-white/70">Enable memory</Label>
              <Switch
                checked={settings.memoryEnabled}
                onCheckedChange={v => set('memoryEnabled', v)}
              />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <HealthPill label="SQLite" state={health?.sqlite ?? null} />
              <HealthPill label="Chroma" state={health?.chroma} />
              <HealthPill label="Vault" state={health?.vault} />
              <HealthPill label="Sync" state={health?.sync} />
            </div>
            {runtimeDown && (
              <p className="text-[9px] text-red-400/70">
                Memory runtime offline — run npm run runtime:dev. Voice keeps working; turns are
                not persisted.
              </p>
            )}
          </Section>

          <Section title="Session">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-white/70">Memory for this session</Label>
              <Switch
                checked={settings.sessionMemoryEnabled}
                onCheckedChange={v => set('sessionMemoryEnabled', v)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label className="text-white/70">Incognito (no reads, no writes)</Label>
              <Switch
                checked={settings.incognitoMode}
                onCheckedChange={v => set('incognitoMode', v)}
              />
            </div>
            <p className="text-[9px] text-white/30">
              Session toggles reset when you start a NEW SESSION.
            </p>
          </Section>

          <Section title="Conversation">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-white/70">Enable layer</Label>
              <Switch
                checked={settings.conversationMemoryEnabled}
                onCheckedChange={v => set('conversationMemoryEnabled', v)}
              />
            </div>
            <div>
              <Label className="text-white/70 text-xs">
                Turn limit: {settings.conversationTurnLimit} turns
              </Label>
              <Slider
                className="mt-2"
                min={0}
                max={20}
                step={1}
                value={[settings.conversationTurnLimit]}
                onValueChange={([v]) => set('conversationTurnLimit', v)}
              />
              <p className="text-[9px] text-white/30 mt-1">
                Moved here from JARVIS Settings — one slider, one source of truth.
              </p>
            </div>
            <div>
              <Label className="text-white/70 text-xs">
                Retention: {settings.conversationRetentionDays} days
              </Label>
              <Slider
                className="mt-2"
                min={1}
                max={365}
                step={1}
                value={[settings.conversationRetentionDays]}
                onValueChange={([v]) => set('conversationRetentionDays', v)}
              />
            </div>
          </Section>

          <Section title="Semantic" phase="M2">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-white/70">Enable layer</Label>
              <Switch checked={settings.semanticMemoryEnabled} disabled />
            </div>
            <p className="text-[9px] text-white/30">
              Chroma top-k {settings.semanticTopK} · min score {settings.semanticMinScore} ·{' '}
              {settings.embeddingModel}
            </p>
          </Section>

          <Section title="Episodic (Obsidian)" phase="M3">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-white/70">Enable layer</Label>
              <Switch checked={settings.episodicMemoryEnabled} disabled />
            </div>
            <Input
              className="bg-white/5 border-white/10 text-white/50 text-xs"
              value={settings.vaultPath}
              disabled
            />
          </Section>

          <Section title="Procedural" phase="M4">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-white/70">Enable layer</Label>
              <Switch checked={settings.proceduralMemoryEnabled} disabled />
            </div>
          </Section>

          <Section title="Sync" phase="M2">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-white/70">Auto-sync vault → Chroma</Label>
              <Switch checked={settings.autoSyncEnabled} disabled />
            </div>
          </Section>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-white/40"
            onClick={() => resetMemorySettings()}
          >
            <RotateCcw size={14} className="mr-1" />
            Reset all memory settings
          </Button>
          <p className="text-[9px] text-white/20">
            Defaults: memory on, {getDefaultMemorySettings().conversationTurnLimit} turns,{' '}
            {getDefaultMemorySettings().conversationRetentionDays}-day retention. Runtime:{' '}
            npm run runtime:dev (port 8000).
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
