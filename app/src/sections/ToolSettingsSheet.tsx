import { useEffect, useState } from 'react'
import { Wrench, RotateCcw } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import {
  getToolsHealth,
  executeTool,
  type ToolsHealth,
  type ToolExecuteResult,
} from '@/services/tools'
import {
  getDefaultToolSettings,
  resetToolSettings,
  useToolSettings,
  type ToolCategory,
  type ToolSettings,
} from '@/stores/tool-settings-store'

interface ToolSettingsSheetProps {
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
  phase?: string
}) {
  return (
    <div
      className={`space-y-3 border-b border-white/10 pb-5 ${phase ? 'opacity-40 pointer-events-none select-none' : ''}`}
    >
      <h3 className="text-[10px] uppercase tracking-widest text-amber-400/70">
        {title}
        {phase && (
          <span className="ml-2 normal-case tracking-normal text-white/30">ships in {phase}</span>
        )}
      </h3>
      {children}
    </div>
  )
}

// Categories live in T1 vs. gated for later phases.
const LIVE_CATEGORIES: { key: ToolCategory; label: string }[] = [
  { key: 'memory', label: 'Memory' },
  { key: 'system', label: 'System' },
  { key: 'filesystem', label: 'Filesystem (read + write)' },
  { key: 'git', label: 'Git (read + commit)' },
  { key: 'docker', label: 'Docker (read + run/stop)' },
  { key: 'terminal', label: 'Terminal (approval-gated)' },
  { key: 'browser', label: 'Browser (search + fetch, approval-gated)' },
  { key: 'mcp', label: 'MCP (external servers, approval-gated)' },
]

export default function ToolSettingsSheet({ open, onOpenChange }: ToolSettingsSheetProps) {
  const [settings, update] = useToolSettings()
  const [health, setHealth] = useState<ToolsHealth | null>(null)
  const [debugTool, setDebugTool] = useState('git.status')
  const [debugResult, setDebugResult] = useState<ToolExecuteResult | null>(null)
  const [debugLoading, setDebugLoading] = useState(false)

  const set = <K extends keyof ToolSettings>(key: K, value: ToolSettings[K]) => update({ [key]: value })
  const setCategory = (c: ToolCategory, v: boolean) =>
    update({ categories: { ...settings.categories, [c]: v } })

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const poll = async () => {
      const h = await getToolsHealth()
      if (!cancelled) setHealth(h)
    }
    void poll()
    const interval = setInterval(() => void poll(), 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [open])

  const runtimeDown = health === null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-[#0a0a0a] border-white/10 text-white overflow-y-auto scrollbar-jarvis px-6"
      >
        <SheetHeader className="px-0">
          <SheetTitle className="text-white flex items-center gap-2">
            <Wrench size={16} className="text-amber-400" />
            Tool Settings
          </SheetTitle>
          <SheetDescription className="text-white/40">
            Let JARVIS call runtime tools during conversation. Off by default. Saved in this browser.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 pb-6">
          <Section title="Master">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-white/70">Enable tools</Label>
              <Switch checked={settings.toolsEnabled} onCheckedChange={v => set('toolsEnabled', v)} />
            </div>
            <p className="text-[9px] text-white/40">
              {runtimeDown
                ? 'Runtime offline — run npm run runtime:dev. Voice keeps working.'
                : `${health?.toolCount ?? 0} tools loaded.`}
            </p>
            {health?.mcpServers && Object.keys(health.mcpServers).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(health.mcpServers).map(([name, healthy]) => (
                  <span
                    key={name}
                    className={`text-[9px] tracking-wide px-1.5 py-0.5 rounded border ${
                      healthy
                        ? 'border-emerald-500/30 text-emerald-300/80'
                        : 'border-red-500/30 text-red-300/70'
                    }`}
                  >
                    mcp.{name} {healthy ? 'online' : 'degraded'}
                  </span>
                ))}
              </div>
            )}
          </Section>

          <Section title="Categories">
            {LIVE_CATEGORIES.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <Label className="text-white/70">
                  {label}
                  {health?.categories?.[key] != null && (
                    <span className="ml-2 text-white/30">{health.categories[key]}</span>
                  )}
                </Label>
                <Switch
                  checked={settings.categories[key]}
                  onCheckedChange={v => setCategory(key, v)}
                />
              </div>
            ))}
          </Section>

          <Section title="Permission posture">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-white/70 text-xs">
                {settings.defaultPermission} — mutating tools{' '}
                {settings.defaultPermission === 'trusted' ? 'auto-run' : 'need approval'}
              </Label>
              <div className="flex gap-1">
                {(['cautious', 'balanced', 'trusted'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => set('defaultPermission', p)}
                    className={`rounded px-2 py-1 text-[10px] transition-colors ${
                      settings.defaultPermission === p
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[9px] text-white/30">
              Destructive shell commands are always refused, even in trusted.
            </p>
          </Section>

          <Section title="Paths (filesystem allowlist)">
            <Input
              className="bg-white/5 border-white/10 text-white/80 text-xs font-mono"
              value={settings.allowedPaths.join(', ')}
              placeholder="repo root + ~/jarvis (default)"
              onChange={e =>
                set(
                  'allowedPaths',
                  e.target.value
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean)
                )
              }
            />
            <p className="text-[9px] text-white/30">
              Empty = runtime default (repo root + ~/jarvis). Reads outside these roots are refused.
            </p>
          </Section>

          <Section title="Session">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-white/70">Tools for this session</Label>
              <Switch
                checked={settings.toolsEnabledForSession}
                onCheckedChange={v => set('toolsEnabledForSession', v)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label className="text-white/70">Inline fast tools only</Label>
              <Switch
                checked={settings.inlineFastToolsOnly}
                onCheckedChange={v => set('inlineFastToolsOnly', v)}
              />
            </div>
          </Section>

          <Section title="Debug">
            <Input
              className="bg-white/5 border-white/10 text-white/80 text-xs font-mono"
              value={debugTool}
              onChange={e => setDebugTool(e.target.value)}
              placeholder="tool name e.g. git.status"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/10 text-white/70"
              disabled={debugLoading || !debugTool.trim()}
              onClick={() => {
                setDebugLoading(true)
                setDebugResult(null)
                void executeTool(debugTool.trim(), {}, settings.allowedPaths)
                  .then(r => setDebugResult(r))
                  .finally(() => setDebugLoading(false))
              }}
            >
              {debugLoading ? 'Running…' : 'Run tool'}
            </Button>
            {debugResult && (
              <pre className="text-[9px] text-white/50 border border-white/10 p-2 overflow-x-auto max-h-40">
                {JSON.stringify(debugResult.ok ? debugResult.data : debugResult.error, null, 2)}
              </pre>
            )}
          </Section>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-white/40"
            onClick={() => resetToolSettings()}
          >
            <RotateCcw size={14} className="mr-1" />
            Reset all tool settings
          </Button>
          <p className="text-[9px] text-white/20">
            Default: tools off. {getDefaultToolSettings().defaultPermission} permission posture.
            Runtime: npm run runtime:dev (port 8000).
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
