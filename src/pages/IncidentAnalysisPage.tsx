import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Brain, CheckCircle2, ClipboardPlus, ShieldAlert, Clock, Link2, MapPin, Mic, Radio, Search, Smartphone, User, Users, Wrench } from 'lucide-react'
import { Card, CardHeader, PageHeader } from '@/components/ui/Card'
import { Badge, IncidentStatusBadge, SeverityBadge } from '@/components/ui/Badge'
import { categoryBreakdown, languageMix, weeklyTrend, workOrders, zoneById } from '@/data/demo'
import { updateIncident, useIncidents } from '@/store/incidents'
import { AnalysisPanel } from '@/components/analysis/AnalysisPanel'
import { analysisSourceLabel, qualitativeConfidence } from '@/services/analysis'
import { clockTime, formatNumber, severityRank, timeAgo } from '@/lib/format'
import type { Incident, ReportChannel, Severity } from '@/types'

const tooltipStyle = { borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }
const pieColors = ['#1d4ed8', '#06b6d4', '#3f5893', '#cbd5e1']
const channelIcon: Record<ReportChannel, typeof Mic> = { voice: Mic, app: Smartphone, sensor: Radio, field: User }

const recommendations: Record<Incident['category'], string[]> = {
  'Pipe Burst': ['Close upstream isolation valves', 'Dispatch mains crew with repair clamp', 'Deploy water tanker to affected blocks', 'Notify traffic police for diversion'],
  Leakage: ['Schedule crew within 24h', 'Log for DMA leakage register', 'Inspect adjacent fittings'],
  'No Supply': ['Check upstream incidents and valve status', 'Verify pump station schedule', 'Arrange tanker if outage > 4h'],
  'Low Pressure': ['Review pressure logger trend', 'Inspect PRV settings', 'Run acoustic leak survey'],
  Contamination: ['Issue boil-water advisory', 'Collect samples for lab testing', 'Flush affected main', 'Check nearby sewer lines'],
  'Sewage Overflow': ['Dispatch jetting crew', 'Cordon off area', 'Disinfect surroundings post-clearance'],
  'Meter Fault': ['Run meter accuracy test', 'Check for service-line leak', 'Adjust billing if faulty'],
  Other: ['Call back caller to clarify the issue', 'Route to the relevant department'],
}

export function IncidentAnalysisPage() {
  const { incidentId } = useParams()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [sev, setSev] = useState<Severity | 'all'>('all')
  const [showResolved, setShowResolved] = useState(false)
  const incidents = useIncidents()

  const list = useMemo(
    () =>
      incidents
        .filter((i) => showResolved || i.status !== 'resolved')
        .filter((i) => sev === 'all' || i.severity === sev)
        .filter((i) => {
          const s = q.toLowerCase()
          return !s || [i.id, i.title, i.category, i.location, zoneById(i.zoneId)?.name ?? ''].some((f) => f.toLowerCase().includes(s))
        })
        .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.reportedAt.localeCompare(a.reportedAt)),
    [incidents, q, sev, showResolved],
  )

  const selected = incidents.find((i) => i.id === incidentId) ?? list[0]
  const related = selected?.zoneId ? incidents.filter((i) => i.zoneId === selected.zoneId && i.id !== selected.id) : []
  const wo = selected?.workOrderId ? workOrders.find((w) => w.id === selected.workOrderId) : undefined

  return (
    <>
      <PageHeader title="Incident Analysis" description="AI-assisted triage, root-cause correlation and trend analytics across the network." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Weekly volume & resolution" subtitle="Incidents reported vs. resolved, last 7 days" />
          <div className="h-64 px-2 pt-4 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyTrend} margin={{ left: -16, right: 12 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="reported" name="Reported" fill="#0b1f4b" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="resolved" name="Resolved" fill="#22d3ee" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Report language mix" subtitle="Share of voice reports, 30 days" />
          <div className="flex h-64 items-center">
            <ResponsiveContainer width="55%" height="100%">
              <PieChart>
                <Pie data={languageMix} dataKey="share" nameKey="language" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none">
                  {languageMix.map((_, i) => <Cell key={i} fill={pieColors[i]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="flex-1 space-y-2 pr-5">
              {languageMix.map((l, i) => (
                <li key={l.language} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: pieColors[i] }} />
                  <span className="flex-1 text-navy-800">{l.language}</span>
                  <span className="font-mono text-xs text-slate-500">{l.share}%</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Incidents by category" subtitle="Last 30 days" />
        <div className="h-56 px-2 pt-4 pb-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[...categoryBreakdown].sort((a, b) => b.count - a.count)} layout="vertical" margin={{ left: 24, right: 24 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 12, fill: '#213563' }} tickLine={false} axisLine={false} width={110} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="count" name="Incidents" fill="#2563eb" radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Master / detail */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card className="flex flex-col xl:col-span-2">
          <div className="space-y-3 border-b border-slate-100 p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Filter by ID, zone, category…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['all', 'critical', 'high', 'medium', 'low'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSev(s)}
                  className={clsx('rounded-md px-2.5 py-1 text-xs font-medium capitalize transition', sev === s ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
                >
                  {s}
                </button>
              ))}
              <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="accent-blue-600" />
                Show resolved
              </label>
            </div>
          </div>
          <ul className="max-h-[560px] flex-1 divide-y divide-slate-100 overflow-y-auto">
            {list.length === 0 && <li className="p-6 text-center text-sm text-slate-400">No incidents match these filters.</li>}
            {list.map((i) => {
              const Icon = channelIcon[i.channel]
              const active = selected?.id === i.id
              return (
                <li key={i.id}>
                  <button
                    onClick={() => navigate(`/analysis/${i.id}`)}
                    className={clsx('flex w-full gap-3 px-4 py-3 text-left transition', active ? 'bg-blue-50/70' : 'hover:bg-slate-50')}
                  >
                    <span className={clsx('mt-0.5 w-1 shrink-0 self-stretch rounded-full', active ? 'bg-blue-600' : 'bg-transparent')} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-500">{i.id}</span>
                        <Icon className="h-3 w-3 text-slate-400" />
                        <span className="ml-auto text-[11px] text-slate-400">{timeAgo(i.reportedAt)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-sm font-medium text-navy-900">{i.title}</p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <SeverityBadge severity={i.severity} />
                        <IncidentStatusBadge status={i.status} />
                        <span className="truncate text-xs text-slate-500">{zoneById(i.zoneId)?.name ?? i.location}</span>
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>

        {selected && (
          <Card className="xl:col-span-3">
            <div className="border-b border-slate-100 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-slate-500">{selected.id}</span>
                <SeverityBadge severity={selected.severity} />
                <IncidentStatusBadge status={selected.status} />
                <Badge tone="slate">{selected.category}</Badge>
              </div>
              <h2 className="mt-2 text-lg font-semibold text-navy-900">{selected.title}</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Meta icon={MapPin} label="Location" value={`${selected.location}`} />
                <Meta icon={Clock} label="Reported" value={`${clockTime(selected.reportedAt)} · ${timeAgo(selected.reportedAt)}`} />
                <Meta icon={Users} label="Households" value={formatNumber(selected.affectedHouseholds)} />
                <Meta icon={channelIcon[selected.channel]} label="Source" value={selected.reporter} />
              </div>
            </div>

            <div className="space-y-5 p-5">
              {selected.analysis && (
                <div className={clsx('flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center', selected.reviewed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50')}>
                  {selected.reviewed ? (
                    <p className="flex flex-1 items-center gap-2 text-sm font-medium text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Reviewed by operator — cleared for triage</p>
                  ) : (
                    <>
                      <p className="flex flex-1 items-center gap-2 text-sm font-medium text-amber-900"><ShieldAlert className="h-4 w-4" /> Awaiting human review of {analysisSourceLabel(selected.analysis)} analysis</p>
                      <button onClick={() => updateIncident(selected.id, { reviewed: true, status: selected.status === 'new' ? 'triaged' : selected.status })} className="btn btn-primary px-3 py-1.5 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark reviewed
                      </button>
                    </>
                  )}
                </div>
              )}

              {selected.transcript && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    <Mic className="h-3.5 w-3.5" /> Caller transcript · {selected.language}
                  </p>
                  <blockquote className="border-l-2 border-cyan-400 pl-4 text-sm leading-relaxed text-navy-700 italic">“{selected.transcript}”</blockquote>
                </div>
              )}

              {selected.analysis ? (
                <AnalysisPanel record={selected.analysis} />
              ) : (
                <>
              <div className="rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50/70 to-blue-50/40 p-4">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-blue-600" />
                  <p className="text-sm font-semibold text-navy-900">AI assessment</p>
                  <span className="ml-auto text-xs text-slate-500" title="Qualitative label, not a calibrated probability">
                    AI confidence (qualitative):{' '}
                    <span className="font-semibold text-navy-900 capitalize">{qualitativeConfidence(selected.aiConfidence)}</span>
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-navy-800">{selected.aiSummary}</p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Recommended actions</p>
                <ol className="space-y-2">
                  {recommendations[selected.category].map((r, idx) => (
                    <li key={r} className="flex items-start gap-3 text-sm text-navy-800">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-navy-900 text-[11px] font-semibold text-white">{idx + 1}</span>
                      {r}
                    </li>
                  ))}
                </ol>
              </div>

                </>
              )}

              {related.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    <Link2 className="h-3.5 w-3.5" /> Correlated in {zoneById(selected.zoneId)?.name}
                  </p>
                  <ul className="space-y-2">
                    {related.map((r) => (
                      <li key={r.id}>
                        <Link to={`/analysis/${r.id}`} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm transition hover:border-blue-300 hover:bg-blue-50/40">
                          <span className="font-mono text-xs text-slate-500">{r.id}</span>
                          <span className="flex-1 truncate text-navy-800">{r.title}</span>
                          <SeverityBadge severity={r.severity} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
                {wo ? (
                  <p className="flex-1 text-sm text-slate-600">
                    Linked work order <Link to="/work-orders" className="font-mono font-semibold text-blue-700 hover:underline">{wo.id}</Link> · {wo.progress}% complete
                  </p>
                ) : (
                  <p className="flex-1 text-sm text-slate-500">No work order raised yet.</p>
                )}
                {!wo && (
                  <Link to="/work-orders" className="btn btn-primary"><ClipboardPlus className="h-4 w-4" /> Raise work order</Link>
                )}
                {wo && <Link to="/work-orders" className="btn btn-ghost"><Wrench className="h-4 w-4" /> View field status</Link>}
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  )
}

function Meta({ icon: Icon, label, value }: { icon: typeof Mic; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-slate-500 uppercase"><Icon className="h-3 w-3" />{label}</p>
      <p className="mt-0.5 truncate text-sm text-navy-900" title={value}>{value}</p>
    </div>
  )
}
