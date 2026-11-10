// Gnani Prisma v3.0 transcription proxy.
//
// The browser POSTs raw audio bytes to /api/transcribe; this handler forwards
// them to Gnani as multipart/form-data. The API key is read from the server
// environment only and never reaches the client.
//
// Reference: https://docs.gnani.ai/api/STT/speech-to-text.md
//            https://docs.gnani.ai/api/STT/limits.md

const GNANI_URL = 'https://api.vachana.ai/stt/v3'
const MODEL = 'prisma-v3.0'
const FORMAT = 'codemix'

// Initial scope: Hindi and English only (comma-separated list is documented for v3.0).
const ALLOWED_LANGUAGE_CODES = new Set(['hi-IN', 'en-IN', 'hi-IN,en-IN'])
// Documented REST audio formats (Gnani detects format from the file extension).
const ALLOWED_EXTENSIONS = new Set(['wav', 'mp3', 'ogg', 'flac', 'aac', 'm4a'])
const MAX_DURATION_SEC = 30
const MAX_BYTES = 10 * 1024 * 1024

class HttpError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BYTES) {
        reject(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Audio file exceeds 10 MB.'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** Returns duration in seconds for a PCM WAV buffer, or null if it cannot be determined. */
function wavDurationSec(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null
  let offset = 12
  let byteRate = 0
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4)
    const size = buf.readUInt32LE(offset + 4)
    if (id === 'fmt ') byteRate = buf.readUInt32LE(offset + 16)
    if (id === 'data') return byteRate ? size / byteRate : null
    offset += 8 + size + (size % 2)
  }
  return null
}

/** Normalises Gnani's documented error shapes into { code, message }. */
function parseGnaniError(status, body) {
  if (body && typeof body === 'object') {
    if (body.error && typeof body.error === 'object') {
      return { code: body.error.type ?? `HTTP_${status}`, message: body.error.message ?? 'Transcription failed.' }
    }
    if (body.detail && typeof body.detail === 'object' && !Array.isArray(body.detail)) {
      return { code: body.detail.error_code ?? `HTTP_${status}`, message: body.detail.message ?? 'Request rejected.' }
    }
    if (Array.isArray(body.detail)) {
      return { code: 'VALIDATION_ERROR', message: body.detail.map((d) => d.msg).join('; ') }
    }
    if (body.code || body.message) return { code: body.code ?? `HTTP_${status}`, message: body.message ?? String(body.error) }
  }
  if (status === 402) return { code: 'INSUFFICIENT_CREDIT', message: 'Gnani account has insufficient credit.' }
  return { code: `HTTP_${status}`, message: `Gnani returned HTTP ${status}.` }
}

export function transcriptionStatus(env) {
  return { provider: 'Gnani Prisma', model: MODEL, configured: Boolean(env.GNANI_API_KEY) }
}

/**
 * Connect/Node-style handler. Mount for:
 *   GET  /api/transcribe/status
 *   POST /api/transcribe?language_code=hi-IN,en-IN   (body: raw audio, header X-Audio-Filename)
 */
export async function handleTranscribeRequest(req, res, env) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  try {
    if (req.method === 'GET' && url.pathname.endsWith('/status')) {
      return sendJson(res, 200, transcriptionStatus(env))
    }
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST.')

    const apiKey = env.GNANI_API_KEY
    if (!apiKey) {
      throw new HttpError(
        503,
        'NOT_CONFIGURED',
        'GNANI_API_KEY is not configured on the server. Add it to .env and restart the dev server.',
      )
    }

    const languageCode = url.searchParams.get('language_code') ?? 'hi-IN,en-IN'
    if (!ALLOWED_LANGUAGE_CODES.has(languageCode)) {
      throw new HttpError(400, 'INVALID_LANGUAGE_CODE', 'Only hi-IN, en-IN or hi-IN,en-IN are enabled.')
    }

    const filename = String(req.headers['x-audio-filename'] ?? 'recording.wav').replace(/[^\w.-]/g, '_')
    const ext = filename.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new HttpError(400, 'UNSUPPORTED_AUDIO_FORMAT', 'Supported formats: WAV, MP3, OGG, FLAC, AAC, M4A.')
    }

    const audio = await readBody(req)
    if (audio.length === 0) throw new HttpError(400, 'EMPTY_AUDIO', 'No audio received.')
    if (ext === 'wav') {
      const dur = wavDurationSec(audio)
      if (dur !== null && dur > MAX_DURATION_SEC + 0.05) {
        throw new HttpError(400, 'MAX_AUDIO_DURATION_EXCEEDED', `Audio is ${dur.toFixed(1)}s; the limit is 30s.`)
      }
    }

    const form = new FormData()
    form.append('audio_file', new Blob([audio]), filename)
    form.append('model', MODEL)
    form.append('language_code', languageCode)
    form.append('format', FORMAT)

    const started = Date.now()
    let upstream
    try {
      upstream = await fetch(GNANI_URL, {
        method: 'POST',
        headers: { 'X-API-Key-ID': apiKey },
        body: form,
        signal: AbortSignal.timeout(30_000),
      })
    } catch (e) {
      throw new HttpError(502, 'UPSTREAM_UNREACHABLE', `Could not reach Gnani: ${e?.message ?? e}`)
    }

    const text = await upstream.text()
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      /* non-JSON */
    }

    if (!upstream.ok || !body || body.success === false) {
      const err = parseGnaniError(upstream.status, body)
      console.error(`[transcribe] Gnani ${upstream.status} ${err.code}: ${err.message}`)
      return sendJson(res, upstream.ok ? 502 : upstream.status, { error: err })
    }

    if (typeof body.transcript !== 'string') {
      throw new HttpError(502, 'UNEXPECTED_RESPONSE', 'Gnani response did not include a transcript.')
    }

    console.log(`[transcribe] ok request_id=${body.request_id} model=${body.model} lang=${body.detected_language_code ?? '-'}`)
    return sendJson(res, 200, {
      transcript: body.transcript,
      detectedLanguageCode: body.detected_language_code ?? null,
      requestId: body.request_id ?? null,
      model: body.model ?? MODEL,
      truncated: body.truncated === true,
      processingTime: body.processing_time ?? null,
      roundTripMs: Date.now() - started,
    })
  } catch (e) {
    if (e instanceof HttpError) return sendJson(res, e.status, { error: { code: e.code, message: e.message } })
    console.error('[transcribe] unexpected error', e)
    return sendJson(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' } })
  }
}
