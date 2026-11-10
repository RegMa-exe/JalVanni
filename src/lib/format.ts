import type { IncidentStatus, Severity, WorkOrderStatus } from '@/types'

export function timeAgo(iso: string): string {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (diff < 1) return 'just now'
  if (diff < 60) return `${diff}m ago`
  const h = Math.floor(diff / 60)
  if (h < 24) return `${h}h ${diff % 60}m ago`
  return `${Math.floor(h / 24)}d ago`
}

export function timeUntil(iso: string): string {
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / 60_000)
  if (diff < 0) return 'overdue'
  if (diff < 60) return `in ${diff}m`
  const h = Math.floor(diff / 60)
  if (h < 24) return `in ${h}h ${diff % 60}m`
  return `in ${Math.floor(h / 24)}d`
}

export const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

export const formatNumber = (n: number) => n.toLocaleString('en-IN')

export const severityRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }

export const incidentStatusLabel: Record<IncidentStatus, string> = {
  new: 'New',
  triaged: 'Triaged',
  dispatched: 'Dispatched',
  in_progress: 'In Progress',
  resolved: 'Resolved',
}

export const workOrderStatusLabel: Record<WorkOrderStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  en_route: 'En Route',
  on_site: 'On Site',
  completed: 'Completed',
  on_hold: 'On Hold',
}
