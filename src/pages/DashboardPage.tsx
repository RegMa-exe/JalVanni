import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, AlertTriangle, ArrowRight, Clock, Gauge, Mic, Users } from 'lucide-react'
import { Card, CardHeader, PageHeader, StatCard } from '@/components/ui/Card'
import { IncidentStatusBadge, SeverityBadge, WorkOrderStatusBadge } from '@/components/ui/Badge'
import { crews, hourlyIntake, workOrders, zoneById, zones } from '@/data/demo'
import { useIncidents } from '@/store/incidents'
import { formatNumber, severityRank, timeAgo } from '@/lib/format'

const tooltipStyle = {
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 24px -6px rgb(11 31 75 / 0.12)',
  fontSize: 12,
}

export function DashboardPage() {
  const incidents = useIncidents()
  const active = incidents.filter((i) => i.status !== 'resolved')
  const critical = active.filter((i) => i.severity === 'critical')
  const voiceShare = Math.round((incidents.filter((i) => i.channel === 'voice').length / incidents.length) * 100)
  const households = active.reduce((s, i) => s + i.affectedHouseholds, 0)
  const priority = [...active].sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity] || b.reportedAt.localeCompare(a.reportedAt),
  )
  const liveWOs = workOrders.filter((w) => w.status !== 'completed')

  return (
    <>
      <PageHeader
        title="Operations Overview"
        description="Real-time view of network health, citizen reports and field response across all zones."
        actions={
          <>
            <Link to="/analysis" className="btn btn-ghost">
              <Activity className="h-4 w-4" /> Analyse incidents
            </Link>
            <Link to="/voice" className="btn btn-primary">
              <Mic className="h-4 w-4" /> New voice report
            </Link>
          </>
        }
      />

      {critical.length > 0 && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-white p-4 sm:flex-row sm:items-center">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-100 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="flex-1 text-sm">
            <p className="font-semibold text-red-800">{critical.length} critical incidents require attention</p>
            <p className="text-red-700/80">{critical.map((c) => `${c.id} · ${c.title}`).join('  •  ')}</p>
          </div>
          <Link to={`/analysis/${critical[0].id}`} className="btn border border-red-200 bg-white text-red-700 hover:bg-red-50">
            Review <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active incidents" value={String(active.length)} delta="+3" hint="vs. last hour" icon={AlertTriangle} accent="red" />
        <StatCard label="Households affected" value={formatNumber(households)} delta="−12%" deltaGood hint="since 06:00" icon={Users} accent="blue" />
        <StatCard label="Mean time to resolve" value="4.1h" delta="−0.6h" deltaGood hint="7-day rolling" icon={Clock} accent="green" />
        <StatCard label="Voice-reported" value={`${voiceShare}%`} delta="+8 pts" deltaGood hint="of today's intake" icon={Mic} accent="cyan" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Incident intake · last 24 hours"
            subtitle="Voice calls vs. app, sensor and field reports"
            action={
              <div className="flex items-center gap-4 text-xs text-slate-600">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-600" />Voice</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-400" />Other</span>
              </div>
            }
          />
          <div className="h-72 px-2 pt-4 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyIntake} margin={{ left: -16, right: 12 }}>
                <defs>
                  <linearGradient id="gVoice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gOther" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} interval={3} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="voice" name="Voice" stroke="#2563eb" strokeWidth={2} fill="url(#gVoice)" />
                <Area type="monotone" dataKey="other" name="Other" stroke="#22d3ee" strokeWidth={2} fill="url(#gOther)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Zone health" subtitle="Pressure & supply hours by DMA" action={<Gauge className="h-4 w-4 text-slate-400" />} />
          <ul className="divide-y divide-slate-100">
            {zones.map((z) => (
              <li key={z.id} className="flex items-center gap-3 px-5 py-2.5">
                <span
                  className={clsx(
                    'h-2.5 w-2.5 shrink-0 rounded-full',
                    z.health === 'normal' && 'bg-emerald-500',
                    z.health === 'watch' && 'bg-amber-500',
                    z.health === 'alert' && 'bg-red-500',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-navy-900">{z.name}</p>
                  <p className="text-[11px] text-slate-500">{z.id} · {z.ward}</p>
                </div>
                <div className="w-24">
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={clsx('h-full rounded-full', z.pressureBar < 1.3 ? 'bg-red-500' : z.pressureBar < 2 ? 'bg-amber-500' : 'bg-blue-600')}
                      style={{ width: `${Math.min(100, (z.pressureBar / 3) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-right font-mono text-[11px] text-slate-600">{z.pressureBar.toFixed(1)} bar</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Priority queue"
            subtitle="Open incidents ranked by severity and recency"
            action={<Link to="/analysis" className="text-xs font-semibold text-blue-600 hover:text-blue-700">View all →</Link>}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th">Incident</th>
                  <th className="th">Zone</th>
                  <th className="th">Severity</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Reported</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {priority.slice(0, 6).map((i) => (
                  <tr key={i.id} className="transition hover:bg-slate-50/70">
                    <td className="td">
                      <Link to={`/analysis/${i.id}`} className="block">
                        <p className="font-medium text-navy-900 hover:text-blue-700">{i.title}</p>
                        <p className="text-xs text-slate-500">
                          <span className="font-mono">{i.id}</span> · {i.category}
                          {i.channel === 'voice' && <Mic className="ml-1 inline h-3 w-3 text-blue-500" />}
                        </p>
                      </Link>
                    </td>
                    <td className="td text-slate-600">{zoneById(i.zoneId)?.name ?? i.location}</td>
                    <td className="td"><SeverityBadge severity={i.severity} /></td>
                    <td className="td"><IncidentStatusBadge status={i.status} /></td>
                    <td className="td text-right text-xs text-slate-500">{timeAgo(i.reportedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Field response"
            subtitle={`${liveWOs.length} active work orders · ${crews.filter((c) => c.available).length} crews available`}
            action={<Link to="/work-orders" className="text-xs font-semibold text-blue-600 hover:text-blue-700">Manage →</Link>}
          />
          <ul className="divide-y divide-slate-100">
            {liveWOs.slice(0, 5).map((w) => (
              <li key={w.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-navy-900">{w.title}</p>
                  <WorkOrderStatusBadge status={w.status} />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" style={{ width: `${w.progress}%` }} />
                  </div>
                  <span className="font-mono text-[11px] text-slate-500">{w.id}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
