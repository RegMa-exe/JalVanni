// OpenRouter incident-analysis proxy.
//
// The browser POSTs { transcript, detectedLanguageCode? } to /api/analyze. This
// handler calls OpenRouter's chat completions API with a structured-output JSON
// schema (when the configured model supports it), validates every field
// server-side and returns a normalised analysis. Credentials stay server-side.
//
// Provider: OpenRouter (https://openrouter.ai/api/v1/chat/completions).
// Model:    process.env.OPENROUTER_MODEL (never hardcoded).

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODELS_URL = 'https://openrouter.ai/api/v1/models'
// Overall budget for one analysis request, including one retry. Observed latency: ~11–19s per call.
const TIMEOUT_MS = 60_000
const MAX_TRANSCRIPT_CHARS = 4000

export const INCIDENT_TYPES = [
  'pipeline_leak',
  'pipe_burst',
  'low_pressure',
  'water_shortage',
  'suspected_contamination',
  'other',
  'unclear',
]
export const SEVERITIES = ['critical', 'high', 'medium', 'low']
export const SUPPLY_IMPACTS = ['no_supply', 'reduced_supply', 'quality_affected', 'none_reported', 'unknown']
export const VERIFICATION = ['reported_unverified', 'verified']
export const CONFIDENCE = ['high', 'medium', 'low']
export const SEVERITY_FACTORS = [
  'flooding_or_safety_risk',
  'supply_disruption',
  'large_population',
  'health_risk',
  'illness_reported',
  'prolonged_outage',
]

const nullableString = { type: ['string', 'null'] }

const stringArray = { type: 'array', items: { type: 'string' } }

export const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'incident_type',
    'location',
    'landmark',
    'severity',
    'severity_factors',
    'severity_rationale',
    'reported_duration',
    'description',
    'water_supply_impact',
    'affected_population',
    'recommended_action',
    'missing_information',
    'requires_human_review',
    'reasoning',
    'verification_status',
    'confidence',
  ],
  properties: {
    incident_type: { type: 'string', enum: INCIDENT_TYPES },
    location: { ...nullableString, description: 'Location exactly as stated by the caller; null if not stated.' },
    landmark: { ...nullableString, description: 'Nearby landmark exactly as stated; null if not stated.' },
    severity: { type: 'string', enum: SEVERITIES },
    severity_factors: { type: 'array', items: { type: 'string', enum: SEVERITY_FACTORS }, description: 'Evidence factors explicitly present in the transcript.' },
    severity_rationale: { type: 'string', description: 'Evidence-based justification for the severity and what unknowns could change it.' },
    reported_duration: { ...nullableString, description: 'How long the problem has lasted, as stated by the caller; null if not stated.' },
    description: { type: 'string', description: 'Neutral English summary of what the caller reported.' },
    water_supply_impact: { type: 'string', enum: SUPPLY_IMPACTS },
    affected_population: {
      type: 'object',
      additionalProperties: false,
      required: ['scope', 'estimated_households'],
      properties: {
        scope: { ...nullableString, description: 'Who is affected, as reported (e.g. "whole street"); null if not stated.' },
        estimated_households: { type: ['integer', 'null'], description: 'Only if the caller states a number; otherwise null.' },
      },
    },
    recommended_action: {
      type: 'object',
      additionalProperties: false,
      required: ['immediate_actions', 'after_verification_actions'],
      properties: {
        immediate_actions: { ...stringArray, description: 'Verification and precautionary steps that are safe before the report is verified.' },
        after_verification_actions: { ...stringArray, description: 'Repair/operational steps only once the incident is verified or authorised by emergency triage.' },
      },
    },
    missing_information: {
      type: 'object',
      additionalProperties: false,
      required: ['essential', 'optional_evidence'],
      properties: {
        essential: { ...stringArray, description: 'Essential facts NOT stated in the transcript, in priority order.' },
        optional_evidence: { ...stringArray, description: 'Nice-to-have supporting evidence (photos, video, consumer number).' },
      },
    },
    requires_human_review: { type: 'boolean' },
    reasoning: { type: 'string' },
    verification_status: { type: 'string', enum: VERIFICATION },
    confidence: { type: 'string', enum: CONFIDENCE, description: 'Qualitative and uncalibrated; not a probability.' },
  },
}

export const SYSTEM_PROMPT = `You are the incident-intake analyst for a municipal water utility control room in India.
You receive one citizen complaint transcript (speech-to-text output). It may be in Hindi (Devanagari or romanised), English, or Hinglish code-mix, and may contain recognition errors.

Your job: convert the complaint into a structured incident record that a human operator will review before anything is dispatched.

## 1. incident_type — exactly one of
- pipeline_leak: water leaking/seeping/dripping from a pipe, joint, valve or chamber (रिसाव, लीक, paani beh raha, tapak raha).
- pipe_burst: a pipe has burst/broken (फट गई, फूट गई, toot gayi, gushing).
- low_pressure: water arrives but with weak pressure / does not reach upper floors (प्रेशर कम, dheere aa raha).
- water_shortage: no water or reduced hours/quantity of supply (पानी नहीं आया, supply band, tanker needed).
- suspected_contamination: dirty, coloured, smelly, foul-tasting water or illness linked to water (गंदा, पीला, मटमैला, बदबू, keede).
- other: a water/sewer-utility issue that is none of the above (e.g. sewage overflow, meter fault, illegal connection).
- unclear: the transcript does not describe an identifiable water issue.
If several issues are present, choose the most severe as incident_type and mention the others in description.

## 2. Facts — never invent
- Use only what the transcript says. Unstated values are null (location, landmark, scope, estimated_households).
- location = area/street/sector/colony/ward as stated (you may transliterate Devanagari to Latin script). landmark = nearby reference point (temple, school, tower, shop, chowk) if stated. Never guess cities, pin codes or numbers.
- estimated_households: only a number the caller states.
- water_supply_impact: "unknown" unless the caller says something about their supply. A burst or leak does NOT by itself imply supply loss.
- All citizen complaints are reports, not verified facts: verification_status = "reported_unverified" unless the transcript is explicitly from utility field staff or a sensor confirming the issue. The description must use reporting language ("Caller reports…").

## 3. severity — evidence-based and conservative
Do NOT rate a pipe burst critical just because it is a burst.
First list in severity_factors ONLY the evidence factors the transcript explicitly states:
  - flooding_or_safety_risk: road/area flooded, traffic stuck, property damage, cave-in, electrical or other safety hazard
  - supply_disruption: caller says their supply has stopped or reduced (must match water_supply_impact no_supply/reduced_supply)
  - large_population: caller EXPLICITLY states a whole colony/sector/ward, multiple streets/buildings, or 50+ households. One home, one building or "our street" is NOT large_population, and naming an area as the location is NOT evidence of its whole population being affected.
  - health_risk: contaminated, coloured or smelly drinking water
  - illness_reported: caller reports people falling ill
  - prolonged_outage: supply problem stated to last more than 24 hours
  Water simply "flowing" or "leaking" is NOT flooding_or_safety_risk unless flooding, damage or danger is stated.
Then choose severity with this rubric (the server enforces the maximum):
  - critical: illness_reported, OR at least three of {flooding_or_safety_risk, supply_disruption, large_population, health_risk}.
  - high: two of those four factors, OR health_risk, OR prolonged_outage.
  - medium: one factor, OR a burst/leak with water flowing but no further information.
  - low: no factors (minor or single-household issue, or too little information).
If information is insufficient, choose the LOWER level.
severity_rationale: 1–2 plain-English sentences naming the evidence (quote transcript words) and stating what unknown information could raise or lower the severity after verification. Do not use factor codes or variable names in this text.
reported_duration: how long the problem has lasted, as stated (e.g. "since last night", "3 days"); null if not stated.

## 4. recommended_action — verification first
The report is unverified, so separate safe-now steps from repair steps.
- immediate_actions (2–4): steps that are safe before verification. Examples:
  - call back the caller to confirm exact location, landmark and details
  - send a field inspector/JE for site verification
  - cross-check SCADA pressure/flow data or other complaints from the same area
  - precautionary public advice (e.g. "advise residents not to drink the water until tested", "advise the caller to keep away from the flooded road")
  - for suspected_contamination: collecting water samples for testing IS verification and belongs in immediate_actions, and so does advising residents not to drink the water until it is tested (precaution).
  NEVER put an unconditional repair-crew dispatch, valve isolation, excavation, tanker deployment or shutdown in immediate_actions.
  Exception: if the transcript describes immediate danger to people (illness, severe flooding with traffic or property at risk), you may add "Escalate to duty officer for emergency triage; dispatch only if authorised".
- after_verification_actions (1–4): the operational/repair steps, each starting with "If verified, …" (e.g. "If verified, dispatch leak repair crew and isolate the affected section").
Actions must follow from what was reported; no actions for facts not reported.

## 5. missing_information — essential first
- essential: ONLY facts that are NOT already stated, in this priority order:
  1. exact location (house/plot number, street, or precise landmark)
  2. duration (since when)
  3. supply impact (whether water supply is affected)
  4. number of affected households
  (plus "nature of the problem" first, if incident_type is unclear)
  Before listing an item, check the transcript: duration is PROVIDED if the caller gives any time reference (e.g. 'कल रात से', 'since last night', 'do ghante', 'three days', 'ek hafte'); supply impact is PROVIDED if the caller says anything about their water supply. Do not list anything the caller already provided. Use short labels, e.g. "Exact location (house/street number)".
- optional_evidence: supporting items such as photos or video of the site, consumer/connection number, callback consent. Never put these in essential.

## 6. Other fields
- requires_human_review: always true.
- reasoning: 1–3 sentences on the classification, citing transcript words.
- confidence: qualitative (high/medium/low) for how clearly the transcript supports the classification. It is not a probability.
- Write description, severity_rationale, actions, missing_information and reasoning in English.

Respond with a single JSON object that matches the required schema and nothing else.`

class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function readJsonBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (c) => {
      data += c
      if (data.length > limit) {
        reject(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large.'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch {
        reject(new HttpError(400, 'INVALID_JSON', 'Request body must be JSON.'))
      }
    })
    req.on('error', reject)
  })
}

// ---- Model capability lookup (cached) --------------------------------------

let modelCache = { at: 0, models: null }

async function getModelInfo(modelId) {
  if (!modelCache.models || Date.now() - modelCache.at > 60 * 60_000) {
    try {
      const r = await fetch(MODELS_URL, { signal: AbortSignal.timeout(10_000) })
      if (r.ok) modelCache = { at: Date.now(), models: (await r.json()).data ?? [] }
    } catch {
      /* catalogue unavailable — proceed without capability info */
    }
  }
  if (!modelCache.models) return { known: null }
  const m = modelCache.models.find((x) => x.id === modelId)
  if (!m) {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const suggestions = modelCache.models.filter((x) => norm(x.id) === norm(modelId)).map((x) => x.id)
    return { known: false, suggestions }
  }
  const params = m.supported_parameters ?? []
  return {
    known: true,
    name: m.name,
    structuredOutputs: params.includes('structured_outputs'),
    responseFormat: params.includes('response_format'),
  }
}

function config(env) {
  return { apiKey: env.OPENROUTER_API_KEY?.trim(), model: env.OPENROUTER_MODEL?.trim() }
}

// ---- Validation -------------------------------------------------------------

function extractJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
    throw new Error('Model output is not JSON')
  }
}

const isStr = (v) => typeof v === 'string'
// Placeholder strings models sometimes emit instead of null.
const PLACEHOLDERS = new Set([
  '',
  'unknown',
  'not stated',
  'not_stated',
  'not specified',
  'n/a',
  'na',
  'none',
  'null',
  'not mentioned',
  'none_reported',
  'none reported',
  'not reported',
])
const optStr = (v) =>
  v === null || v === undefined ? null : isStr(v) ? (PLACEHOLDERS.has(v.trim().toLowerCase()) ? null : v.trim()) : undefined
const strList = (v) => (Array.isArray(v) && v.every(isStr) ? v.map((s) => s.trim()).filter(Boolean) : undefined)

// Repair/operational dispatch phrasing that must not appear unconditionally for unverified reports.
const UNCONDITIONAL_DISPATCH =
  /\b(dispatch|deploy|send|mobili[sz]e)\b[^.]*\b(repair|maintenance|leak|crew|team|tanker|jetting|plumber)\b|\b(isolate|shut ?down|close)\b[^.]*\b(valve|pipeline|section|main|supply)\b|\bexcavat/i
// Phrasing that makes an action a verification/triage step rather than a repair dispatch.
const VERIFICATION_WORDS = /\b(verif\w*|inspect\w*|assess\w*|confirm\w*|triage|if authori[sz]ed|only if|survey)\b/i

const CORE_FACTORS = ['flooding_or_safety_risk', 'supply_disruption', 'large_population', 'health_risk']

/** Highest severity the rubric allows for the evidence factors the model itself reported. */
export function maxSeverityFor(factors, incidentType) {
  const core = factors.filter((f) => CORE_FACTORS.includes(f)).length
  if (factors.includes('illness_reported') || core >= 3) return 'critical'
  if (core >= 2 || factors.includes('health_risk') || factors.includes('prolonged_outage')) return 'high'
  if (core >= 1 || incidentType === 'pipe_burst' || incidentType === 'pipeline_leak') return 'medium'
  return 'low'
}

/** Validates and normalises the model's JSON. Returns { value } or { errors }. */
export function validateAnalysis(raw) {
  const errors = []
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['Output is not an object'] }

  const enumField = (key, allowed) => {
    const v = typeof raw[key] === 'string' ? raw[key].trim().toLowerCase() : raw[key]
    if (!allowed.includes(v)) errors.push(`${key} must be one of ${allowed.join('|')} (got ${JSON.stringify(raw[key])})`)
    else out[key] = v
  }
  enumField('incident_type', INCIDENT_TYPES)
  enumField('severity', SEVERITIES)
  enumField('water_supply_impact', SUPPLY_IMPACTS)
  enumField('verification_status', VERIFICATION)
  enumField('confidence', CONFIDENCE)

  for (const key of ['location', 'landmark']) {
    const v = optStr(raw[key])
    if (v === undefined) errors.push(`${key} must be string or null`)
    else out[key] = v
  }
  for (const key of ['description', 'reasoning']) {
    if (!isStr(raw[key]) || !raw[key].trim()) errors.push(`${key} must be a non-empty string`)
    else out[key] = raw[key].trim()
  }

  const ap = raw.affected_population
  if (!ap || typeof ap !== 'object') errors.push('affected_population must be an object')
  else {
    const scope = optStr(ap.scope)
    const n = ap.estimated_households
    if (scope === undefined) errors.push('affected_population.scope must be string or null')
    if (!(n === null || n === undefined || (Number.isInteger(n) && n >= 0))) errors.push('affected_population.estimated_households must be a non-negative integer or null')
    out.affected_population = { scope: scope ?? null, estimated_households: Number.isInteger(n) ? n : null }
  }

  for (const key of ['severity_rationale']) {
    if (!isStr(raw[key]) || !raw[key].trim()) errors.push(`${key} must be a non-empty string`)
    else out[key] = raw[key].trim()
  }

  const dur = optStr(raw.reported_duration)
  if (dur === undefined) errors.push('reported_duration must be string or null')
  else out.reported_duration = dur

  const factors = Array.isArray(raw.severity_factors) ? [...new Set(raw.severity_factors)] : null
  if (!factors || !factors.every((f) => SEVERITY_FACTORS.includes(f))) errors.push(`severity_factors must be an array of ${SEVERITY_FACTORS.join('|')}`)
  else if (out.severity) {
    // Cross-check claimed factors against the model's own structured fields; drop unsupported ones.
    const hh = out.affected_population?.estimated_households
    const scope = out.affected_population?.scope ?? ''
    const unsupported = factors.filter(
      (f) =>
        (f === 'supply_disruption' && !['no_supply', 'reduced_supply'].includes(out.water_supply_impact)) ||
        (f === 'large_population' && !(hh != null && hh >= 50) && !/\b(colony|sector|ward|mohalla|area|locality|streets|buildings|neighbou?rhood|society)\b/i.test(scope)) ||
        (f === 'prolonged_outage' && !out.reported_duration),
    )
    if (unsupported.length) out.severity_factors_dropped = unsupported
    const checked = factors.filter((f) => !unsupported.includes(f))
    out.severity_factors = checked
    // Enforce the rubric's ceiling: the model may be more conservative, never more severe than its own evidence.
    const max = maxSeverityFor(checked, out.incident_type)
    if (SEVERITIES.indexOf(out.severity) < SEVERITIES.indexOf(max)) {
      out.severity_adjusted = { from: out.severity, to: max, reason: 'Reported evidence does not meet the criteria for ' + out.severity + '.' }
      out.severity = max
    } else if (checked.includes('illness_reported') && checked.includes('health_risk') && out.severity !== 'critical') {
      // Safety floor: reported illness linked to contaminated water is never under-rated.
      out.severity_adjusted = { from: out.severity, to: 'critical', reason: 'Illness linked to contaminated water was reported.' }
      out.severity = 'critical'
    }
  }

  const ra = raw.recommended_action
  const immediate = strList(ra?.immediate_actions)
  const afterVerif = strList(ra?.after_verification_actions)
  if (!immediate || immediate.length === 0) errors.push('recommended_action.immediate_actions must be a non-empty string array')
  if (!afterVerif) errors.push('recommended_action.after_verification_actions must be a string array')
  if (immediate && afterVerif) {
    // Safety guard: an unverified report must not carry an unconditional repair dispatch as an immediate action.
    const moved = []
    const keep = []
    for (const a of immediate) {
      if (out.verification_status !== 'verified' && UNCONDITIONAL_DISPATCH.test(a) && !VERIFICATION_WORDS.test(a)) moved.push(a)
      else keep.push(a)
    }
    out.recommended_action = {
      immediate_actions: keep.slice(0, 6),
      after_verification_actions: [
        ...afterVerif,
        ...moved.map((a) => {
          const t = a.replace(/\s*\b(immediately|urgently|right away|at once)\b/gi, '').trim()
          return `If verified, ${t.charAt(0).toLowerCase()}${t.slice(1)}`
        }),
      ].slice(0, 6),
    }
    out.guard_moved_actions = moved.length
    if (keep.length === 0) errors.push('recommended_action.immediate_actions contained only unconditional dispatch actions')
  }

  const mi = raw.missing_information
  const essential = strList(mi?.essential)
  const optional = strList(mi?.optional_evidence)
  if (!essential) errors.push('missing_information.essential must be a string array')
  if (!optional) errors.push('missing_information.optional_evidence must be a string array')
  if (essential && optional) {
    // Keep evidence-type items out of the essential list even if the model misfiles them.
    const isEvidence = (s) => /\b(photo|video|picture|image|consent|consumer (?:no|number)|connection (?:no|number)|account (?:no|number))/i.test(s)
    // Drop "missing" items that the structured fields show were actually provided.
    const provided = (s) =>
      (out.reported_duration && /\b(duration|since when|how long)\b/i.test(s)) ||
      (out.water_supply_impact && out.water_supply_impact !== 'unknown' && /\bsupply impact|water supply is affected|whether .*supply/i.test(s)) ||
      (out.affected_population?.estimated_households != null && /\bhouseholds?\b/i.test(s))
    out.missing_information = {
      essential: essential.filter((s) => !isEvidence(s) && !provided(s)).slice(0, 6),
      optional_evidence: [...optional, ...essential.filter(isEvidence)].slice(0, 6),
    }
  }

  if (typeof raw.requires_human_review !== 'boolean') errors.push('requires_human_review must be boolean')
  // Policy: every AI analysis requires operator review, regardless of model output.
  out.requires_human_review = true
  out.review_overridden = raw.requires_human_review === false

  return errors.length ? { errors } : { value: out }
}

// ---- OpenRouter call --------------------------------------------------------

async function callOpenRouter({ apiKey, model, transcript, languageHint, mode, signal }) {
  const userContent = [
    languageHint ? `Speech-to-text detected language: ${languageHint}` : null,
    'Complaint transcript:',
    '"""',
    transcript,
    '"""',
  ]
    .filter(Boolean)
    .join('\n')

  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    temperature: 0.1,
    max_tokens: 1200,
  }
  if (mode === 'json_schema') {
    body.response_format = { type: 'json_schema', json_schema: { name: 'incident_analysis', strict: true, schema: ANALYSIS_SCHEMA } }
    body.provider = { require_parameters: true }
  } else if (mode === 'json_object') {
    body.response_format = { type: 'json_object' }
    body.provider = { require_parameters: true }
  }

  let r
  try {
    r = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'JalVaani',
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new HttpError(504, 'TIMEOUT', `OpenRouter did not respond within ${TIMEOUT_MS / 1000}s.`)
    }
    throw new HttpError(502, 'UPSTREAM_UNREACHABLE', `Could not reach OpenRouter: ${e?.message ?? e}`)
  }

  const json = await r.json().catch(() => null)
  if (!r.ok || json?.error) {
    const status = r.ok ? 502 : r.status
    const msg = json?.error?.message ?? `OpenRouter returned HTTP ${r.status}`
    const code =
      status === 401 ? 'INVALID_API_KEY' : status === 402 ? 'INSUFFICIENT_CREDITS' : status === 429 ? 'RATE_LIMITED' : status === 408 ? 'TIMEOUT' : `OPENROUTER_${status}`
    throw new HttpError(status === 408 ? 504 : status, code, msg)
  }
  const choice = json?.choices?.[0]
  const content = choice?.message?.content
  if (!isStr(content) || !content.trim()) {
    console.warn(`[analyze] empty content id=${json?.id} finish_reason=${choice?.finish_reason ?? '-'} native=${choice?.native_finish_reason ?? '-'}`)
    return { content: null, json }
  }
  return { content, json }
}

// ---- Handler ----------------------------------------------------------------

export async function analysisStatus(env) {
  const { apiKey, model } = config(env)
  const base = { provider: 'OpenRouter', model: model ?? null, configured: Boolean(apiKey && model) }
  if (!base.configured) return base
  const info = await getModelInfo(model)
  return {
    ...base,
    modelFound: info.known,
    modelName: info.name ?? null,
    structuredOutputs: info.structuredOutputs ?? null,
    suggestions: info.suggestions ?? [],
  }
}

/**
 * GET  /api/analyze/status
 * POST /api/analyze   body: { transcript: string, detectedLanguageCode?: string }
 */
export async function handleAnalyzeRequest(req, res, env) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  try {
    if (req.method === 'GET' && url.pathname.endsWith('/status')) return sendJson(res, 200, await analysisStatus(env))
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST.')

    const { apiKey, model } = config(env)
    if (!apiKey || !model) {
      const missing = [!apiKey && 'OPENROUTER_API_KEY', !model && 'OPENROUTER_MODEL'].filter(Boolean).join(' and ')
      throw new HttpError(503, 'NOT_CONFIGURED', `${missing} not configured on the server. Add to .env and restart.`)
    }

    const body = await readJsonBody(req)
    const transcript = isStr(body.transcript) ? body.transcript.trim() : ''
    if (!transcript) throw new HttpError(400, 'EMPTY_TRANSCRIPT', 'Transcript is empty.')
    if (transcript.length > MAX_TRANSCRIPT_CHARS) throw new HttpError(400, 'TRANSCRIPT_TOO_LONG', `Transcript exceeds ${MAX_TRANSCRIPT_CHARS} characters.`)
    const languageHint = isStr(body.detectedLanguageCode) && /^[a-z]{2}-[A-Z]{2}$/.test(body.detectedLanguageCode) ? body.detectedLanguageCode : null

    const info = await getModelInfo(model)
    if (info.known === false) {
      throw new HttpError(
        400,
        'MODEL_NOT_FOUND',
        `OPENROUTER_MODEL "${model}" is not in the OpenRouter catalogue.${info.suggestions?.length ? ` Did you mean "${info.suggestions[0]}"?` : ''}`,
      )
    }
    const mode = info.structuredOutputs ? 'json_schema' : info.responseFormat ? 'json_object' : 'prompt_only'

    const started = Date.now()
    const deadline = AbortSignal.timeout(TIMEOUT_MS)
    let attempts = 0
    let lastErrors = []
    while (attempts < 2) {
      attempts++
      const { content, json } = await callOpenRouter({ apiKey, model, transcript, languageHint, mode, signal: deadline })
      if (content === null) {
        lastErrors = ['Model returned no content']
        continue
      }
      let parsed
      try {
        parsed = extractJson(content)
      } catch {
        lastErrors = ['Model output was not valid JSON']
        continue
      }
      const result = validateAnalysis(parsed)
      if (result.errors) {
        lastErrors = result.errors
        console.warn(`[analyze] invalid output (attempt ${attempts}): ${result.errors.join('; ')}`)
        continue
      }
      console.log(`[analyze] ok id=${json.id} model=${json.model} mode=${mode} attempts=${attempts} ${Date.now() - started}ms`)
      return sendJson(res, 200, {
        analysis: result.value,
        meta: {
          provider: 'OpenRouter',
          requestedModel: model,
          model: json.model ?? model,
          structuredOutput: mode,
          generationId: json.id ?? null,
          attempts,
          latencyMs: Date.now() - started,
          usage: json.usage ? { prompt: json.usage.prompt_tokens, completion: json.usage.completion_tokens } : null,
        },
      })
    }
    throw new HttpError(502, 'INVALID_AI_OUTPUT', `Model output failed validation: ${lastErrors.slice(0, 3).join('; ')}`)
  } catch (e) {
    if (e instanceof HttpError) {
      console.error(`[analyze] ${e.status} ${e.code}: ${e.message}`)
      return sendJson(res, e.status, { error: { code: e.code, message: e.message } })
    }
    if (e?.name === 'TimeoutError') {
      return sendJson(res, 504, { error: { code: 'TIMEOUT', message: `OpenRouter did not respond within ${TIMEOUT_MS / 1000}s.` } })
    }
    console.error('[analyze] unexpected error', e)
    return sendJson(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' } })
  }
}
