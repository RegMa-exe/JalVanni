import { useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  HardHat,
  LayoutGrid,
  List,
  Package,
  Plus,
  Timer,
  Truck,
} from 'lucide-react'
import { Card, CardHeader, PageHeader, StatCard } from '@/components/ui/Card'
import { SeverityBadge, WorkOrderStatusBadge } from '@/components/ui/Badge'
import { crewById, crews, workOrders as seed, zoneById } from '@/data/demo'
import { severityRank, timeUntil, workOrderStatusLabel } from '@/lib/format'
import type { WorkOrder, WorkOrderStatus } from '@/types'

const flow: WorkOrderStatus[] = ['open', 'assigned', 'en_route', 'on_site', 'completed']
const boardColumns: WorkOrderStatus[] = ['open', 'assigned', 'en_route', 'on_site', 'completed']
const progressFor: Record<WorkOrderStatus, number> = { open: 0, assigned: 5, en_route: 15, on_site: 50, completed: 100, on_hold: 0 }

export function WorkOrdersPage() {
  const [orders, setOrders] = useState<WorkOrder[]>(seed)
  const [view, setView] = useState<'table' | 'board'>('table')
  const [filter, setFilter] = useState<WorkOrderStatus | 'all'>('all')

  const update = (id: string, patch: Partial<WorkOrder>) => setOrders((os) => os.map((o) => (o.id === id ? { ...o, ...patch } : o)))

  const advance = (o: WorkOrder) => {
    const idx = flow.indexOf(o.status)
    if (idx < 0 || idx === flow.length - 1) return
    const next = flow[idx + 1]
    update(o.id, { status: next, progress: Math.max(o.progress, progressFor[next]) })
  }

  const assign = (o: WorkOrder, crewId: string) =>
    update(o.id, { crewId: crewId || undefined, status: crewId && o.status === 'open' ? 'assigned' : o.status })

  const visible = orders
    .filter((o) => filter === 'all' || o.status === filter)
    .sort((a, b) => severityRank[a.priority] - severityRank[b.priority])

  const count = (s: WorkOrderStatus) => orders.filter((o) => o.status === s).length

  return (
    <>
      <PageHeader
        title="Work Orders"
        description="Dispatch crews, track field progress and close the loop on every incident."
        actions={
          <>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              {(['table', 'board'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={clsx('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium capitalize', view === v ? 'bg-navy-900 text-white' : 'text-slate-600 hover:text-navy-900')}
                >
                  {v === 'table' ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />} {v}
                </button>
              ))}
            </div>
            <Link to="/analysis" className="btn btn-primary"><Plus className="h-4 w-4" /> New from incident</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Open / unassigned" value={String(count('open'))} icon={ClipboardList} accent="red" hint="awaiting dispatch" />
        <StatCard label="Crews in field" value={String(count('en_route') + count('on_site'))} icon={Truck} accent="blue" hint="en route or on site" />
        <StatCard label="Completed today" value={String(count('completed'))} icon={CheckCircle2} accent="green" delta="+2" deltaGood hint="vs. yesterday" />
        <StatCard label="SLA compliance" value="92%" icon={Timer} accent="cyan" delta="+3 pts" deltaGood hint="this week" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-4">
        <div className="2xl:col-span-3">
          {view === 'table' ? (
            <Card>
              <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-4 pt-3">
                {(['all', ...flow, 'on_hold'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilter(s)}
                    className={clsx(
                      '-mb-px border-b-2 px-3 pb-2.5 text-sm font-medium whitespace-nowrap transition',
                      filter === s ? 'border-blue-600 text-navy-900' : 'border-transparent text-slate-500 hover:text-navy-800',
                    )}
                  >
                    {s === 'all' ? 'All' : workOrderStatusLabel[s]}
                    <span className="ml-1.5 rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">{s === 'all' ? orders.length : count(s)}</span>
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px]">
                  <thead className="bg-slate-50/70">
                    <tr>
                      <th className="th">Work order</th>
                      <th className="th">Priority</th>
                      <th className="th">Status</th>
                      <th className="th">Crew</th>
                      <th className="th">Progress</th>
                      <th className="th">Due</th>
                      <th className="th" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visible.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50/60">
                        <td className="td">
                          <p className="font-medium text-navy-900">{o.title}</p>
                          <p className="text-xs text-slate-500">
                            <span className="font-mono">{o.id}</span> ·{' '}
                            <Link to={`/analysis/${o.incidentId}`} className="font-mono text-blue-600 hover:underline">{o.incidentId}</Link> · {zoneById(o.zoneId)?.name}
                          </p>
                        </td>
                        <td className="td"><SeverityBadge severity={o.priority} /></td>
                        <td className="td"><WorkOrderStatusBadge status={o.status} /></td>
                        <td className="td">
                          <select
                            value={o.crewId ?? ''}
                            onChange={(e) => assign(o, e.target.value)}
                            disabled={o.status === 'completed'}
                            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-navy-800 focus:border-blue-400 focus:outline-none disabled:bg-slate-50"
                          >
                            <option value="">Unassigned</option>
                            {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </td>
                        <td className="td">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                              <div className={clsx('h-full rounded-full', o.progress === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-600 to-cyan-400')} style={{ width: `${o.progress}%` }} />
                            </div>
                            <span className="font-mono text-[11px] text-slate-500">{o.progress}%</span>
                          </div>
                        </td>
                        <td className={clsx('td text-xs', timeUntil(o.dueAt) === 'overdue' && o.status !== 'completed' ? 'font-semibold text-red-600' : 'text-slate-500')}>
                          {o.status === 'completed' ? '—' : timeUntil(o.dueAt)}
                        </td>
                        <td className="td text-right">
                          {o.status !== 'completed' && o.status !== 'on_hold' && (
                            <button onClick={() => advance(o)} disabled={!o.crewId && o.status === 'open'} className="btn btn-ghost px-2.5 py-1 text-xs">
                              {workOrderStatusLabel[flow[flow.indexOf(o.status) + 1]]} <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {boardColumns.map((col) => {
                const items = orders.filter((o) => o.status === col)
                return (
                  <div key={col} className="rounded-xl bg-slate-100/70 p-3">
                    <div className="mb-3 flex items-center justify-between px-1">
                      <WorkOrderStatusBadge status={col} />
                      <span className="text-xs font-medium text-slate-500">{items.length}</span>
                    </div>
                    <div className="space-y-2.5">
                      {items.map((o) => (
                        <div key={o.id} className="card p-3">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[11px] text-slate-500">{o.id}</span>
                            <SeverityBadge severity={o.priority} />
                          </div>
                          <p className="mt-1.5 text-sm leading-snug font-medium text-navy-900">{o.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{zoneById(o.zoneId)?.name} · {crewById(o.crewId)?.name ?? 'Unassigned'}</p>
                          {col !== 'completed' && (
                            <button onClick={() => advance(o)} disabled={!o.crewId && o.status === 'open'} className="mt-2.5 flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:text-slate-400">
                              Move to {workOrderStatusLabel[flow[flow.indexOf(o.status) + 1]]} <ArrowRight className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                      {items.length === 0 && <p className="py-6 text-center text-xs text-slate-400">Nothing here</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Crew roster" subtitle="Shift B · 14:00 – 22:00" action={<HardHat className="h-4 w-4 text-slate-400" />} />
            <ul className="divide-y divide-slate-100">
              {crews.map((c) => {
                const jobs = orders.filter((o) => o.crewId === c.id && o.status !== 'completed').length
                const busy = jobs > 0
                return (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-navy-50 text-xs font-semibold text-navy-700">{c.id.slice(2)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-navy-900">{c.name}</p>
                      <p className="truncate text-xs text-slate-500">{c.lead} · {c.specialty}</p>
                    </div>
                    <span className={clsx('flex items-center gap-1.5 text-xs font-medium', busy ? 'text-amber-600' : 'text-emerald-600')}>
                      <span className={clsx('h-1.5 w-1.5 rounded-full', busy ? 'bg-amber-500' : 'bg-emerald-500')} />
                      {busy ? `${jobs} job${jobs > 1 ? 's' : ''}` : 'Free'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Material requirements" subtitle="For active work orders" action={<Package className="h-4 w-4 text-slate-400" />} />
            <ul className="space-y-2 p-5 text-sm">
              {orders
                .filter((o) => o.status !== 'completed')
                .flatMap((o) => o.materials.map((m) => ({ m, id: o.id })))
                .slice(0, 8)
                .map(({ m, id }) => (
                  <li key={id + m} className="flex items-center gap-2 text-navy-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                    <span className="flex-1 truncate">{m}</span>
                    <span className="font-mono text-[11px] text-slate-400">{id}</span>
                  </li>
                ))}
            </ul>
            <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              <CalendarClock className="h-3.5 w-3.5" /> Stores cut-off 18:00 today
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
