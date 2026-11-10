import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
// @ts-expect-error -- plain ESM module shared with the production server
import { handleTranscribeRequest } from './server/transcribe.mjs'
// @ts-expect-error -- plain ESM module shared with the production server
import { handleAnalyzeRequest } from './server/analyze.mjs'

type Handler = (req: unknown, res: unknown, env: Record<string, string>) => Promise<void>
const routes: [string, Handler][] = [
  ['/api/transcribe', handleTranscribeRequest],
  ['/api/analyze', handleAnalyzeRequest],
]

/** Mounts the server-side API endpoints (Gnani STT, OpenRouter analysis) inside the Vite dev/preview server. */
function serverApi(env: Record<string, string>): Plugin {
  const mount = (middlewares: { use: (path: string, fn: (...a: never[]) => void) => void }) => {
    for (const [path, handler] of routes) {
      middlewares.use(path, ((req: { url: string; originalUrl?: string }, res: unknown) => {
        req.url = req.originalUrl ?? req.url
        void handler(req, res, env)
      }) as never)
    }
  }
  return {
    name: 'jalvaani-server-api',
    // Block bodies matter: returning a function from these hooks makes Vite treat it as a post-hook.
    configureServer(server) {
      mount(server.middlewares as never)
    },
    configurePreviewServer(server) {
      mount(server.middlewares as never)
    },
  }
}

export default defineConfig(({ mode }) => {
  // Load ALL env vars (no VITE_ prefix) for server-side use only. They are not exposed to client code.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string>
  return {
    plugins: [react(), tailwindcss(), serverApi(env)],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: 5173 },
  }
})
