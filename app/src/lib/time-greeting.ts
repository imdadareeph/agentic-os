export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

export function getTimeOfDay(date = new Date()): TimeOfDay {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'night'
}

export function getTimeOfDayGreeting(date = new Date()): string {
  switch (getTimeOfDay(date)) {
    case 'morning':
      return 'Good morning'
    case 'afternoon':
      return 'Good afternoon'
    case 'evening':
      return 'Good evening'
    case 'night':
      return 'Hello'
  }
}

export function formatCurrentDateTime(date = new Date()): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

export function buildTimeContextBlock(date = new Date()): string {
  const greeting = getTimeOfDayGreeting(date)
  return (
    `Current local date and time: ${formatCurrentDateTime(date)}. ` +
    `Appropriate greeting for now: "${greeting}". ` +
    'Use this clock for time-aware greetings, scheduling, and relative time questions.'
  )
}

export function buildSessionGreeting(date = new Date()): string {
  return `${getTimeOfDayGreeting(date)}. JARVIS online.`
}
