import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import {
  Bell,
  ClipboardList,
  Droplets,
  LayoutDashboard,
  Menu,
  Mic,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { useIncidents } from '@/store/incidents'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/voice', label: 'Voice Reporting', icon: Mic },
  { to: '/analysis', label: 'Incident Analysis', icon: Sparkles },
  { to: '/work-orders', label: 'Work Orders', icon: ClipboardList },
]

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 shadow-sm">
        <Droplets className="h-5 w-5 text-white" />
      </span>
      <div className="leading-tight">
        <p className="text-[15px] font-semibold text-white">JalVaani</p>
        <p className="text-[11px] text-navy-300">Water Operations Command</p>
      </div>
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const incidents = useIncidents()
  const open = incidents.filter((i) => i.status !== 'resolved').length
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Brand />
      </div>
      <nav className="mt-2 flex-1 space-y-1 px-3">
        <p className="px-3 pb-2 text-[10px] font-semibold tracking-widest text-navy-400 uppercase">Operations</p>
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                isActive ? 'bg-white/10 text-white' : 'text-navy-200 hover:bg-white/5 hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={clsx('h-[18px] w-[18px]', isActive ? 'text-cyan-300' : 'text-navy-300')} />
                <span className="flex-1">{label}</span>
                {to === '/analysis' && (
                  <span className="rounded-md bg-cyan-400/15 px-1.5 py-0.5 text-[11px] font-semibold text-cyan-300">
                    {open}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          All systems operational
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-navy-300">
          SCADA feed live · Voice intake online · 5 crews on shift
        </p>
      </div>
    </div>
  )
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="hidden text-right md:block">
      <p className="font-mono text-sm text-navy-900 tabular-nums">
        {now.toLocaleTimeString('en-IN', { hour12: false })}
      </p>
      <p className="text-[11px] text-slate-500">
        {now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · IST
      </p>
    </div>
  )
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setMobileOpen(false), [location.pathname])

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 bg-navy-950 lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-navy-950 shadow-2xl">
            <button
              className="absolute top-5 right-4 rounded-md p-1 text-navy-300 hover:text-white"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button
            className="rounded-lg p-2 text-navy-700 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search incidents, work orders, zones…" />
          </div>
          <div className="ml-auto flex items-center gap-4">
            <span className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 sm:inline-flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
            <LiveClock />
            <button className="relative rounded-lg p-2 text-navy-700 hover:bg-slate-100" aria-label="Notifications">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
            </button>
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-navy-900 text-xs font-semibold text-white">
                OC
              </span>
              <div className="hidden leading-tight xl:block">
                <p className="text-sm font-medium text-navy-900">Ops Controller</p>
                <p className="text-[11px] text-slate-500">Control Room · Shift B</p>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
