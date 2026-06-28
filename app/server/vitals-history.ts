import fs from 'node:fs'
import path from 'node:path'

const MAX_POINTS = 20

type HistoryFile = Record<string, number[]>

export function loadHistory(cachePath: string): HistoryFile {
  try {
    if (!fs.existsSync(cachePath)) return {}
    const raw = fs.readFileSync(cachePath, 'utf8')
    return JSON.parse(raw) as HistoryFile
  } catch {
    return {}
  }
}

export function appendHistory(
  cachePath: string,
  key: string,
  value: number
): number[] {
  const history = loadHistory(cachePath)
  const series = history[key] ?? []
  const next = [...series, value].slice(-MAX_POINTS)
  history[key] = next

  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true })
    fs.writeFileSync(cachePath, JSON.stringify(history, null, 2))
  } catch {
    // cache is best-effort
  }

  return next
}

export function monthlyDelta(series: number[]): { delta: number; label: string } | null {
  if (series.length < 2) return null
  const delta = series[series.length - 1] - series[0]
  const sign = delta >= 0 ? '▲' : '▼'
  return { delta, label: `${sign} ${formatAbs(delta)} /period` }
}

function formatAbs(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000) return `${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(abs)
}
