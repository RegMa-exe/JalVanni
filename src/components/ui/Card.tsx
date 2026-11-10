import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={clsx('card', className)}>{children}</section>
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <header className="card-header">
      <div className="min-w-0">
        <h2 className="card-title">{title}</h2>
        {subtitle && <p className="card-subtitle mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

export function StatCard({
  label,
  value,
  delta,
  deltaGood,
  icon: Icon,
  accent = 'blue',
  hint,
}: {
  label: string
  value: string
  delta?: string
  deltaGood?: boolean
  icon: LucideIcon
  accent?: 'blue' | 'cyan' | 'red' | 'green'
  hint?: string
}) {
  const accents = {
    blue: 'bg-blue-50 text-blue-600',
    cyan: 'bg-cyan-50 text-cyan-600',
    red: 'bg-red-50 text-red-600',
    green: 'bg-emerald-50 text-emerald-600',
  }
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
        <span className={clsx('grid h-9 w-9 place-items-center rounded-lg', accents[accent])}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-navy-900 tabular-nums">{value}</p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta && (
          <span className={clsx('font-semibold', deltaGood ? 'text-emerald-600' : 'text-red-600')}>{delta}</span>
        )}
        {hint && <span className="text-slate-500">{hint}</span>}
      </div>
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
