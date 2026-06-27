import { GITNEXUS_BASE } from '@/config/services'
import { fetchWithTimeout } from '@/lib/fetch'

export async function checkGitNexusHealth(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${GITNEXUS_BASE}/`, {}, 3000)
    return res.ok
  } catch {
    return false
  }
}
