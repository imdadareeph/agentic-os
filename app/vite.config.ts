import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'
import { vitalsApiPlugin } from './server/vite-vitals-plugin.ts'

const serviceProxy = {
  '/whisper': {
    target: 'http://127.0.0.1:9000',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/whisper/, ''),
  },
  '/voicebox': {
    target: 'http://127.0.0.1:17493',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/voicebox/, ''),
  },
  '/ollama': {
    target: 'http://127.0.0.1:11434',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/ollama/, ''),
  },
  '/anthropic': {
    target: 'https://api.anthropic.com',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/anthropic/, ''),
  },
  '/gemini': {
    target: 'https://generativelanguage.googleapis.com',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/gemini/, ''),
  },
  '/gitnexus': {
    target: 'http://localhost:4747',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/gitnexus/, ''),
  },
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react(), vitalsApiPlugin()],
  server: {
    port: 3000,
    proxy: serviceProxy,
  },
  preview: {
    port: 3000,
    proxy: serviceProxy,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
