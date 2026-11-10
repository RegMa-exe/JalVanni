// Vercel serverless function: POST /api/transcribe → Gnani Prisma v3.0.
// Reuses the same handler as the Vite dev server and server/index.mjs.
import { handleTranscribeRequest } from '../../server/transcribe.mjs'

export default function handler(req, res) {
  return handleTranscribeRequest(req, res, process.env)
}
