// Vercel serverless function: GET /api/analyze/status
import { analysisStatus } from '../../server/analyze.mjs'

export default async function handler(_req, res) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(await analysisStatus(process.env)))
}
