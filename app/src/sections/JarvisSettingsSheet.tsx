import { useState } from 'react'
import { Brain, RotateCcw, Sparkles } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { think } from '@/services/jarvis'
import { DEFAULT_JARVIS_SYSTEM_PROMPT } from '@/config/services'
import {
  getDefaultJarvisSettings,
  resetJarvisSettings,
  useJarvisSettings,
  type JarvisSettings,
} from '@/stores/jarvis-settings-store'
import { useAiSettings } from '@/stores/ai-settings-store'
import { buildSystemPrompt, isReasoningModelName } from '@/lib/jarvis-prompt'
import type { VitalsResponse } from '@/types/vitals'

interface JarvisSettingsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vitalsSnapshot?: VitalsResponse | null
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 border-b border-white/10 pb-5">
      <h3 className="text-[10px] uppercase tracking-widest text-amber-400/70">{title}</h3>
      {children}
    </div>
  )
}

export default function JarvisSettingsSheet({
  open,
  onOpenChange,
  vitalsSnapshot = null,
}: JarvisSettingsSheetProps) {
  const [settings, update] = useJarvisSettings()
  const [aiSettings] = useAiSettings()
  const [testPrompt, setTestPrompt] = useState('What is your status?')
  const [testReply, setTestReply] = useState<string | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)

  const set = <K extends keyof JarvisSettings>(key: K, value: JarvisSettings[K]) => {
    update({ [key]: value })
  }

  const activeModel =
    aiSettings.activeProvider === 'ollama'
      ? aiSettings.providers.ollama.model
      : aiSettings.providers[aiSettings.activeProvider].model

  const showReasoningHint =
    settings.deepThinking &&
    aiSettings.activeProvider === 'ollama' &&
    activeModel &&
    !isReasoningModelName(activeModel)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-[#0a0a0a] border-white/10 text-white overflow-y-auto scrollbar-jarvis px-6"
      >
        <SheetHeader className="px-0">
          <SheetTitle className="text-white flex items-center gap-2">
            <Brain size={16} className="text-amber-400" />
            JARVIS Settings
          </SheetTitle>
          <SheetDescription className="text-white/40">
            Additional instructions and behavior layered on the active AI provider. Saved in this
            browser.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 pb-6">
          <Section title="Additional instructions">
            <p className="text-[9px] text-white/30">
              Layered on top of the active provider&apos;s system instructions in AI Settings.
            </p>
            <Textarea
              className="min-h-[140px] bg-white/5 border-white/10 text-white/80 text-xs leading-relaxed font-mono"
              value={settings.systemInstructions}
              onChange={e => set('systemInstructions', e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/10 text-white/70"
              onClick={() => set('systemInstructions', DEFAULT_JARVIS_SYSTEM_PROMPT)}
            >
              Reset instructions to default
            </Button>
          </Section>

          <Section title="Behavior">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-white/70">Short answers (voice-friendly)</Label>
              <Switch
                checked={settings.shortAnswers}
                onCheckedChange={v => set('shortAnswers', v)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label className="text-white/70">Deep thinking (Ollama think mode)</Label>
              <Switch
                checked={settings.deepThinking}
                onCheckedChange={v => set('deepThinking', v)}
              />
            </div>
            {showReasoningHint && (
              <p className="text-[9px] text-amber-400/70">
                Reasoning model recommended (e.g. deepseek-r1, qwen3) for deep thinking — set in AI
                Settings.
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <Label className="text-white/70">Show model in status bar</Label>
              <Switch
                checked={settings.showModelInStatusBar}
                onCheckedChange={v => set('showModelInStatusBar', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-white/70">Personality</Label>
              <Select
                value={settings.personality}
                onValueChange={v => set('personality', v as JarvisSettings['personality'])}
              >
                <SelectTrigger className="w-[160px] bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="executive">Executive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-white/70">Formality</Label>
              <Select
                value={settings.formality}
                onValueChange={v => set('formality', v as JarvisSettings['formality'])}
              >
                <SelectTrigger className="w-[160px] bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="first_name">Warm / colleague</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Section>

          <Section title="Inference">
            <div>
              <Label className="text-white/70 text-xs">
                Temperature: {settings.temperature.toFixed(1)}
              </Label>
              <Slider
                className="mt-2"
                min={0.1}
                max={1}
                step={0.1}
                value={[settings.temperature]}
                onValueChange={([v]) => set('temperature', v)}
              />
            </div>
            <div>
              <Label className="text-white/70 text-xs">Max tokens: {settings.maxTokens}</Label>
              <Slider
                className="mt-2"
                min={50}
                max={800}
                step={10}
                value={[settings.maxTokens]}
                onValueChange={([v]) => set('maxTokens', v)}
              />
            </div>
            <div>
              <Label className="text-white/70 text-xs">
                Conversation memory: {settings.conversationMemory} turns
              </Label>
              <Slider
                className="mt-2"
                min={0}
                max={10}
                step={1}
                value={[settings.conversationMemory]}
                onValueChange={([v]) => set('conversationMemory', v)}
              />
            </div>
          </Section>

          <Section title="Context">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-white/70">Inject vitals into system prompt</Label>
              <Switch
                checked={settings.injectVitalsContext}
                onCheckedChange={v => set('injectVitalsContext', v)}
              />
            </div>
            {settings.injectVitalsContext && vitalsSnapshot && (
              <p className="text-[9px] text-white/30 font-mono leading-relaxed">
                Preview: {buildSystemPrompt(settings, vitalsSnapshot).split('\n\n').pop()}
              </p>
            )}
          </Section>

          <Section title="Test">
            <Input
              className="bg-white/5 border-white/10 text-white/80"
              value={testPrompt}
              onChange={e => setTestPrompt(e.target.value)}
              placeholder="Ask JARVIS something…"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/10 text-white/70"
              disabled={testLoading || !testPrompt.trim()}
              onClick={() => {
                setTestLoading(true)
                setTestReply(null)
                setTestError(null)
                void think(testPrompt.trim(), [], vitalsSnapshot)
                  .then(reply => setTestReply(reply))
                  .catch(e =>
                    setTestError(e instanceof Error ? e.message : 'Request failed')
                  )
                  .finally(() => setTestLoading(false))
              }}
            >
              <Sparkles size={14} className="mr-1" />
              {testLoading ? 'Thinking…' : 'Ask JARVIS'}
            </Button>
            {testReply && (
              <p className="text-[10px] text-amber-100/70 leading-relaxed border border-white/10 p-2">
                {testReply}
              </p>
            )}
            {testError && <p className="text-[9px] text-red-400/80">{testError}</p>}
          </Section>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-white/40"
            onClick={() => {
              resetJarvisSettings()
              setTestReply(null)
              setTestError(null)
            }}
          >
            <RotateCcw size={14} className="mr-1" />
            Reset all JARVIS settings
          </Button>
          <p className="text-[9px] text-white/20">
            Defaults: short answers on, memory {getDefaultJarvisSettings().conversationMemory}{' '}
            turns, vitals context on. Model selection is in AI Settings.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
