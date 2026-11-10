// Vercel serverless function: GET /api/transcribe/status
import { transcriptionStatus } from '../../server/transcribe.mjs'

export default function handler(_req, res) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(transcriptionStatus(process.env)))
}
