import { useSyncExternalStore } from 'react'
import { incidents as seed } from '@/data/demo'
import type { Incident } from '@/types'

/**
 * Minimal shared incident store (demo data + incidents created in this browser).
 * New incidents are kept in localStorage so they survive a reload during the demo.
 * Replace with the Prisma-backed API when persistence lands.
 */
const STORAGE_KEY = 'jalvaani.incidents.v1'

function loadCreated(): Incident[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Incident[]) : []
  } catch {
    return []
  }
}

let created: Incident[] = loadCreated()
let overrides: Record<string, Partial<Incident>> = {}
let snapshot: Incident[] = compute()
const listeners = new Set<() => void>()

function compute(): Incident[] {
  return [...created, ...seed].map((i) => (overrides[i.id] ? { ...i, ...overrides[i.id] } : i))
}

function emit() {
  snapshot = compute()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(created))
  } catch {
    /* storage unavailable — keep in memory */
  }
  listeners.forEach((l) => l())
}

export function useIncidents(): Incident[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshot,
  )
}

export function nextIncidentId(): string {
  const max = Math.max(...snapshot.map((i) => Number(i.id.replace(/\D/g, '')) || 0))
  return `INC-${max + 1}`
}

export function addIncident(incident: Incident) {
  created = [incident, ...created]
  emit()
}

export function updateIncident(id: string, patch: Partial<Incident>) {
  if (created.some((i) => i.id === id)) created = created.map((i) => (i.id === id ? { ...i, ...patch } : i))
  else overrides = { ...overrides, [id]: { ...overrides[id], ...patch } }
  emit()
}
