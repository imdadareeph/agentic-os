import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import { loadEnv } from 'vite'
import { fetchVitals } from './fetch-vitals.ts'

function attachVitalsHandler(
  server: Pick<ViteDevServer | PreviewServer, 'middlewares' | 'config'>
) {
  const envDir = server.config.envDir
  const mode = server.config.mode

  server.middlewares.use(async (req, res, next) => {
    const pathname = req.url?.split('?')[0]
    if (pathname !== '/api/vitals') {
      next()
      return
    }

    try {
      const env = loadEnv(mode, envDir, '')
      const data = await fetchVitals(env)
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.statusCode = 200
      res.end(JSON.stringify(data))
    } catch (err) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Vitals fetch failed' }))
    }
  })
}

export function vitalsApiPlugin(): Plugin {
  return {
    name: 'vitals-api',
    enforce: 'pre',
    configureServer(server) {
      attachVitalsHandler(server)
    },
    configurePreviewServer(server) {
      attachVitalsHandler(server)
    },
  }
}
