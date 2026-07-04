import type { LucideIcon } from 'lucide-react'
import {
  AlertCircle,
  AudioLines,
  Brain,
  Circle,
  Mic,
  Moon,
  Pause,
} from 'lucide-react'
import type { VoiceMode } from '@/config/voice'
import type { ConversationPhase } from '@/hooks/useRealtimeConversation'
import type { VoicePhase } from '@/hooks/useVoiceAssistant'

export type JarvisDisplayStatus =
  | 'sleeping'
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'paused'
  | 'error'

export interface JarvisStatusInput {
  voiceMode: VoiceMode
  conversationActive: boolean
  conversationPaused: boolean
  phase: ConversationPhase | VoicePhase
}

export function resolveJarvisDisplayStatus(input: JarvisStatusInput): JarvisDisplayStatus {
  const { voiceMode, conversationActive, conversationPaused, phase } = input

  if (voiceMode === 'conversation') {
    if (conversationPaused) return 'paused'
    if (!conversationActive) return 'sleeping'
    if (phase === 'listening') return 'listening'
    if (phase === 'speaking') return 'speaking'
    if (phase === 'thinking' || phase === 'refining') return 'thinking'
    if (phase === 'error') return 'error'
    if (conversationActive && phase === 'idle') return 'idle'
    return 'idle'
  }

  if (phase === 'idle') return 'sleeping'
  if (phase === 'listening') return 'listening'
  if (phase === 'processing') return 'thinking'
  if (phase === 'speaking') return 'speaking'
  if (phase === 'error') return 'error'
  return 'sleeping'
}

export const JARVIS_STATUS_CONFIG: Record<
  JarvisDisplayStatus,
  { label: string; Icon: LucideIcon; pulse?: boolean; accentClass: string }
> = {
  sleeping: {
    label: 'Sleeping',
    Icon: Moon,
    accentClass: 'text-white/30',
  },
  idle: {
    label: 'Idle',
    Icon: Circle,
    accentClass: 'text-white/50',
  },
  listening: {
    label: 'Listening',
    Icon: Mic,
    pulse: true,
    accentClass: 'text-amber-300',
  },
  thinking: {
    label: 'Thinking',
    Icon: Brain,
    pulse: true,
    accentClass: 'text-amber-400',
  },
  speaking: {
    label: 'Speaking',
    Icon: AudioLines,
    pulse: true,
    accentClass: 'text-amber-300',
  },
  paused: {
    label: 'Paused',
    Icon: Pause,
    accentClass: 'text-amber-400/80',
  },
  error: {
    label: 'Error',
    Icon: AlertCircle,
    accentClass: 'text-red-400/80',
  },
}

export function getJarvisStatusLabel(status: JarvisDisplayStatus): string {
  return JARVIS_STATUS_CONFIG[status].label.toUpperCase()
}

export function isJarvisSessionOpen(input: JarvisStatusInput): boolean {
  if (input.voiceMode === 'conversation') {
    return input.conversationActive || input.conversationPaused
  }
  return input.phase !== 'idle' && input.phase !== 'error'
}
