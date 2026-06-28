import type { VitalsResponse } from '@/types/vitals'
import { fetchWithTimeout } from '@/lib/fetch'

export async function fetchVitals(): Promise<VitalsResponse> {
  const res = await fetchWithTimeout('/api/vitals', {}, 15_000)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `Vitals request failed (${res.status})`)
  }
  return res.json() as Promise<VitalsResponse>
}
