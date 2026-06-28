import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatCompact, formatVram, truncate } from './format.ts'
import { appendHistory, monthlyDelta } from './vitals-history.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface VitalMetric {
  id: string
  label: string
  value: string
  change: string
  changeUp: boolean
  sparkline: number[]
  live: boolean
}

export interface VitalsResponse {
  updatedAt: string
  vitals: VitalMetric[]
  liveCount: number
}

type Env = Record<string, string>

const DEFAULT_CHANNEL = 'UCOS0P9Xa3h6LgLgPcXQsltA'

function cachePath(): string {
  return path.resolve(__dirname, '../.vitals-cache.json')
}

async function fetchJson<T>(url: string, timeoutMs = 10_000): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchYouTube(env: Env): Promise<VitalMetric[]> {
  const key = env.YOUTUBE_API_KEY
  if (!key) {
    return [
      unavailable('subscribers', 'SUBSCRIBERS', 'Set YOUTUBE_API_KEY'),
      unavailable('latest-video', 'LATEST VIDEO', 'Set YOUTUBE_API_KEY'),
    ]
  }

  const channelId = env.YOUTUBE_CHANNEL_ID || DEFAULT_CHANNEL
  const base = 'https://www.googleapis.com/youtube/v3'
  const channel = await fetchJson<{
    items?: {
      statistics?: { subscriberCount?: string; videoCount?: string }
      contentDetails?: { relatedPlaylists?: { uploads?: string } }
      snippet?: { title?: string }
    }[]
  }>(
    `${base}/channels?part=statistics,contentDetails,snippet&id=${channelId}&key=${key}`
  )

  const item = channel?.items?.[0]
  if (!item?.statistics) {
    return [
      unavailable('subscribers', 'SUBSCRIBERS', 'YouTube error'),
      unavailable('latest-video', 'LATEST VIDEO', 'YouTube error'),
    ]
  }

  const subs = Number(item.statistics.subscriberCount ?? 0)
  const videoCount = item.statistics.videoCount ?? '0'
  const subsSpark = appendHistory(cachePath(), 'youtube_subs', subs)
  const subsMo = monthlyDelta(subsSpark)

  const subsMetric: VitalMetric = {
    id: 'subscribers',
    label: 'SUBSCRIBERS',
    value: formatCompact(subs),
    change: subsMo?.label ?? `${videoCount} videos`,
    changeUp: subsMo ? subsMo.delta >= 0 : true,
    sparkline: subsSpark,
    live: true,
  }

  const uploads = item.contentDetails?.relatedPlaylists?.uploads
  if (!uploads) {
    return [subsMetric, unavailable('latest-video', 'LATEST VIDEO', 'No uploads playlist')]
  }

  const playlist = await fetchJson<{
    items?: { snippet?: { resourceId?: { videoId?: string } } }[]
  }>(
    `${base}/playlistItems?part=snippet&playlistId=${uploads}&maxResults=1&key=${key}`
  )

  const videoId = playlist?.items?.[0]?.snippet?.resourceId?.videoId
  if (!videoId) {
    return [subsMetric, unavailable('latest-video', 'LATEST VIDEO', 'No videos yet')]
  }

  const video = await fetchJson<{
    items?: {
      statistics?: { viewCount?: string }
      snippet?: { title?: string }
    }[]
  }>(`${base}/videos?part=statistics,snippet&id=${videoId}&key=${key}`)

  const vItem = video?.items?.[0]
  const views = Number(vItem?.statistics?.viewCount ?? 0)
  const title = truncate(vItem?.snippet?.title ?? 'Latest upload', 28)
  const viewsSpark = appendHistory(cachePath(), 'youtube_latest_views', views)

  const latestMetric: VitalMetric = {
    id: 'latest-video',
    label: 'LATEST VIDEO',
    value: formatCompact(views),
    change: title,
    changeUp: true,
    sparkline: viewsSpark,
    live: true,
  }

  return [subsMetric, latestMetric]
}

async function fetchInstagram(env: Env): Promise<VitalMetric> {
  const cache = cachePath()

  if (env.INSTAGRAM_ACCESS_TOKEN) {
    const data = await fetchJson<{
      followers_count?: number
      username?: string
      media_count?: number
    }>(
      `https://graph.instagram.com/v21.0/me?fields=followers_count,username,media_count&access_token=${encodeURIComponent(env.INSTAGRAM_ACCESS_TOKEN)}`
    )
    if (data?.followers_count != null) {
      const count = data.followers_count
      const spark = appendHistory(cache, 'instagram_followers', count)
      const mo = monthlyDelta(spark)
      return {
        id: 'instagram',
        label: 'INSTAGRAM',
        value: formatCompact(count),
        change: mo?.label ?? `@${data.username ?? 'vibecoders1'}`,
        changeUp: mo ? mo.delta >= 0 : true,
        sparkline: spark,
        live: true,
      }
    }
  }

  const pageToken = env.META_PAGE_ACCESS_TOKEN
  const pageId = env.FACEBOOK_PAGE_ID || '1128200807050997'
  if (pageToken) {
    const page = await fetchJson<{
      instagram_business_account?: { id: string }
    }>(
      `https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account&access_token=${encodeURIComponent(pageToken)}`
    )
    const igId = page?.instagram_business_account?.id
    if (igId) {
      const ig = await fetchJson<{ followers_count?: number; username?: string }>(
        `https://graph.facebook.com/v21.0/${igId}?fields=followers_count,username&access_token=${encodeURIComponent(pageToken)}`
      )
      if (ig?.followers_count != null) {
        const count = ig.followers_count
        const spark = appendHistory(cache, 'instagram_followers', count)
        const mo = monthlyDelta(spark)
        return {
          id: 'instagram',
          label: 'INSTAGRAM',
          value: formatCompact(count),
          change: mo?.label ?? `@${ig.username ?? 'vibecoders1'}`,
          changeUp: mo ? mo.delta >= 0 : true,
          sparkline: spark,
          live: true,
        }
      }
    }
  }

  return unavailable(
    'instagram',
    'INSTAGRAM',
    env.INSTAGRAM_ACCESS_TOKEN || pageToken ? 'API error' : 'Set INSTAGRAM_ACCESS_TOKEN'
  )
}

async function fetchOllama(env: Env): Promise<VitalMetric> {
  const base = env.OLLAMA_HOST || 'http://127.0.0.1:11434'
  const data = await fetchJson<{
    models?: { name?: string; size_vram?: number; size?: number }[]
  }>(`${base}/api/ps`)

  if (!data) {
    return unavailable('ollama', 'OLLAMA', 'Offline')
  }

  const models = data.models ?? []
  if (models.length === 0) {
    return {
      id: 'ollama',
      label: 'OLLAMA',
      value: 'IDLE',
      change: 'No models loaded',
      changeUp: false,
      sparkline: appendHistory(cachePath(), 'ollama_vram', 0),
      live: true,
    }
  }

  const vram = models.reduce((sum, m) => sum + (m.size_vram ?? m.size ?? 0), 0)
  const spark = appendHistory(cachePath(), 'ollama_vram', vram)
  const top = models[0]?.name?.split(':')[0] ?? 'model'

  return {
    id: 'ollama',
    label: 'OLLAMA',
    value: formatVram(vram),
    change: `${models.length} loaded · ${top}`,
    changeUp: false,
    sparkline: spark,
    live: true,
  }
}

function unavailable(id: string, label: string, change: string): VitalMetric {
  return {
    id,
    label,
    value: '—',
    change,
    changeUp: false,
    sparkline: [],
    live: false,
  }
}

export async function fetchVitals(env: Env): Promise<VitalsResponse> {
  const [youtube, instagram, ollama] = await Promise.all([
    fetchYouTube(env),
    fetchInstagram(env),
    fetchOllama(env),
  ])

  const vitals = [...youtube, instagram, ollama]
  const liveCount = vitals.filter(v => v.live).length

  return {
    updatedAt: new Date().toISOString(),
    vitals,
    liveCount,
  }
}
