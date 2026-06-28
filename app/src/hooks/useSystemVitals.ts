import { useCallback, useEffect, useState } from 'react'
import { fetchVitals } from '@/services/vitals'
import type { VitalMetric } from '@/types/vitals'

const POLL_MS = 5 * 60 * 1000

const FALLBACK_VITALS: VitalMetric[] = [
  {
    id: 'subscribers',
    label: 'SUBSCRIBERS',
    value: '—',
    change: 'Loading…',
    changeUp: true,
    sparkline: [],
    live: false,
  },
  {
    id: 'instagram',
    label: 'INSTAGRAM',
    value: '—',
    change: 'Loading…',
    changeUp: true,
    sparkline: [],
    live: false,
  },
  {
    id: 'latest-video',
    label: 'LATEST VIDEO',
    value: '—',
    change: 'Loading…',
    changeUp: true,
    sparkline: [],
    live: false,
  },
  {
    id: 'ollama',
    label: 'OLLAMA',
    value: '—',
    change: 'Loading…',
    changeUp: false,
    sparkline: [],
    live: false,
  },
]

export function useSystemVitals() {
  const [vitals, setVitals] = useState<VitalMetric[]>(FALLBACK_VITALS)
  const [liveCount, setLiveCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchVitals()
      setVitals(data.vitals)
      setLiveCount(data.liveCount)
      setUpdatedAt(data.updatedAt)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vitals')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  return { vitals, liveCount, loading, error, updatedAt, refresh }
}
