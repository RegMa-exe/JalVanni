import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertCircle,
  AudioLines,
  CheckCircle2,
  Languages,
  Loader2,
  Mic,
  MicOff,
  PhoneIncoming,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Upload,
} from 'lucide-react'
import { Card, CardHeader, PageHeader } from '@/components/ui/Card'
import { Badge, SeverityBadge } from '@/components/ui/Badge'
import { useRecorder } from '@/hooks/useRecorder'
import {
  getTranscriptionStatus,
  languageName,
  languageOptions,
  transcribeAudio,
  TranscriptionError,
  type TranscriptionResult,
  type TranscriptionStatus,
} from '@/services/voice'
import { getAudioDuration, MAX_AUDIO_SECONDS, SUPPORTED_UPLOAD_EXTENSIONS, toWav16kMono } from '@/lib/audio'
import { zoneById } from '@/data/demo'
import { addIncident, nextIncidentId, useIncidents } from '@/store/incidents'
import { AnalysisPanel } from '@/components/analysis/AnalysisPanel'
import {
  analyzeWithAi,
  AnalysisError,
  confidenceScore,
  getAnalysisStatus,
  incidentTypeLabel,
  incidentTypeToCategory,
  ruleBasedFallback,
  type AnalysisServiceStatus,
} from '@/services/analysis'
import type { Incident, IncidentAnalysisRecord } from '@/types'
import { timeAgo } from '@/lib/format'

type Phase = 'capture' | 'transcribing' | 'transcribed' | 'extracting' | 'review' | 'submitted'
type PendingAudio = { blob: Blob; filename: string; durationSec: number }

const steps: { key: Phase[]; label: string }[] = [
  { key: ['capture'], label: 'Capture' },
  { key: ['transcribing', 'transcribed'], label: 'Transcribe' },
  { key: ['extracting'], label: 'Understand' },
  { key: ['review', 'submitted'], label: 'Create incident' },
]

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function Waveform({ level, active }: { level: number; active: boolean }) {
  const bars = 40
  return (
    <div className="flex h-20 items-center justify-center gap-[3px]">
      {Array.from({ length: bars }, (_, i) => {
        const shape = 0.35 + 0.65 * Math.sin((i / bars) * Math.PI)
        const h = active ? Math.max(0.08, level * shape * (0.6 + ((i * 37) % 10) / 25)) : 0.08
        return (
          <span
            key={i}
            className={clsx('w-1 rounded-full transition-[height] duration-75', active ? 'bg-gradient-to-t from-blue-600 to-cyan-400' : 'bg-slate-200')}
            style={{ height: `${Math.min(1, h) * 100}%` }}
          />
        )
      })}
    </div>
  )
}

function ServiceBadge({ status, error, verified }: { status: TranscriptionStatus | null; error: boolean; verified: boolean }) {
  if (error) return <Badge tone="red" dot>Speech service unreachable</Badge>
  if (!status) return <Badge tone="slate">Checking speech service…</Badge>
  if (!status.configured) return <Badge tone="red" dot>Gnani Prisma · not configured</Badge>
  return (
    <Badge tone={verified ? 'green' : 'blue'} dot>
      Gnani {status.model} · {verified ? 'connected' : 'ready'}
    </Badge>
  )
}

function AiBadge({ status }: { status: AnalysisServiceStatus | null }) {
  if (!status) return <Badge tone="slate">AI analysis status unknown</Badge>
  if (!status.configured) return <Badge tone="red" dot>OpenRouter · not configured</Badge>
  if (status.modelFound === false)
    return (
      <Badge tone="red" dot>
        OpenRouter · model not found: {status.model}
      </Badge>
    )
  return (
    <Badge tone="blue" dot>
      AI: OpenRouter · {status.model}
    </Badge>
  )
}

export function VoiceReportingPage() {
  const rec = useRecorder(MAX_AUDIO_SECONDS)
  const [languageId, setLanguageId] = useState(languageOptions[0].id)
  const [phase, setPhase] = useState<Phase>('capture')
  const [service, setService] = useState<TranscriptionStatus | null>(null)
  const [serviceError, setServiceError] = useState(false)
  const [verified, setVerified] = useState(false)
  const [audio, setAudio] = useState<PendingAudio | null>(null)
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  const [analysis, setAnalysis] = useState<IncidentAnalysisRecord | null>(null)
  const [aiStatus, setAiStatus] = useState<AnalysisServiceStatus | null>(null)
  const [newId, setNewId] = useState('')
  const analyseAbort = useRef<AbortController | null>(null)
  const navigate = useNavigate()
  const allIncidents = useIncidents()
  const fileRef = useRef<HTMLInputElement>(null)

  const language = languageOptions.find((l) => l.id === languageId) ?? languageOptions[0]
  const recentVoice = useMemo(() => allIncidents.filter((i) => i.channel === 'voice').slice(0, 5), [allIncidents])
  const stepIndex = steps.findIndex((s) => s.key.includes(phase))
  const busy = phase === 'transcribing' || phase === 'extracting'

  useEffect(() => {
    getTranscriptionStatus()
      .then(setService)
      .catch(() => setServiceError(true))
    getAnalysisStatus()
      .then(setAiStatus)
      .catch(() => setAiStatus(null))
    return () => analyseAbort.current?.abort()
  }, [])

  const transcribe = useCallback(
    async (input: PendingAudio) => {
      setAudio(input)
      setError(null)
      setTranscription(null)
      setAnalysis(null)
      setPhase('transcribing')
      try {
        const result = await transcribeAudio(input.blob, input.filename, language.languageCode)
        setTranscription(result)
        setDraft(result.transcript)
        setVerified(true)
        setPhase('transcribed')
      } catch (e) {
        const err = e instanceof TranscriptionError ? e : new TranscriptionError('UNKNOWN', String(e))
        setError({ code: err.code, message: err.message })
        setPhase('transcribed')
      }
    },
    [language.languageCode],
  )

  // When a microphone recording is finalised (manual or 30 s auto-stop), convert to WAV and transcribe.
  useEffect(() => {
    if (!rec.blob || phase !== 'capture') return
    const blob = rec.blob
    setPhase('transcribing')
    toWav16kMono(blob)
      .then(({ wav, durationSec }) => transcribe({ blob: wav, filename: 'recording.wav', durationSec }))
      .catch(() => {
        setError({ code: 'AUDIO_ENCODE_FAILED', message: 'Could not process the recorded audio. Please record again.' })
        setPhase('transcribed')
      })
  }, [rec.blob, phase, transcribe])

  async function handleUpload(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!(SUPPORTED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) {
      setError({ code: 'UNSUPPORTED_AUDIO_FORMAT', message: `Supported formats: ${SUPPORTED_UPLOAD_EXTENSIONS.join(', ').toUpperCase()}.` })
      setPhase('transcribed')
      return
    }
    let durationSec = 0
    try {
      durationSec = await getAudioDuration(file)
    } catch {
      /* browser can't decode this codec — let Gnani validate it */
    }
    if (durationSec > MAX_AUDIO_SECONDS) {
      setError({ code: 'MAX_AUDIO_DURATION_EXCEEDED', message: `This file is ${durationSec.toFixed(1)}s. The limit is ${MAX_AUDIO_SECONDS}s per request.` })
      setPhase('transcribed')
      return
    }
    rec.reset()
    void transcribe({ blob: file, filename: file.name, durationSec })
  }

  async function analyse() {
    const text = draft.trim()
    if (!text) return
    analyseAbort.current?.abort()
    const ctrl = new AbortController()
    analyseAbort.current = ctrl
    setAnalysis(null)
    setPhase('extracting')
    try {
      const { result, meta } = await analyzeWithAi(text, transcription?.detectedLanguageCode ?? null, ctrl.signal)
      setAnalysis({ source: 'ai', result, meta, analysedAt: new Date().toISOString() })
    } catch (e) {
      if (ctrl.signal.aborted) return
      const err = e instanceof AnalysisError ? e : new AnalysisError('UNKNOWN', String(e))
      setAnalysis(ruleBasedFallback(text, `${err.code} — ${err.message}`))
    }
    setPhase('review')
  }

  function cancelAnalysis() {
    analyseAbort.current?.abort()
    setPhase('transcribed')
  }

  function reset() {
    analyseAbort.current?.abort()
    rec.reset()
    setAudio(null)
    setTranscription(null)
    setDraft('')
    setError(null)
    setAnalysis(null)
    setPhase('capture')
  }

  function submit() {
    if (!analysis) return
    const a = analysis.result
    const id = nextIncidentId()
    const incident: Incident = {
      id,
      title: `${incidentTypeLabel[a.incident_type]}${a.location ? ` · ${a.location}` : ''}`,
      category: incidentTypeToCategory[a.incident_type],
      severity: a.severity,
      status: 'new',
      channel: 'voice',
      zoneId: '',
      location: [a.location, a.landmark && `near ${a.landmark}`].filter(Boolean).join(', ') || 'Location not stated',
      reportedAt: new Date().toISOString(),
      reporter: 'Voice intake · operator',
      language: transcription
        ? `${languageName(transcription.detectedLanguageCode)}${draft.trim() !== transcription.transcript.trim() ? ' (edited by operator)' : ''}`
        : 'Typed',
      affectedHouseholds: a.affected_population.estimated_households ?? 0,
      transcript: draft.trim(),
      aiSummary: a.description,
      aiConfidence: confidenceScore[a.confidence],
      analysis,
      reviewed: false,
    }
    addIncident(incident)
    setNewId(id)
    setPhase('submitted')
  }

  const canRecord = (phase === 'capture' || phase === 'transcribed') && !!service?.configured

  function startRecording() {
    if (phase !== 'capture') reset()
    void rec.start()
  }
  const remaining = MAX_AUDIO_SECONDS - rec.elapsed

  return (
    <>
      <PageHeader
        title="Voice Reporting"
        description="Capture citizen complaints by voice in Hindi and English and convert them into structured incidents."
        actions={
          <>
            <ServiceBadge status={service} error={serviceError} verified={verified} />
            <AiBadge status={aiStatus} />
          </>
        }
      />

      {service && !service.configured && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Speech-to-text is not configured</p>
            <p className="mt-0.5 text-red-700/90">
              Add <code className="rounded bg-white px-1 font-mono text-xs">GNANI_API_KEY=…</code> to <code className="rounded bg-white px-1 font-mono text-xs">.env</code> in the project root and restart <code className="rounded bg-white px-1 font-mono text-xs">npm run dev</code>.
            </p>
          </div>
        </div>
      )}

      {/* Stepper */}
      <ol className="card mb-6 grid grid-cols-2 gap-px overflow-hidden bg-slate-100 sm:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-3 bg-white px-4 py-3">
            <span
              className={clsx(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                i < stepIndex || phase === 'submitted'
                  ? 'bg-emerald-500 text-white'
                  : i === stepIndex
                    ? error && i === 1
                      ? 'bg-red-500 text-white'
                      : 'bg-navy-900 text-white'
                    : 'bg-slate-100 text-slate-500',
              )}
            >
              {i < stepIndex || phase === 'submitted' ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </span>
            <span className={clsx('text-sm font-medium', i <= stepIndex ? 'text-navy-900' : 'text-slate-400')}>{s.label}</span>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* Capture panel */}
        <Card className="xl:col-span-2">
          <CardHeader title="Live capture" subtitle={`Record a caller or field report · max ${MAX_AUDIO_SECONDS}s`} action={<AudioLines className="h-4 w-4 text-slate-400" />} />
          <div className="p-5">
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Spoken language</label>
            <div className="mb-5 grid grid-cols-3 gap-2">
              {languageOptions.map((l) => (
                <button
                  key={l.id}
                  disabled={rec.state === 'recording' || busy}
                  onClick={() => setLanguageId(l.id)}
                  title={l.languageCode}
                  className={clsx(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition',
                    languageId === l.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-navy-700 hover:bg-slate-50',
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-5">
              <Waveform level={rec.level} active={rec.state === 'recording'} />
              <p className="mt-3 text-center font-mono text-2xl text-navy-900 tabular-nums">
                {fmt(rec.elapsed)}
                <span className="text-base text-slate-400"> / {fmt(MAX_AUDIO_SECONDS)}</span>
              </p>
              <p className={clsx('text-center text-xs', rec.state === 'recording' && remaining <= 5 ? 'font-semibold text-red-600' : 'text-slate-500')}>
                {rec.state === 'recording'
                  ? remaining <= 5
                    ? `Auto-stopping in ${remaining}s`
                    : 'Recording… speak clearly near the microphone'
                  : rec.state === 'denied'
                    ? 'Microphone access was blocked — allow it in the browser or upload a file'
                    : rec.state === 'unsupported'
                      ? 'Audio capture not supported in this browser'
                      : phase === 'transcribing'
                        ? 'Sending audio to Gnani Prisma…'
                        : rec.autoStopped
                          ? `Stopped at the ${MAX_AUDIO_SECONDS}s limit`
                          : audio
                            ? `Captured ${audio.durationSec.toFixed(1)}s of audio`
                            : 'Ready'}
              </p>

              <div className="mt-5 flex justify-center">
                {rec.state === 'recording' ? (
                  <button onClick={rec.stop} className="grid h-16 w-16 place-items-center rounded-full bg-red-500 text-white shadow-lg ring-8 ring-red-100 transition hover:bg-red-600" aria-label="Stop recording">
                    <Square className="h-6 w-6 fill-current" />
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    disabled={!canRecord}
                    className="grid h-16 w-16 place-items-center rounded-full bg-navy-900 text-white shadow-lg ring-8 ring-blue-100 transition hover:bg-navy-800 disabled:opacity-40"
                    aria-label="Start recording"
                  >
                    {rec.state === 'denied' ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept={SUPPORTED_UPLOAD_EXTENSIONS.map((e) => `.${e}`).join(',')}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) void handleUpload(f)
                }}
              />
              <button onClick={() => fileRef.current?.click()} disabled={busy || rec.state === 'recording' || !service?.configured} className="btn btn-ghost flex-1">
                <Upload className="h-4 w-4" /> Upload audio
              </button>
              <button onClick={reset} disabled={busy} className="btn btn-ghost">
                <RotateCcw className="h-4 w-4" /> Reset
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-400">WAV, MP3, OGG, FLAC, AAC or M4A · up to {MAX_AUDIO_SECONDS}s</p>
          </div>
        </Card>

        {/* Results panel */}
        <div className="space-y-6 xl:col-span-3">
          <Card>
            <CardHeader
              title="Transcript"
              subtitle={
                transcription
                  ? `Detected: ${languageName(transcription.detectedLanguageCode)} · ${audio?.durationSec ? `${audio.durationSec.toFixed(1)}s audio · ` : ''}editable`
                  : 'Appears after capture'
              }
              action={<Languages className="h-4 w-4 text-slate-400" />}
            />
            <div className="min-h-28 p-5">
              {phase === 'transcribing' ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Transcribing with Gnani Prisma v3.0 ({language.languageCode})…
                </div>
              ) : error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
                    <AlertCircle className="h-4 w-4" /> Transcription failed
                    <span className="font-mono text-[11px] font-normal text-red-600">{error.code}</span>
                  </p>
                  <p className="mt-1 text-sm text-red-700">{error.message}</p>
                  <div className="mt-3 flex gap-2">
                    {audio && (
                      <button onClick={() => transcribe(audio)} className="btn btn-ghost px-2.5 py-1 text-xs">
                        <RefreshCw className="h-3.5 w-3.5" /> Retry
                      </button>
                    )}
                    <button onClick={reset} className="btn btn-ghost px-2.5 py-1 text-xs">
                      <RotateCcw className="h-3.5 w-3.5" /> Record again
                    </button>
                  </div>
                </div>
              ) : transcription ? (
                <>
                  {transcription.transcript.trim() === '' && (
                    <p className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      <AlertCircle className="h-4 w-4" /> No speech detected in the audio. Record again or type the complaint below.
                    </p>
                  )}
                  {transcription.truncated && (
                    <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Transcript was truncated by the model.</p>
                  )}
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={phase !== 'transcribed'}
                    rows={4}
                    className="input resize-y border-l-2 border-l-cyan-400 text-[15px] leading-relaxed"
                  />
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <p className="flex flex-1 items-center gap-1.5 text-[11px] text-slate-500">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      Gnani {transcription.model}
                      {transcription.processingTime !== null && ` · ${transcription.processingTime.toFixed(2)}s`}
                      {transcription.requestId && <span className="truncate font-mono" title={transcription.requestId}> · {transcription.requestId}</span>}
                      {draft !== transcription.transcript && <span className="font-medium text-amber-600"> · edited</span>}
                    </p>
                    {phase === 'transcribed' && (
                      <button onClick={analyse} disabled={!draft.trim()} className="btn btn-primary">
                        <Sparkles className="h-4 w-4" /> Analyse transcript
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400">No audio processed yet. Record a complaint (up to {MAX_AUDIO_SECONDS}s) or upload an audio file.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="AI incident extraction"
              subtitle={aiStatus?.model ? `${aiStatus.provider} · ${aiStatus.model}` : 'Structured fields derived from the transcript'}
              action={<Sparkles className="h-4 w-4 text-cyan-500" />}
            />
            <div className="p-5">
              {phase === 'extracting' ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analysing with {aiStatus?.provider ?? 'OpenRouter'}
                  {aiStatus?.model && <span className="font-mono text-xs text-navy-700">{aiStatus.model}</span>}… usually 15–30s
                  <button onClick={cancelAnalysis} className="ml-auto text-xs font-semibold text-slate-500 hover:text-navy-900">Cancel</button>
                </div>
              ) : analysis ? (
                <>
                  <AnalysisPanel record={analysis} />
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    {phase === 'submitted' ? (
                      <div className="flex flex-1 items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        <CheckCircle2 className="h-4 w-4" /> Incident <span className="font-mono font-semibold">{newId}</span> created — pending operator review.
                        <button onClick={() => navigate(`/analysis/${newId}`)} className="ml-auto font-semibold text-emerald-700 hover:underline">Open in Incident Analysis →</button>
                      </div>
                    ) : (
                      <>
                        {analysis.source !== 'ai' && (
                          <button onClick={analyse} className="btn btn-ghost"><RefreshCw className="h-4 w-4" /> Retry AI analysis</button>
                        )}
                        <button onClick={() => { setAnalysis(null); setPhase('transcribed') }} className="btn btn-ghost">Edit transcript</button>
                        <button onClick={submit} className="btn btn-primary"><Send className="h-4 w-4" /> Create incident</button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400">Incident type, severity, location, landmark, actions and missing information will appear here after you analyse the transcript.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent voice reports" subtitle="Latest calls received on the JalVaani helpline" action={<PhoneIncoming className="h-4 w-4 text-slate-400" />} />
        <ul className="divide-y divide-slate-100">
          {recentVoice.map((i) => (
            <li key={i.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600"><Mic className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-navy-900">{i.title}</p>
                <p className="truncate text-xs text-slate-500">“{i.transcript}”</p>
              </div>
              <div className="flex items-center gap-2 sm:shrink-0">
                <Badge tone="slate">{i.language}</Badge>
                <SeverityBadge severity={i.severity} />
                <span className="w-24 text-right text-xs text-slate-500">{zoneById(i.zoneId)?.name}</span>
                <span className="w-16 text-right text-xs text-slate-400">{timeAgo(i.reportedAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
