// Production server: serves the built SPA from dist/ and the /api/transcribe endpoint.
// Run with: npm start   (reads .env via --env-file-if-exists)
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleTranscribeRequest } from './transcribe.mjs'
import { handleAnalyzeRequest } from './analyze.mjs'

const root = fileURLToPath(new URL('../dist', import.meta.url))
const port = Number(process.env.PORT ?? 8787)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  if (path.startsWith('/api/transcribe')) return handleTranscribeRequest(req, res, process.env)
  if (path.startsWith('/api/analyze')) return handleAnalyzeRequest(req, res, process.env)

  let file = normalize(join(root, path))
  if (!file.startsWith(root)) file = join(root, 'index.html')
  try {
    if (!(await stat(file)).isFile()) throw new Error()
  } catch {
    file = join(root, 'index.html') // SPA fallback
  }
  try {
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream')
    res.end(await readFile(file))
  } catch {
    res.statusCode = 500
    res.end('Build not found. Run npm run build first.')
  }
}).listen(port, () => {
  console.log(`JalVaani server on http://localhost:${port} (Gnani key ${process.env.GNANI_API_KEY ? 'set' : 'MISSING'}, OpenRouter ${process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MODEL ? 'set' : 'MISSING'})`)
})
