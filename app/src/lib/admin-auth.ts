import { isValidAdminCode } from '@/stores/ai-settings-store'

const SHUTDOWN_PATTERN = /\b(shutdown|terminate)\b/i
const FILLER_WORDS = new Set(['please', 'jarvis', 'now', 'sir', 'the', 'a'])
const ALLOWED_AFTER_COMMAND = new Set([
  'please',
  'now',
  'sir',
  'jarvis',
  'session',
  'call',
])

/** Conservative match: short utterances where shutdown/terminate is the primary intent. */
export function isShutdownIntent(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  if (!SHUTDOWN_PATTERN.test(normalized)) return false

  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length > 4) return false

  const commandIdx = words.findIndex(w => w === 'shutdown' || w === 'terminate')
  if (commandIdx === -1) return false

  if (words.length === 1) return true

  const afterCommand = words.slice(commandIdx + 1)
  if (
    afterCommand.length > 0 &&
    !afterCommand.every(w => ALLOWED_AFTER_COMMAND.has(w))
  ) {
    return false
  }

  const beforeCommand = words.slice(0, commandIdx)
  return beforeCommand.every(w => FILLER_WORDS.has(w))
}

export function extractAdminCode(text: string): string | null {
  const digits = text.replace(/\D/g, '')
  if (digits.length >= 4) return digits.slice(0, 4)
  if (digits.length >= 3) return digits.slice(0, 3)
  return null
}

export function matchesAdminCode(spoken: string, configured: string): boolean {
  if (!isValidAdminCode(configured)) return false
  const extracted = extractAdminCode(spoken)
  if (!extracted) return false
  if (extracted === configured) return true
  // STT often drops the last digit when the user speaks a 4-digit code.
  if (extracted.length === 3 && configured.length === 4) {
    return configured.startsWith(extracted)
  }
  return false
}
