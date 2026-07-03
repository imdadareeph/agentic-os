import { GITNEXUS_BASE, GITNEXUS_ENABLED } from '@/config/services'
import { fetchWithTimeout } from '@/lib/fetch'

export async function checkGitNexusHealth(): Promise<boolean> {
  if (!GITNEXUS_ENABLED) return false
  try {
    const res = await fetchWithTimeout(`${GITNEXUS_BASE}/`, {}, 3000)
    return res.ok
  } catch {
    return false
  }
}
