import clsx from 'clsx'
import type { IncidentStatus, Severity, WorkOrderStatus } from '@/types'
import { incidentStatusLabel, workOrderStatusLabel } from '@/lib/format'

type Tone = 'red' | 'orange' | 'amber' | 'blue' | 'cyan' | 'green' | 'slate' | 'violet'

const tones: Record<Tone, string> = {
  red: 'bg-red-50 text-red-700 ring-red-600/15',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/15',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/15',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-600/20',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/15',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/15',
}

const dots: Record<Tone, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  blue: 'bg-blue-500',
  cyan: 'bg-cyan-500',
  green: 'bg-emerald-500',
  slate: 'bg-slate-400',
  violet: 'bg-violet-500',
}

export function Badge({
  tone = 'slate',
  dot = false,
  children,
  className,
}: {
  tone?: Tone
  dot?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {dot && <span className={clsx('h-1.5 w-1.5 rounded-full', dots[tone])} />}
      {children}
    </span>
  )
}

const severityTone: Record<Severity, Tone> = { critical: 'red', high: 'orange', medium: 'amber', low: 'slate' }

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Badge tone={severityTone[severity]} dot>
      {severity[0].toUpperCase() + severity.slice(1)}
    </Badge>
  )
}

const incidentTone: Record<IncidentStatus, Tone> = {
  new: 'violet',
  triaged: 'blue',
  dispatched: 'cyan',
  in_progress: 'amber',
  resolved: 'green',
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return <Badge tone={incidentTone[status]}>{incidentStatusLabel[status]}</Badge>
}

const woTone: Record<WorkOrderStatus, Tone> = {
  open: 'violet',
  assigned: 'blue',
  en_route: 'cyan',
  on_site: 'amber',
  completed: 'green',
  on_hold: 'slate',
}

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  return <Badge tone={woTone[status]}>{workOrderStatusLabel[status]}</Badge>
}
