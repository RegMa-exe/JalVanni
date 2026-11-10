// Vercel serverless function: POST /api/analyze → OpenRouter incident analysis.
// Reuses the same handler as the Vite dev server and server/index.mjs.
import { handleAnalyzeRequest } from '../../server/analyze.mjs'

export default function handler(req, res) {
  return handleAnalyzeRequest(req, res, process.env)
}
