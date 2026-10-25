import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, Download, AlertTriangle, ShieldAlert, CheckCircle,
  Filter, ShieldCheck, X, Eye, Clock, Camera, MapPin, User,
  FileText, ArrowRight, Check, RefreshCw, Users, HardHat
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Card, CardContent } from '../components/ui/Card'
import { AccessGate } from '../components/AccessGate'
import { useApp } from '../context/AppContext'
import { workerService } from '../services/workerService'
import { clsx } from 'clsx'

const SEVERITIES = ['All', 'Critical', 'High', 'Medium', 'Low']
const STATUSES = ['All', 'Open', 'Acknowledged', 'Resolved']

const SEVERITY_BADGE = {
  Low:      'low',
  Medium:   'medium',
  High:     'high',
  Critical: 'critical',
}

const STATUS_BADGE = {
  Open:         'bg-destructive/15 text-destructive border border-destructive/30',
  Acknowledged: 'bg-warning/15 text-warning border border-warning/30',
  Resolved:     'bg-success/15 text-success border border-success/30',
}

function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100)
  const color =
    pct >= 90 ? 'var(--success)'
    : pct >= 75 ? 'var(--sky)'
    : 'var(--warning)'
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span
        className="text-xs tabular-nums text-muted-foreground font-semibold"
      >
        {pct}%
      </span>
    </div>
  )
}

export default function Incidents() {
  const { incidents, updateIncident, showToast, currentUser } = useApp()

  // Filter States
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [zoneFilter, setZoneFilter] = useState('All')
  const [dateFilter, setDateFilter] = useState('')

  // Detail Drawer State
  const [selectedIncident, setSelectedIncident] = useState(null)
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [editNotes, setEditNotes] = useState('')
  const [editOwner, setEditOwner] = useState('')
  const [editWorkerId, setEditWorkerId] = useState('')
  const [editWorkerName, setEditWorkerName] = useState('')

  const availableWorkers = useMemo(() => workerService.getWorkers(), [])

  if (!currentUser) {
    return <AccessGate pageName="Incidents Audit Log" />
  }

  const canModify = currentUser.role === 'Admin' || currentUser.role === 'Supervisor'

  // Distinct Zones in incidents for filter dropdown
  const availableZones = useMemo(() => {
    const set = new Set()
    incidents.forEach(i => { if (i.zone) set.add(i.zone) })
    return ['All', ...Array.from(set)]
  }, [incidents])

  // Filtered and Sorted Incidents
  const filtered = useMemo(() => {
    return incidents.filter(inc => {
      // Search
      const matchSearch =
        !search.trim() ||
        inc.type.toLowerCase().includes(search.toLowerCase()) ||
        (inc.zone && inc.zone.toLowerCase().includes(search.toLowerCase())) ||
        (inc.camera && inc.camera.toLowerCase().includes(search.toLowerCase())) ||
        (inc.owner && inc.owner.toLowerCase().includes(search.toLowerCase())) ||
        (inc.notes && inc.notes.toLowerCase().includes(search.toLowerCase())) ||
        (inc.worker_name && inc.worker_name.toLowerCase().includes(search.toLowerCase()))

      // Severity
      const matchSeverity = severityFilter === 'All' || inc.severity === severityFilter

      // Status
      const matchStatus = statusFilter === 'All' || inc.status === statusFilter

      // Zone
      const matchZone = zoneFilter === 'All' || inc.zone === zoneFilter

      // Date (YYYY-MM-DD)
      const matchDate = !dateFilter || (inc.created_at && inc.created_at.startsWith(dateFilter))

      return matchSearch && matchSeverity && matchStatus && matchZone && matchDate
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [incidents, search, severityFilter, statusFilter, zoneFilter, dateFilter])

  // Open Detail Drawer
  const handleOpenDetail = (inc) => {
    setSelectedIncident(inc)
    setEditNotes(inc.notes || '')
    setEditOwner(inc.owner || 'Unassigned')
    setEditWorkerId(inc.worker_id || '')
    setEditWorkerName(inc.worker_name || '')
    setIsEditingNotes(false)
  }

  // Handle Status Transition: Open -> Acknowledged -> Resolved
  const handleStatusChange = async (newStatus) => {
    if (!selectedIncident) return
    const updated = await updateIncident(selectedIncident.id, {
      status: newStatus,
      owner: editOwner,
      notes: editNotes,
      worker_id: editWorkerId || selectedIncident.worker_id || null,
      worker_name: editWorkerName || selectedIncident.worker_name || null,
    })
    setSelectedIncident(updated)
    showToast({
      title: `Incident ${newStatus}`,
      message: `${selectedIncident.type} is now marked as ${newStatus}.`,
      variant: newStatus === 'Resolved' ? 'success' : 'default',
    })
  }

  // Save Notes, Owner & Worker Attribution
  const handleSaveDetails = async () => {
    if (!selectedIncident) return
    const updated = await updateIncident(selectedIncident.id, {
      owner: editOwner,
      notes: editNotes,
      worker_id: editWorkerId || null,
      worker_name: editWorkerName || null,
    })
    setSelectedIncident(updated)
    setIsEditingNotes(false)
    showToast({
      title: 'Incident Updated',
      message: 'Worker attribution and investigation notes saved to database.',
      variant: 'success',
    })
  }

  // Export CSV
  const exportCSV = () => {
    const headers = 'ID,Created At,Type,Severity,Confidence,Zone,Camera,Status,Owner,Worker,Notes,Resolved At'
    const rows = filtered.map(i => {
      const notes = (i.notes || '').replace(/"/g, '""')
      const worker = (i.worker_name || '').replace(/"/g, '""')
      return `"${i.id}","${i.created_at}","${i.type}","${i.severity}","${Math.round(i.confidence * 100)}%","${i.zone}","${i.camera}","${i.status}","${i.owner || ''}","${worker}","${notes}","${i.resolved_at || ''}"`
    })
    const blob = new Blob([[headers, ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `steelsafe-incidents-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">
            Incidents
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Audit log of all AI safety violations & restricted zone intrusions
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1.5 text-xs font-semibold">
              <Download className="size-3.5" /> Export CSV ({filtered.length})
            </Button>
          )}
        </div>
      </div>

      {/* ── Status KPI Row ── */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {['All', 'Open', 'Acknowledged', 'Resolved'].map(st => {
          const count = st === 'All' ? incidents.length : incidents.filter(i => i.status === st).length
          const isSelected = statusFilter === st
          return (
            <div
              key={st}
              onClick={() => setStatusFilter(st)}
              className={clsx(
                'glass cursor-pointer rounded-2xl p-4 transition-all',
                isSelected ? 'ring-2 ring-primary border-primary/50' : 'hover:border-primary/30'
              )}
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs uppercase tracking-wider font-semibold">{st} Incidents</span>
                {st === 'Open' && count > 0 && (
                  <span className="size-2 rounded-full bg-destructive animate-ping" />
                )}
              </div>
              <div className="mt-2 font-display text-3xl font-bold text-foreground">
                {count}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Filters Bar ── */}
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by violation type, zone, camera, owner, notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="glass w-full rounded-xl py-2 pl-9 pr-4 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Zone Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-semibold">Zone:</span>
            <select
              value={zoneFilter}
              onChange={e => setZoneFilter(e.target.value)}
              className="glass rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {availableZones.map(z => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-semibold">Date:</span>
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="glass rounded-xl px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                className="text-xs text-muted-foreground hover:text-foreground"
                title="Clear date"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Severity & Status Quick Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/60">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Severity:</span>
            {SEVERITIES.map(s => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={clsx(
                  'rounded-full px-2.5 py-0.5 text-xs font-semibold transition',
                  severityFilter === s
                    ? 'bg-primary text-white shadow-glow'
                    : 'border border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Status:</span>
            {STATUSES.map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={clsx(
                  'rounded-full px-2.5 py-0.5 text-xs font-semibold transition',
                  statusFilter === st
                    ? 'bg-accent text-accent-foreground border border-primary/50'
                    : 'border border-border text-muted-foreground hover:bg-accent'
                )}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Incidents Table with Snapshot Thumbnails ── */}
      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <ShieldCheck className="size-12 opacity-20 text-primary" />
            <p className="font-display text-lg font-bold text-foreground">
              No matching incidents found
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Try adjusting your search criteria or trigger a live detection test on the Live Monitor page.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-card/60 text-muted-foreground uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 pl-4 pr-2">Snapshot</th>
                  <th className="py-3 px-3">Time</th>
                  <th className="py-3 px-3">Violation Type</th>
                  <th className="py-3 px-3">Severity</th>
                  <th className="py-3 px-3">Confidence</th>
                  <th className="py-3 px-3">Zone / Camera</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 pl-2 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map(inc => {
                  const isIntrusion = inc.type.toLowerCase().includes('intrusion')
                  return (
                    <tr
                      key={inc.id}
                      onClick={() => handleOpenDetail(inc)}
                      className="cursor-pointer transition hover:bg-accent/40"
                    >
                      {/* Snapshot Thumbnail */}
                      <td className="py-2.5 pl-4 pr-2">
                        <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-black/60 shadow-inner">
                          {inc.snapshot_url ? (
                            <img
                              src={inc.snapshot_url}
                              alt="Snapshot"
                              className="size-full object-cover"
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center">
                              <Camera className="size-4 text-muted-foreground opacity-40" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/20 hover:opacity-0 transition" />
                        </div>
                      </td>

                      {/* Time */}
                      <td className="py-2.5 px-3 tabular-nums font-medium text-muted-foreground whitespace-nowrap">
                        <div>
                          {new Date(inc.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </div>
                        <div className="text-[10px] opacity-75">
                          {new Date(inc.created_at).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      </td>

                      {/* Violation Type */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={clsx('font-bold', isIntrusion ? 'text-destructive' : 'text-foreground')}>
                            {inc.type}
                          </span>
                          {(inc.is_simulated || inc.type?.includes('[SIMULATED]') || inc.notes?.includes('SIMULATED')) && (
                            <span className="rounded bg-amber-500/15 border border-amber-500/30 text-amber-400 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">
                              Simulated
                            </span>
                          )}
                        </div>
                        {inc.worker_name && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-primary font-semibold">
                            <Users className="size-3 shrink-0" />
                            <span className="truncate max-w-[160px]">{inc.worker_name}</span>
                          </div>
                        )}
                        {inc.notes && (
                          <div className="mt-0.5 line-clamp-1 max-w-[200px] text-[10px] text-muted-foreground">
                            {inc.notes}
                          </div>
                        )}
                      </td>

                      {/* Severity */}
                      <td className="py-2.5 px-3">
                        <Badge variant={SEVERITY_BADGE[inc.severity] || 'default'}>
                          {inc.severity}
                        </Badge>
                      </td>

                      {/* Confidence */}
                      <td className="py-2.5 px-3">
                        <ConfidenceBar value={inc.confidence} />
                      </td>

                      {/* Zone & Camera */}
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-foreground truncate max-w-[150px]">
                          {inc.zone}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                          {inc.camera}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3">
                        <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold', STATUS_BADGE[inc.status])}>
                          {inc.status}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-2.5 pl-2 pr-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenDetail(inc)
                          }}
                          className="h-7 px-2.5 text-xs text-primary hover:bg-primary/10"
                        >
                          <Eye className="size-3.5 mr-1" /> View
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── DETAIL DRAWER MODAL ── */}
      {selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="glass flex h-full w-full max-w-lg flex-col border-l border-border bg-card p-6 shadow-2xl animate-in slide-in-from-right duration-300 overflow-y-auto">
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    Incident Report · {selectedIncident.id}
                  </span>
                  {(selectedIncident.is_simulated || selectedIncident.type?.includes('[SIMULATED]') || selectedIncident.notes?.includes('SIMULATED')) && (
                    <span className="rounded bg-amber-500/15 border border-amber-500/30 text-amber-400 px-1.5 py-0.2 text-[9px] font-black uppercase">
                      Simulated Data
                    </span>
                  )}
                </div>
                <h3 className="font-display text-xl font-bold text-foreground">
                  {selectedIncident.type}
                </h3>
              </div>
              <button
                onClick={() => setSelectedIncident(null)}
                className="grid size-8 place-items-center rounded-lg border border-border hover:bg-accent text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Snapshot Preview with Overlay Frame */}
            <div className="mt-4">
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Evidence Snapshot (Boxes & Perimeter Overlay)
              </label>
              <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black shadow-inner">
                {selectedIncident.snapshot_url ? (
                  <img
                    src={selectedIncident.snapshot_url}
                    alt="Incident Snapshot"
                    className="size-full object-contain"
                  />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Camera className="size-8 opacity-30" />
                    <span className="text-xs">No snapshot available</span>
                  </div>
                )}
                <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
                  <span className="size-1.5 rounded-full bg-red-500" />
                  <span>AI DETECT RECORD</span>
                </div>
              </div>
            </div>

            {/* Status Workflow Controls: Open -> Acknowledged -> Resolved */}
            <div className="mt-5 rounded-xl border border-border bg-card/60 p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-muted-foreground block">
                  Workflow Status Flow
                </label>
                {!canModify && (
                  <span className="text-[10px] text-sky font-semibold bg-sky/15 px-2 py-0.5 rounded-full border border-sky/30">
                    Viewer: Read-Only
                  </span>
                )}
              </div>

              {!canModify ? (
                <div className="rounded-xl border border-border bg-background/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">{currentUser.role} Role</strong> is view-only.
                    <br />
                    Supervisor or Admin role is required to transition incident status.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    variant={selectedIncident.status === 'Open' ? 'destructive' : 'outline'}
                    onClick={() => handleStatusChange('Open')}
                    className="text-xs font-bold"
                  >
                    Open
                  </Button>
                  <Button
                    size="sm"
                    variant={selectedIncident.status === 'Acknowledged' ? 'default' : 'outline'}
                    onClick={() => handleStatusChange('Acknowledged')}
                    className={clsx(
                      'text-xs font-bold',
                      selectedIncident.status === 'Acknowledged' ? 'bg-warning text-black hover:bg-warning/90' : ''
                    )}
                  >
                    Acknowledged
                  </Button>
                  <Button
                    size="sm"
                    variant={selectedIncident.status === 'Resolved' ? 'default' : 'outline'}
                    onClick={() => handleStatusChange('Resolved')}
                    className={clsx(
                      'text-xs font-bold',
                      selectedIncident.status === 'Resolved' ? 'bg-success text-white hover:bg-success/90' : ''
                    )}
                  >
                    Resolved
                  </Button>
                </div>
              )}

              {selectedIncident.resolved_at && (
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-success font-semibold">
                  <CheckCircle className="size-3.5" />
                  <span>Resolved on {new Date(selectedIncident.resolved_at).toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Metadata Grid */}
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="glass rounded-xl p-3">
                <span className="text-muted-foreground block text-[10px] font-semibold uppercase">Severity</span>
                <div className="mt-1">
                  <Badge variant={SEVERITY_BADGE[selectedIncident.severity] || 'default'}>
                    {selectedIncident.severity}
                  </Badge>
                </div>
              </div>

              <div className="glass rounded-xl p-3">
                <span className="text-muted-foreground block text-[10px] font-semibold uppercase">Confidence Score</span>
                <p className="mt-1 text-sm font-bold text-foreground">
                  {Math.round((selectedIncident.confidence || 0) * 100)}%
                </p>
              </div>

              <div className="glass rounded-xl p-3">
                <span className="text-muted-foreground block text-[10px] font-semibold uppercase">Zone Location</span>
                <p className="mt-1 font-semibold text-foreground truncate">
                  {selectedIncident.zone}
                </p>
              </div>

              <div className="glass rounded-xl p-3">
                <span className="text-muted-foreground block text-[10px] font-semibold uppercase">Camera Feed</span>
                <p className="mt-1 font-semibold text-foreground truncate">
                  {selectedIncident.camera}
                </p>
              </div>
            </div>

            {/* Tagged Worker Attribution */}
            <div className="mt-4 flex flex-col gap-2.5 rounded-xl border border-border bg-card/60 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Users className="size-3.5 text-primary" />
                  <label className="text-xs font-semibold text-muted-foreground">
                    Attributed Plant Worker
                  </label>
                </div>
                {!isEditingNotes && canModify && (
                  <button
                    onClick={() => setIsEditingNotes(true)}
                    className="text-[11px] text-primary hover:underline font-semibold"
                  >
                    {selectedIncident.worker_name ? 'Change Worker' : 'Tag Worker'}
                  </button>
                )}
              </div>

              {isEditingNotes ? (
                <div className="flex flex-col gap-2">
                  <select
                    value={editWorkerId}
                    onChange={(e) => {
                      const selectedId = e.target.value
                      setEditWorkerId(selectedId)
                      if (!selectedId) {
                        setEditWorkerName('')
                      } else {
                        const found = availableWorkers.find(w => w.id === selectedId)
                        setEditWorkerName(found ? `${found.name} (${found.badgeId})` : selectedId)
                      }
                    }}
                    className="glass w-full rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">-- No Worker Tagged / Unassigned --</option>
                    {availableWorkers.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name} · {w.badgeId} ({w.role})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground leading-normal">
                    Tagging a worker links this incident to their EHS profile, safety score, and repeat violation count.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {selectedIncident.worker_name ? (
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/20 text-xs font-bold text-primary border border-primary/40">
                          {selectedIncident.worker_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground">
                            {selectedIncident.worker_name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            ID: {selectedIncident.worker_id || 'wrk-assigned'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        No worker tagged to this violation yet.
                      </span>
                    )}
                  </div>
                  {selectedIncident.worker_name && (
                    <Link
                      to="/workers"
                      className="text-[11px] text-primary hover:underline font-semibold flex items-center gap-1"
                    >
                      Workers Page &rarr;
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Owner & Investigation Notes */}
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">
                  Owner / Assigned Lead
                </label>
                {!isEditingNotes && canModify && (
                  <button
                    onClick={() => setIsEditingNotes(true)}
                    className="text-[11px] text-primary hover:underline font-semibold"
                  >
                    Edit
                  </button>
                )}
              </div>

              {isEditingNotes ? (
                <input
                  type="text"
                  value={editOwner}
                  onChange={e => setEditOwner(e.target.value)}
                  placeholder="e.g. Marcus Vance (Shift Lead)"
                  className="glass w-full rounded-xl px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              ) : (
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <User className="size-3.5 text-primary" />
                  <span>{selectedIncident.owner || 'Unassigned'}</span>
                </div>
              )}

              <div className="pt-2 border-t border-border/60">
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                  Incident Notes & Remediation
                </label>
                {isEditingNotes ? (
                  <textarea
                    rows={3}
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    placeholder="Enter observation notes, corrective actions, or remediation verification..."
                    className="glass w-full rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                ) : (
                  <p className="text-xs text-muted-foreground leading-relaxed italic">
                    {selectedIncident.notes || 'No investigation notes recorded for this safety event.'}
                  </p>
                )}
              </div>

              {isEditingNotes && (
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditNotes(selectedIncident.notes || '')
                      setEditOwner(selectedIncident.owner || 'Unassigned')
                      setEditWorkerId(selectedIncident.worker_id || '')
                      setEditWorkerName(selectedIncident.worker_name || '')
                      setIsEditingNotes(false)
                    }}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="shadow-glow text-xs"
                    onClick={handleSaveDetails}
                  >
                    Save Changes
                  </Button>
                </div>
              )}
            </div>

            {/* Timestamp Audit Trail */}
            <div className="mt-auto pt-6 text-[10px] text-muted-foreground">
              <p>Logged in Lovable Cloud: {new Date(selectedIncident.created_at).toLocaleString()}</p>
              {selectedIncident.resolved_at && (
                <p className="text-success mt-0.5">Resolved in Lovable Cloud: {new Date(selectedIncident.resolved_at).toLocaleString()}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
