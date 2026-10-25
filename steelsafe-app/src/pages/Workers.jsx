import React, { useState, useMemo } from 'react'
import {
  Users, Award, AlertTriangle, ShieldCheck, ShieldAlert,
  TrendingUp, TrendingDown, Search, Filter, Plus, ChevronRight,
  Clock, Calendar, UserCheck, Flame, X, CheckCircle2, ArrowUpRight
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { AccessGate } from '../components/AccessGate'
import { useApp } from '../context/AppContext'
import { workerService } from '../services/workerService'
import { clsx } from 'clsx'

export default function Workers() {
  const { currentUser, incidents, showToast } = useApp()

  const [search, setSearch] = useState('')
  const [shiftFilter, setShiftFilter] = useState('All')
  const [tierFilter, setTierFilter] = useState('All')
  const [selectedWorker, setSelectedWorker] = useState(null)
  const [isAddWorkerOpen, setIsAddWorkerOpen] = useState(false)

  // New worker form state
  const [newWorkerForm, setNewWorkerForm] = useState({
    name: '',
    role: '',
    department: 'Rolling Mill Line 02',
    shift: 'Morning',
    email: '',
  })

  // Compute live worker leaderboard linked to real-time incident records
  const leaderboard = useMemo(() => {
    return workerService.computeWorkerLeaderboard(incidents)
  }, [incidents])

  // Plant weekly safety score out of 100
  const plantWeeklyScore = useMemo(() => {
    return workerService.calculatePlantWeeklySafetyScore(incidents)
  }, [incidents])

  if (!currentUser) {
    return <AccessGate pageName="Worker Safety Intelligence" />
  }

  const isAdmin = currentUser.role === 'Admin'
  const isSupervisor = currentUser.role === 'Supervisor'

  // Filtered workers list
  const filteredWorkers = useMemo(() => {
    return leaderboard.filter(w => {
      const matchSearch =
        !search.trim() ||
        w.name.toLowerCase().includes(search.toLowerCase()) ||
        w.badgeId.toLowerCase().includes(search.toLowerCase()) ||
        w.role.toLowerCase().includes(search.toLowerCase()) ||
        w.department.toLowerCase().includes(search.toLowerCase())

      const matchShift = shiftFilter === 'All' || w.shift === shiftFilter
      const matchTier = tierFilter === 'All' || w.tier.includes(tierFilter)

      return matchSearch && matchShift && matchTier
    })
  }, [leaderboard, search, shiftFilter, tierFilter])

  // Aggregate Metrics
  const avgSafetyScore = useMemo(() => {
    if (leaderboard.length === 0) return 100
    const sum = leaderboard.reduce((acc, w) => acc + w.safetyScore, 0)
    return Math.round((sum / leaderboard.length) * 10) / 10
  }, [leaderboard])

  const repeatViolatorsCount = useMemo(() => {
    return leaderboard.filter(w => w.repeatViolations >= 2).length
  }, [leaderboard])

  const handleCreateWorker = (e) => {
    e.preventDefault()
    if (!newWorkerForm.name.trim()) return

    const created = workerService.addWorker(newWorkerForm)
    showToast({
      title: 'Worker Profile Enrolled',
      message: `${created.name} (${created.badgeId}) added to safety roster.`,
      variant: 'success',
    })
    setIsAddWorkerOpen(false)
    setNewWorkerForm({
      name: '',
      role: '',
      department: 'Rolling Mill Line 02',
      shift: 'Morning',
      email: '',
    })
  }

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">
            Worker Safety Intelligence
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Operator compliance scoring, repeat violation tracking, and historical safety trend charts
          </p>
        </div>

        {isAdmin && (
          <Button
            onClick={() => setIsAddWorkerOpen(true)}
            className="shadow-glow gap-2 font-bold text-xs"
          >
            <Plus className="size-4" /> Enroll Worker
          </Button>
        )}
      </div>

      {/* ── Top Hero Metrics Row ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Weekly Plant Safety Index */}
        <div className="glass rounded-2xl p-4 border border-primary/40 relative overflow-hidden">
          <div className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full bg-primary/20 blur-xl" />
          <div className="flex items-center gap-2 text-muted-foreground">
            <Award className="size-4 text-primary" />
            <span className="text-[11px] uppercase tracking-wider font-bold">Plant Weekly Score</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-foreground">
              {plantWeeklyScore.score}
            </span>
            <span className="text-sm font-semibold text-muted-foreground">/ 100</span>
            <span className="rounded-md bg-success/15 px-1.5 py-0.5 text-[10px] font-bold text-success ml-auto">
              {plantWeeklyScore.grade}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground truncate">
            {plantWeeklyScore.status}
          </div>
        </div>

        {/* Average Worker Safety Score */}
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="size-4 text-success" />
            <span className="text-[11px] uppercase tracking-wider font-bold">Average Worker Score</span>
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-foreground">
            {avgSafetyScore}%
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Across {leaderboard.length} active operators
          </div>
        </div>

        {/* Repeat Violations Count */}
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldAlert className="size-4 text-warning" />
            <span className="text-[11px] uppercase tracking-wider font-bold">Repeat Violators</span>
          </div>
          <div className={clsx(
            'mt-2 font-display text-3xl font-bold',
            repeatViolatorsCount > 0 ? 'text-warning' : 'text-foreground'
          )}>
            {repeatViolatorsCount}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {repeatViolatorsCount > 0 ? 'Requires supervisor counseling' : 'Zero repeat safety lapses'}
          </div>
        </div>

        {/* Total Monitored Workforce */}
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4 text-sky" />
            <span className="text-[11px] uppercase tracking-wider font-bold">Active Roster</span>
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-foreground">
            {leaderboard.length}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Tag violations in Incident Drawer
          </div>
        </div>
      </div>

      {/* ── 4-Week Safety Trend Chart (Visual SVG Progression) ── */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" />
              Safety Score Trend (Past 4 Weeks)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Weekly safety score trajectory comparing top and caution performer cohorts
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2.5 rounded-full bg-emerald-500" /> Top Performers (&gt;95)
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2.5 rounded-full bg-warning" /> Caution / Repeat Tagged
            </span>
          </div>
        </div>

        {/* Trend Bar Chart */}
        <div className="grid grid-cols-4 gap-3 pt-2">
          {['Week 1 (Oct 04)', 'Week 2 (Oct 11)', 'Week 3 (Oct 18)', 'Current Week (Oct 25)'].map((weekLabel, idx) => {
            // Aggregate cohort averages for each week index
            const topScores = leaderboard.slice(0, 4).map(w => w.trend[idx])
            const cautionScores = leaderboard.slice(-3).map(w => w.trend[idx])
            const avgTop = Math.round(topScores.reduce((a, b) => a + b, 0) / topScores.length)
            const avgCaution = Math.round(cautionScores.reduce((a, b) => a + b, 0) / cautionScores.length)

            return (
              <div key={weekLabel} className="glass rounded-xl p-3 border border-border flex flex-col justify-between">
                <span className="text-[11px] font-bold text-muted-foreground">{weekLabel}</span>

                <div className="my-3 space-y-2">
                  <div>
                    <div className="flex justify-between text-[10px] font-semibold text-muted-foreground mb-1">
                      <span>Top Tier</span>
                      <span className="text-success font-bold">{avgTop}%</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${avgTop}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] font-semibold text-muted-foreground mb-1">
                      <span>Caution Cohort</span>
                      <span className="text-warning font-bold">{avgCaution}%</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-warning rounded-full transition-all duration-500"
                        style={{ width: `${avgCaution}%` }}
                      />
                    </div>
                  </div>
                </div>

                <span className="text-[10px] text-muted-foreground">
                  Plant Net: <strong className="text-foreground">{Math.round((avgTop + avgCaution) / 2)}%</strong>
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── Leaderboard Table & Filters ── */}
      <Card className="p-4 sm:p-6">
        {/* Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search worker by name, badge ID, department..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="glass w-full rounded-xl py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Shift Filter */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="size-3 text-primary" />
              <span>Shift:</span>
              <select
                value={shiftFilter}
                onChange={e => setShiftFilter(e.target.value)}
                className="glass rounded-xl px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="All">All Shifts</option>
                <option value="Morning">Morning Shift</option>
                <option value="Afternoon">Afternoon Shift</option>
                <option value="Night">Night Shift</option>
              </select>
            </div>
          </div>

          <span className="text-xs text-muted-foreground font-semibold">
            Showing {filteredWorkers.length} of {leaderboard.length} workers
          </span>
        </div>

        {/* Leaderboard Table */}
        <div className="overflow-x-auto rounded-xl border border-border bg-card/40">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th className="py-3 px-3 font-semibold text-center w-12">Rank</th>
                <th className="py-3 px-4 font-semibold">Worker Details</th>
                <th className="py-3 px-3 font-semibold">Department & Shift</th>
                <th className="py-3 px-4 font-semibold text-center">Safety Score</th>
                <th className="py-3 px-3 font-semibold text-center">Violations</th>
                <th className="py-3 px-4 font-semibold text-center">4-Wk Trend</th>
                <th className="py-3 px-3 font-semibold text-right">Dossier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredWorkers.map((w, index) => {
                const isGold = index === 0
                const isSilver = index === 1
                const isBronze = index === 2

                return (
                  <tr
                    key={w.id}
                    onClick={() => setSelectedWorker(w)}
                    className="hover:bg-accent/40 transition cursor-pointer group"
                  >
                    {/* Rank */}
                    <td className="py-3 px-3 text-center">
                      <span className={clsx(
                        'inline-grid size-6 place-items-center rounded-full text-xs font-black shadow-sm',
                        isGold ? 'bg-amber-400 text-black' :
                        isSilver ? 'bg-slate-300 text-black' :
                        isBronze ? 'bg-amber-700 text-white' :
                        'bg-muted/80 text-muted-foreground'
                      )}>
                        {index + 1}
                      </span>
                    </td>

                    {/* Worker Name & Badge */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className={clsx(
                          'grid size-9 place-items-center rounded-xl text-xs font-bold text-white shadow-sm',
                          w.safetyScore >= 95 ? 'bg-emerald-600' :
                          w.safetyScore >= 80 ? 'bg-primary' :
                          'bg-amber-600'
                        )}>
                          {w.avatar}
                        </div>
                        <div>
                          <p className="font-bold text-foreground group-hover:text-primary transition flex items-center gap-1.5">
                            {w.name}
                            {w.hasRepeatViolation && (
                              <span className="rounded bg-destructive/20 text-destructive text-[9px] font-black px-1.5 py-0.2 animate-pulse">
                                REPEAT HAZARD
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {w.badgeId} · {w.role}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Department & Shift */}
                    <td className="py-3 px-3">
                      <p className="font-medium text-foreground">{w.department}</p>
                      <span className={clsx(
                        'inline-block mt-0.5 rounded px-1.5 py-0.2 text-[10px] font-semibold',
                        w.shift === 'Morning' ? 'bg-amber-500/15 text-amber-500' :
                        w.shift === 'Afternoon' ? 'bg-sky/15 text-sky' :
                        'bg-purple-500/15 text-purple-400'
                      )}>
                        {w.shift} Shift
                      </span>
                    </td>

                    {/* Safety Score (0-100) */}
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span className={clsx(
                          'font-display text-lg font-bold',
                          w.safetyScore >= 95 ? 'text-success' :
                          w.safetyScore >= 80 ? 'text-sky' :
                          w.safetyScore >= 70 ? 'text-warning' :
                          'text-destructive'
                        )}>
                          {w.safetyScore}
                        </span>
                        <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden mt-0.5">
                          <div
                            className={clsx(
                              'h-full rounded-full transition-all',
                              w.safetyScore >= 95 ? 'bg-success' :
                              w.safetyScore >= 80 ? 'bg-sky' :
                              w.safetyScore >= 70 ? 'bg-warning' :
                              'bg-destructive'
                            )}
                            style={{ width: `${w.safetyScore}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Repeat Violation Counts */}
                    <td className="py-3 px-3 text-center">
                      {w.repeatViolations > 0 ? (
                        <span className={clsx(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold',
                          w.repeatViolations >= 2
                            ? 'bg-destructive/20 text-destructive border border-destructive/40'
                            : 'bg-warning/20 text-warning border border-warning/40'
                        )}>
                          <AlertTriangle className="size-3" />
                          {w.repeatViolations} {w.repeatViolations === 1 ? 'Violation' : 'Repeats'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success">
                          <ShieldCheck className="size-3.5" /> Clean Record
                        </span>
                      )}
                    </td>

                    {/* Trend Mini-Sparkline */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1 font-mono text-[10px] text-muted-foreground">
                        {w.trend.map((val, tIdx) => (
                          <span
                            key={tIdx}
                            className={clsx(
                              'px-1 py-0.2 rounded',
                              tIdx === 3 ? 'font-bold bg-card border border-border text-foreground' : 'opacity-60'
                            )}
                          >
                            {val}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* View Drawer Button */}
                    <td className="py-3 px-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedWorker(w)
                        }}
                        className="h-7 text-xs gap-1 group-hover:bg-primary group-hover:text-white transition"
                      >
                        File <ChevronRight className="size-3" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── WORKER SAFETY FILE DRAWER ── */}
      {selectedWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="glass flex h-full w-full max-w-lg flex-col border-l border-border bg-card p-6 shadow-2xl animate-in slide-in-from-right duration-300 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="grid size-12 place-items-center rounded-2xl bg-primary text-white font-bold text-base shadow-glow">
                  {selectedWorker.avatar}
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">
                    {selectedWorker.name}
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono">
                    Badge ID: {selectedWorker.badgeId} · {selectedWorker.shift} Shift
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedWorker(null)}
                className="grid size-8 place-items-center rounded-lg border border-border hover:bg-accent text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Score & Tier Overview */}
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="glass rounded-xl p-3 border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Safety Score</span>
                <p className="mt-1 font-display text-2xl font-bold text-foreground">
                  {selectedWorker.safetyScore} <span className="text-xs text-muted-foreground">/ 100</span>
                </p>
              </div>

              <div className="glass rounded-xl p-3 border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Violation Record</span>
                <p className="mt-1 font-display text-2xl font-bold text-foreground">
                  {selectedWorker.repeatViolations}{' '}
                  <span className="text-xs text-muted-foreground">
                    {selectedWorker.repeatViolations === 1 ? 'incident' : 'repeats'}
                  </span>
                </p>
              </div>
            </div>

            {/* Role & Department Details */}
            <div className="mt-4 rounded-xl border border-border bg-card/60 p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Assigned Role:</span>
                <span className="font-bold text-foreground">{selectedWorker.role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Department:</span>
                <span className="font-bold text-foreground">{selectedWorker.department}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shift Interval:</span>
                <span className="font-bold text-foreground">{selectedWorker.shift} Shift (8h active)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-mono text-muted-foreground">{selectedWorker.email}</span>
              </div>
            </div>

            {/* Tagged Incidents Audit Trail */}
            <div className="mt-6 flex-1">
              <h4 className="font-display text-sm font-bold text-foreground mb-3 flex items-center justify-between">
                <span>Tagged Safety Incidents ({selectedWorker.taggedIncidents.length})</span>
                <span className="text-[10px] text-muted-foreground font-mono">Real-time attribution</span>
              </h4>

              {selectedWorker.taggedIncidents.length === 0 ? (
                <div className="rounded-xl border border-border bg-card/40 p-6 text-center text-xs text-muted-foreground">
                  <CheckCircle2 className="size-8 text-success mx-auto mb-2 opacity-80" />
                  <p className="font-bold text-foreground">Exemplary Compliance</p>
                  <p className="mt-1">No PPE violations or restricted perimeter intrusions tagged to this operator.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedWorker.taggedIncidents.map(inc => (
                    <div key={inc.id} className="rounded-xl border border-border bg-card/70 p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-foreground truncate">{inc.type}</span>
                        <Badge variant={inc.severity === 'Critical' ? 'destructive' : inc.severity === 'High' ? 'warning' : 'default'}>
                          {inc.severity}
                        </Badge>
                      </div>

                      {inc.snapshot_url && (
                        <div className="h-24 w-full overflow-hidden rounded-lg border border-border bg-black">
                          <img src={inc.snapshot_url} alt="Incident" className="size-full object-cover" />
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{inc.zone}</span>
                        <span>{new Date(inc.created_at).toLocaleString()}</span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-border/60 text-[10px]">
                        <span className="text-muted-foreground">Status: <strong className="text-foreground">{inc.status}</strong></span>
                        <span className="text-muted-foreground">Lead: {inc.owner || 'Unassigned'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Close Drawer Button */}
            <div className="mt-6 pt-4 border-t border-border">
              <Button
                variant="outline"
                className="w-full text-xs font-semibold"
                onClick={() => setSelectedWorker(null)}
              >
                Close Safety File
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── ENROLL WORKER MODAL (Admin Only) ── */}
      {isAddWorkerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="glass w-full max-w-md rounded-2xl border border-border p-6 shadow-2xl relative">
            <button
              onClick={() => setIsAddWorkerOpen(false)}
              className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg border border-border hover:bg-accent text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>

            <h3 className="font-display text-lg font-bold text-foreground mb-1">
              Enroll Plant Worker
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Create an operator safety profile to enable incident attribution and score tracking.
            </p>

            <form onSubmit={handleCreateWorker} className="flex flex-col gap-3.5">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vikram Patel"
                  value={newWorkerForm.name}
                  onChange={e => setNewWorkerForm({ ...newWorkerForm, name: e.target.value })}
                  className="glass mt-1 w-full rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Designation / Role</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ladle Turret Operator"
                  value={newWorkerForm.role}
                  onChange={e => setNewWorkerForm({ ...newWorkerForm, role: e.target.value })}
                  className="glass mt-1 w-full rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Department</label>
                  <select
                    value={newWorkerForm.department}
                    onChange={e => setNewWorkerForm({ ...newWorkerForm, department: e.target.value })}
                    className="glass mt-1 w-full rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="Rolling Mill Line 02">Rolling Mill</option>
                    <option value="Furnace Smelting Bay">Blast Furnace</option>
                    <option value="Casting Bay Turret">Casting Bay</option>
                    <option value="Raw Material Yard">Transit Yard</option>
                    <option value="Maintenance & EHS">Maintenance</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Shift</label>
                  <select
                    value={newWorkerForm.shift}
                    onChange={e => setNewWorkerForm({ ...newWorkerForm, shift: e.target.value })}
                    className="glass mt-1 w-full rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="Morning">Morning Shift</option>
                    <option value="Afternoon">Afternoon Shift</option>
                    <option value="Night">Night Shift</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Work Email</label>
                <input
                  type="email"
                  placeholder="v.patel@steelsafe.ai"
                  value={newWorkerForm.email}
                  onChange={e => setNewWorkerForm({ ...newWorkerForm, email: e.target.value })}
                  className="glass mt-1 w-full rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button size="sm" variant="outline" type="button" onClick={() => setIsAddWorkerOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" type="submit" className="shadow-glow font-bold">
                  Enroll & Initialize Score
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
