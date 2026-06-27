import { useEffect, useState } from 'react'
import { Settings, Volume2, RotateCcw } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { useServiceHealth } from '@/hooks/useServiceHealth'
import {
  resetVoiceSettings,
  useVoiceSettings,
  type VoiceSettings,
} from '@/stores/voice-settings-store'
import { listBrowserVoices } from '@/services/tts'
import { speakText } from '@/services/voice'
import { playJarvisSample, JARVIS_TEST_PHRASE } from '@/lib/jarvis-voice'
import { isSpeechRecognitionSupported } from '@/services/speech-recognition'

interface VoiceSettingsSheetProps {
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

export default function VoiceSettingsSheet({ open, onOpenChange }: VoiceSettingsSheetProps) {
  const [settings, update] = useVoiceSettings()
  const { voice, ollama, gitnexus, loading } = useServiceHealth()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [testStatus, setTestStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const load = () => setVoices(listBrowserVoices())
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [open])

  const set = <K extends keyof VoiceSettings>(key: K, value: VoiceSettings[K]) => {
    update({ [key]: value })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-[#0a0a0a] border-white/10 text-white overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="text-white flex items-center gap-2">
            <Settings size={16} className="text-amber-400" />
            Voice Settings
          </SheetTitle>
          <SheetDescription className="text-white/40">
            Conversation, STT, TTS, and service health. Saved in this browser.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <Section title="Conversation">
            <div className="flex items-center justify-between">
              <Label className="text-white/70">Mode</Label>
              <Select
                value={settings.voiceMode}
                onValueChange={v => set('voiceMode', v as VoiceSettings['voiceMode'])}
              >
                <SelectTrigger className="w-[160px] bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conversation">Conversation</SelectItem>
                  <SelectItem value="push">Push-to-talk</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-white/70 text-xs">
                Turn silence: {settings.turnSilenceMs}ms
              </Label>
              <Slider
                className="mt-2"
                min={600}
                max={2500}
                step={100}
                value={[settings.turnSilenceMs]}
                onValueChange={([v]) => set('turnSilenceMs', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-white/70">Whisper refine after turn</Label>
              <Switch
                checked={settings.whisperRefine}
                onCheckedChange={v => set('whisperRefine', v)}
              />
            </div>
          </Section>

          <Section title="Speech-to-text">
            <div className="flex items-center justify-between">
              <Label className="text-white/70">Live captions</Label>
              <span className="text-[10px] text-white/40">
                {isSpeechRecognitionSupported() ? 'Browser' : 'Unsupported'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-white/70">Final STT provider</Label>
              <Select
                value={settings.sttFinalProvider}
                onValueChange={v => set('sttFinalProvider', v as VoiceSettings['sttFinalProvider'])}
              >
                <SelectTrigger className="w-[160px] bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whisper">Whisper</SelectItem>
                  <SelectItem value="voicebox">Voicebox</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-white/70">Voicebox STT fallback</Label>
              <Switch
                checked={settings.voiceboxSttFallback}
                onCheckedChange={v => set('voiceboxSttFallback', v)}
              />
            </div>
            <Input
              className="bg-white/5 border-white/10"
              placeholder="Whisper model"
              value={settings.whisperModel}
              onChange={e => set('whisperModel', e.target.value)}
            />
          </Section>

          <Section title="JARVIS voice (TTS)">
            <div className="flex items-center justify-between">
              <Label className="text-white/70">TTS provider</Label>
              <Select
                value={settings.ttsProvider}
                onValueChange={v => set('ttsProvider', v as VoiceSettings['ttsProvider'])}
              >
                <SelectTrigger className="w-[160px] bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="browser">Browser</SelectItem>
                  <SelectItem value="voicebox">Voicebox</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select
              value={settings.browserVoiceName || '__auto__'}
              onValueChange={v =>
                set('browserVoiceName', v === '__auto__' ? '' : v)
              }
            >
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Browser voice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">Auto (English)</SelectItem>
                {voices.map(v => (
                  <SelectItem key={v.voiceURI} value={v.name}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div>
              <Label className="text-white/70 text-xs">Rate: {settings.ttsRate.toFixed(1)}</Label>
              <Slider
                className="mt-2"
                min={0.5}
                max={2}
                step={0.1}
                value={[settings.ttsRate]}
                onValueChange={([v]) => set('ttsRate', v)}
              />
            </div>
            <Input
              className="bg-white/5 border-white/10"
              placeholder="Voicebox profile name"
              value={settings.voiceboxProfile}
              onChange={e => set('voiceboxProfile', e.target.value)}
            />
            <p className="text-[9px] text-white/30">
              Create a Voicebox profile named &quot;{settings.voiceboxProfile}&quot; from
              jarvis-voice.wav for closest match to the sample.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/10 text-white/70"
                onClick={() => {
                  setTestStatus(null)
                  void playJarvisSample().catch(e =>
                    setTestStatus(e instanceof Error ? e.message : 'Sample failed')
                  )
                }}
              >
                <Volume2 size={14} className="mr-1" />
                Play sample
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/10 text-white/70"
                onClick={() => {
                  setTestStatus(null)
                  void speakText(JARVIS_TEST_PHRASE, settings.voiceboxProfile).catch(e =>
                    setTestStatus(e instanceof Error ? e.message : 'TTS failed')
                  )
                }}
              >
                Test JARVIS
              </Button>
            </div>
            {testStatus && <p className="text-[9px] text-red-400/80">{testStatus}</p>}
          </Section>

          <Section title="Services">
            {!loading && (
              <ul className="text-[10px] space-y-1.5 text-white/50 font-mono">
                <li>Whisper: {voice.sttModel ?? '—'} {voice.sttFallback ? '(fallback)' : ''}</li>
                <li>Live STT: {voice.liveSttReady ? 'ready' : 'off'}</li>
                <li>TTS: {voice.ttsModel ?? voice.ttsProvider}</li>
                <li>Ollama: {ollama ? 'online' : 'offline'}</li>
                <li>GitNexus: {gitnexus ? 'online' : 'offline'}</li>
                {voice.voicebox && (
                  <li>Voicebox: {voice.voicebox.online ? 'online' : 'offline'}</li>
                )}
              </ul>
            )}
            <div className="flex items-center justify-between">
              <Label className="text-white/70">Voicebox LLM fallback</Label>
              <Switch
                checked={settings.voiceboxEnabled}
                onCheckedChange={v => set('voiceboxEnabled', v)}
              />
            </div>
          </Section>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-white/40"
            onClick={() => resetVoiceSettings()}
          >
            <RotateCcw size={14} className="mr-1" />
            Reset to defaults
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
