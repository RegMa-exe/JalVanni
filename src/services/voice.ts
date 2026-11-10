import type { IncidentCategory, Severity } from '@/types'

/**
 * Voice pipeline.
 *
 * Transcription: real Gnani Prisma v3.0 via the server-side proxy at
 * /api/transcribe (the API key never reaches the browser). There is no mock
 * fallback: a failure is surfaced as a TranscriptionError.
 *
 * Extraction: local rule-based classifier for now (to be replaced by an LLM step).
 */

export type LanguageOption = { id: string; label: string; languageCode: string }

/** Hindi & English only — both are in the documented Prisma v3.0 language list. */
export const languageOptions: LanguageOption[] = [
  { id: 'mixed', label: 'Hindi + English', languageCode: 'hi-IN,en-IN' },
  { id: 'hi', label: 'Hindi', languageCode: 'hi-IN' },
  { id: 'en', label: 'English', languageCode: 'en-IN' },
]

const languageNames: Record<string, string> = { 'hi-IN': 'Hindi', 'en-IN': 'English' }
export const languageName = (code: string | null) => (code ? (languageNames[code] ?? code) : 'Not detected')

export interface TranscriptionResult {
  transcript: string
  detectedLanguageCode: string | null
  requestId: string | null
  model: string
  truncated: boolean
  processingTime: number | null
  roundTripMs: number
}

export interface TranscriptionStatus {
  provider: string
  model: string
  configured: boolean
}

export class TranscriptionError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export async function getTranscriptionStatus(): Promise<TranscriptionStatus> {
  const res = await fetch('/api/transcribe/status')
  if (!res.ok) throw new TranscriptionError('STATUS_UNAVAILABLE', 'Transcription service is unreachable.')
  return res.json()
}

export async function transcribeAudio(audio: Blob, filename: string, languageCode: string): Promise<TranscriptionResult> {
  let res: Response
  try {
    res = await fetch(`/api/transcribe?language_code=${encodeURIComponent(languageCode)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Audio-Filename': filename },
      body: audio,
    })
  } catch {
    throw new TranscriptionError('NETWORK_ERROR', 'Could not reach the JalVaani server.')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new TranscriptionError(body?.error?.code ?? `HTTP_${res.status}`, body?.error?.message ?? 'Transcription failed.')
  }
  return body as TranscriptionResult
}

export interface IncidentExtraction {
  category: IncidentCategory
  severity: Severity
  location: string
  summary: string
  confidence: number
  entities: { label: string; value: string }[]
}

/** Rule-based extraction (Latin + Devanagari keywords). Placeholder for an LLM step. */
export function extractIncident(t: string): IncidentExtraction {
  const s = t.toLowerCase()
  const has = (...k: string[]) => k.some((w) => s.includes(w))
  let category: IncidentCategory = 'Leakage'
  let hits = 0
  if (has('phat', 'phut', 'burst', 'फट', 'फूट')) (category = 'Pipe Burst'), hits++
  else if (has('ganda', 'peela', 'badboo', 'smell', 'dirty', 'contamin', 'गंदा', 'पीला', 'बदबू', 'मटमैला')) (category = 'Contamination'), hits++
  else if (has('sewage', 'sewer', 'nali', 'gutter', 'overflow', 'सीवर', 'नाली', 'गटर')) (category = 'Sewage Overflow'), hits++
  else if (has('pressure', 'dheere', 'प्रेशर', 'धीरे', 'कम पानी')) (category = 'Low Pressure'), hits++
  else if (has('meter', 'मीटर')) (category = 'Meter Fault'), hits++
  else if (has('nahi aaya', 'no water', 'no supply', 'supply cut', 'नहीं आया', 'नहीं आ रहा', 'सप्लाई बंद', 'बंद')) (category = 'No Supply'), hits++
  else if (has('leak', 'लीक', 'रिस')) hits++

  const severity: Severity =
    category === 'Pipe Burst' || category === 'Contamination' ? 'critical' : category === 'No Supply' || category === 'Sewage Overflow' ? 'high' : 'medium'

  const loc = t.match(/([A-Z][a-z]+ (?:Nagar|Colony|Park|Road|Marg)(?: Sector \d+)?|Sector \d+|सेक्टर \d+|[ऀ-ॿ]+ नगर)/)
  const location = loc ? loc[0].trim() : 'Location to be confirmed'
  const supplyImpact = has('supply', 'सप्लाई', 'नहीं आया', 'no water', 'बंद')

  return {
    category,
    severity,
    location,
    summary: `${category} reported at ${location}. ${supplyImpact ? 'Caller also reports supply interruption. ' : ''}Recommend dispatching nearest available crew.`,
    confidence: hits ? 0.75 : 0.4,
    entities: [
      { label: 'Location', value: location },
      { label: 'Issue', value: category },
      { label: 'Supply impact', value: supplyImpact ? 'Yes' : 'Unclear' },
      { label: 'Words', value: String(t.trim().split(/\s+/).filter(Boolean).length) },
    ],
  }
}
