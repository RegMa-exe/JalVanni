import clsx from 'clsx'
import { AlertTriangle, Bot, CircleHelp, ListChecks, Lock, MapPin, Scale, ShieldAlert, Users } from 'lucide-react'
import { Badge, SeverityBadge } from '@/components/ui/Badge'
import { incidentTypeLabel, normaliseActions, normaliseMissing, supplyImpactLabel } from '@/services/analysis'
import type { IncidentAnalysisRecord } from '@/types'

/** Provider/model attribution line, or a clear fallback warning. */
export function AnalysisSource({ record }: { record: IncidentAnalysisRecord }) {
  if (record.source === 'ai') {
    const m = record.meta
    return (
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-500">
        <Bot className="h-3.5 w-3.5 text-blue-600" />
        <span className="font-medium text-navy-800">{m.provider}</span>·<span className="font-mono text-navy-800">{m.model}</span>
        <span>· {m.structuredOutput === 'json_schema' ? 'JSON-schema output' : m.structuredOutput === 'json_object' ? 'JSON mode' : 'prompted JSON'}</span>
        <span>· {(m.latencyMs / 1000).toFixed(1)}s</span>
        {m.attempts > 1 && <span>· {m.attempts} attempts</span>}
        {m.generationId && <span className="truncate font-mono" title={m.generationId}>· {m.generationId}</span>}
      </p>
    )
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>
        <p className="font-semibold">Rule-based fallback — not AI analysis</p>
        <p className="mt-0.5 text-amber-800/90">Keyword matching only; verify every field. Reason AI was unavailable: {record.fallbackReason}</p>
      </div>
    </div>
  )
}

export function AnalysisPanel({ record, compact = false }: { record: IncidentAnalysisRecord; compact?: boolean }) {
  const a = record.result
  const fallback = record.source !== 'ai'
  const households = a.affected_population.estimated_households
  const actions = normaliseActions(a.recommended_action)
  const missing = normaliseMissing(a.missing_information)
  return (
    <div className="space-y-4">
      <AnalysisSource record={record} />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={fallback ? 'slate' : 'blue'}>{incidentTypeLabel[a.incident_type]}</Badge>
        <SeverityBadge severity={a.severity} />
        <Badge tone="violet">{a.verification_status === 'verified' ? 'Verified' : 'Reported · unverified'}</Badge>
        <span className="ml-auto text-xs text-slate-500" title="Qualitative judgement by the model of how clearly the transcript supports the classification. Not a calibrated probability.">
          {fallback ? 'Rule-based' : 'AI'} confidence (qualitative):{' '}
          <span className="font-semibold text-navy-900 capitalize">{a.confidence}</span>
        </span>
      </div>

      <p className={clsx('rounded-lg p-3 text-sm leading-relaxed text-navy-800', fallback ? 'bg-slate-50' : 'bg-blue-50/60')}>{a.description}</p>

      {a.severity_rationale && (
        <p className="flex items-start gap-2 text-sm leading-relaxed text-navy-700">
          <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            <span className="font-semibold text-navy-900">Why {a.severity}: </span>
            {a.severity_rationale}
            {a.severity_adjusted && (
              <span className="mt-1 block text-xs text-slate-500">
                Model proposed {a.severity_adjusted.from}; JalVaani rules set it to {a.severity_adjusted.to}.{' '}
                {a.severity_adjusted.reason ?? 'Reported evidence does not meet the higher criteria.'}
                {a.severity_factors_dropped?.length ? ` Unsupported evidence ignored: ${a.severity_factors_dropped.map((f) => f.replace(/_/g, ' ')).join(', ')}.` : ''}
              </span>
            )}
          </span>
        </p>
      )}
      {a.reported_duration && (
        <p className="-mt-2 pl-[22px] text-xs text-slate-500">
          Reported duration: <span className="font-medium text-navy-800">{a.reported_duration}</span>
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field icon={MapPin} label="Location" value={a.location} />
        <Field icon={MapPin} label="Landmark" value={a.landmark} />
        <Field label="Supply impact" value={supplyImpactLabel[a.water_supply_impact]} />
        <Field
          icon={Users}
          label="Affected"
          value={[a.affected_population.scope, households !== null ? `${households} households (reported)` : null].filter(Boolean).join(' · ') || null}
        />
      </dl>

      <div className={clsx('grid gap-4', !compact && 'md:grid-cols-2')}>
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <ListChecks className="h-3.5 w-3.5" /> Recommended actions
          </p>
          <p className="mb-1.5 text-[11px] font-semibold text-blue-700">Now — verification &amp; precaution</p>
          <ol className="space-y-1.5">
            {actions.immediate_actions.map((r, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-navy-800">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-navy-900 text-[11px] font-semibold text-white">{i + 1}</span>
                {r}
              </li>
            ))}
          </ol>
          {actions.after_verification_actions.length > 0 && (
            <>
              <p className="mt-3 mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                <Lock className="h-3 w-3" /> Only after verification or authorised emergency triage
              </p>
              <ol className="space-y-1.5">
                {actions.after_verification_actions.map((r, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-500">
                      {actions.immediate_actions.length + i + 1}
                    </span>
                    {r}
                  </li>
                ))}
              </ol>
            </>
          )}
          {!!a.guard_moved_actions && (
            <p className="mt-2 text-[11px] text-slate-400">
              {a.guard_moved_actions} dispatch step{a.guard_moved_actions > 1 ? 's' : ''} moved to after-verification by the safety guard.
            </p>
          )}
        </div>
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <CircleHelp className="h-3.5 w-3.5" /> Missing information
          </p>
          <p className="mb-1.5 text-[11px] font-semibold text-amber-700">Essential — collect on call-back</p>
          {missing.essential.length ? (
            <ul className="space-y-1.5">
              {missing.essential.map((m, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-navy-800">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  {m}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">All essential details were provided.</p>
          )}
          {missing.optional_evidence.length > 0 && (
            <>
              <p className="mt-3 mb-1.5 text-[11px] font-semibold text-slate-500">Optional evidence</p>
              <ul className="space-y-1">
                {missing.optional_evidence.map((m, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-500">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                    {m}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <details className="group rounded-lg border border-slate-200 px-3 py-2 text-sm">
        <summary className="cursor-pointer text-xs font-semibold tracking-wide text-slate-500 uppercase">Reasoning</summary>
        <p className="mt-2 leading-relaxed text-navy-700">{a.reasoning}</p>
      </details>

      <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <ShieldAlert className="h-3.5 w-3.5 text-navy-700" />
        Human review required before dispatch. This is a citizen report and has not been verified.
      </p>
    </div>
  )
}

function Field({ icon: Icon, label, value }: { icon?: typeof MapPin; label: string; value: string | null }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 p-3">
      <dt className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-slate-500 uppercase">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </dt>
      <dd className={clsx('mt-1 text-sm font-medium', value ? 'text-navy-900' : 'text-slate-400 italic')} title={value ?? undefined}>
        {value ?? 'Not stated'}
      </dd>
    </div>
  )
}
