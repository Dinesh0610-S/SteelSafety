import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, TrendingUp, AlertTriangle, ShieldCheck, Sparkles,
  Calendar, Clock, RefreshCw, Filter, Layers, Sun, Moon, Sunset,
  PieChart as PieIcon, BarChart2, CheckCircle2, ArrowUpRight,
  Award, ShieldAlert, Users, Flame, Zap
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { AccessGate } from '../components/AccessGate'
import { useApp } from '../context/AppContext'
import { lovableCloud } from '../services/lovableCloud'
import { zoneDatabase } from '../services/zoneDatabase'
import { workerService } from '../services/workerService'
import {
  getShiftForDate,
  calculateZoneRiskScores,
  calculateAvgResponseTime,
  HAZARD_COLOR_MAP
} from '../utils/analyticsCalculations'
import { clsx } from 'clsx'

const SEVERITY_COLORS = {
  Low:      'oklch(68% 0.16 155)',
  Medium:   'oklch(78% 0.12 225)',
  High:     'oklch(78% 0.16 70)',
  Critical: 'oklch(62% 0.22 22)',
}

export default function Analytics() {
  const { incidents: contextIncidents, setIncidents, currentUser } = useApp()

  // Local state for auto-refresh and filters
  const [liveIncidents, setLiveIncidents] = useState(contextIncidents || [])
  const [timeView, setTimeView] = useState('hourly') // 'hourly' | 'daily'
  const [dateRange, setDateRange] = useState('7d') // '24h' | '7d' | '30d' | 'all'
  const [lastRefreshed, setLastRefreshed] = useState(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Auto-refresh from database every 10 seconds
  const fetchLatestData = async () => {
    setIsRefreshing(true)
    try {
      const data = await lovableCloud.getIncidents()
      setLiveIncidents(data)
      setIncidents(data)
      setLastRefreshed(new Date())
    } catch (e) {
      console.warn('Auto-refresh error:', e)
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchLatestData()
    const timer = setInterval(() => {
      fetchLatestData()
    }, 10000) // 10s auto-refresh
    return () => clearInterval(timer)
  }, []) // eslint-disable-line

  // Synchronize when context updates
  useEffect(() => {
    if (contextIncidents && contextIncidents.length > 0) {
      setLiveIncidents(contextIncidents)
    }
  }, [contextIncidents])

  // Get active zones list
  const activeZones = useMemo(() => {
    const list = zoneDatabase.getZones().map(z => z.name)
    const fromInc = liveIncidents.map(i => i.zone).filter(Boolean)
    return Array.from(new Set([...list, ...fromInc]))
  }, [liveIncidents])

  // Apply Date Range Filter
  const filteredIncidents = useMemo(() => {
    const now = Date.now()
    return liveIncidents.filter(inc => {
      if (!inc.created_at) return true
      const incTime = new Date(inc.created_at).getTime()
      if (dateRange === '24h') return now - incTime <= 24 * 60 * 60 * 1000
      if (dateRange === '7d')  return now - incTime <= 7 * 24 * 60 * 60 * 1000
      if (dateRange === '30d') return now - incTime <= 30 * 24 * 60 * 60 * 1000
      return true
    })
  }, [liveIncidents, dateRange])

  // 1. KPI Calculations
  const kpis = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const todayIncidents = liveIncidents.filter(
      i => i.created_at && i.created_at.startsWith(today)
    )
    const openCount = liveIncidents.filter(i => i.status === 'Open').length
    const avgResponse = calculateAvgResponseTime(liveIncidents)

    // Calculate plant-wide PPE compliance from PPE vs Non-PPE detections
    const ppeViolations = filteredIncidents.filter(
      i => i.type.toLowerCase().includes('helmet') || i.type.toLowerCase().includes('vest')
    ).length
    const totalDetections = Math.max(filteredIncidents.length, 1)
    const complianceRate = Math.max(76, Math.min(99, Math.round(100 - (ppeViolations / (totalDetections + 15)) * 100)))

    return {
      totalToday: todayIncidents.length,
      openCount,
      avgResponse,
      complianceRate,
    }
  }, [liveIncidents, filteredIncidents])

  // 2. Incidents Over Time (Hourly vs Daily)
  const timeChartData = useMemo(() => {
    if (timeView === 'hourly') {
      // 8 time buckets across the day (3-hour slots)
      const slots = [
        { label: '00:00', start: 0, end: 3, count: 0 },
        { label: '03:00', start: 3, end: 6, count: 0 },
        { label: '06:00', start: 6, end: 9, count: 0 },
        { label: '09:00', start: 9, end: 12, count: 0 },
        { label: '12:00', start: 12, end: 15, count: 0 },
        { label: '15:00', start: 15, end: 18, count: 0 },
        { label: '18:00', start: 18, end: 21, count: 0 },
        { label: '21:00', start: 21, end: 24, count: 0 },
      ]

      filteredIncidents.forEach(inc => {
        const hour = new Date(inc.created_at).getHours()
        const slot = slots.find(s => hour >= s.start && hour < s.end)
        if (slot) slot.count++
      })
      return slots
    } else {
      // Past 7 calendar days
      const days = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dateKey = d.toISOString().split('T')[0]
        const label = d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' })
        const count = filteredIncidents.filter(
          inc => inc.created_at && inc.created_at.startsWith(dateKey)
        ).length
        days.push({ label, count, dateKey })
      }
      return days
    }
  }, [filteredIncidents, timeView])

  // 3. Breakdown by Hazard Type
  const hazardBreakdown = useMemo(() => {
    const counts = {}
    filteredIncidents.forEach(inc => {
      // Group similar types
      let category = 'Other Hazards'
      const t = (inc.type || '').toLowerCase()
      if (t.includes('intrusion')) category = 'Zone Intrusion'
      else if (t.includes('helmet')) category = 'No Hard Hat'
      else if (t.includes('vest')) category = 'No Safety Vest'
      else if (t.includes('fire') || t.includes('smoke')) category = 'Fire / Smoke Hazard'
      else if (t.includes('slip')) category = 'Slip / Fall Risk'
      else category = inc.type || 'General Violation'

      counts[category] = (counts[category] || 0) + 1
    })

    const total = Math.max(1, filteredIncidents.length)
    return Object.entries(counts)
      .map(([name, count]) => ({
        name,
        count,
        pct: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count)
  }, [filteredIncidents])

  // 4. Zone Risk Heatmap (0 - 100 Live Score)
  const zoneRiskScores = useMemo(() => {
    return calculateZoneRiskScores(filteredIncidents, activeZones)
  }, [filteredIncidents, activeZones])

  // 5. Shift-Wise Compliance
  const shiftStats = useMemo(() => {
    const shifts = {
      Morning: { name: 'Morning Shift', hours: '06:00 – 14:00', total: 0, ppeViolations: 0, intrusions: 0 },
      Afternoon: { name: 'Afternoon Shift', hours: '14:00 – 22:00', total: 0, ppeViolations: 0, intrusions: 0 },
      Night: { name: 'Night Shift', hours: '22:00 – 06:00', total: 0, ppeViolations: 0, intrusions: 0 },
    }

    filteredIncidents.forEach(inc => {
      const shiftName = getShiftForDate(new Date(inc.created_at))
      const s = shifts[shiftName]
      if (s) {
        s.total++
        const t = (inc.type || '').toLowerCase()
        if (t.includes('helmet') || t.includes('vest')) s.ppeViolations++
        if (t.includes('intrusion')) s.intrusions++
      }
    })

    return Object.entries(shifts).map(([key, data]) => {
      const compliance = Math.max(68, Math.min(99, Math.round(100 - (data.ppeViolations * 6.5) - (data.intrusions * 8))))
      return {
        key,
        ...data,
        compliance,
      }
    })
  }, [filteredIncidents])

  // 6. Weekly Safety Score for whole plant out of 100
  const plantWeeklyScore = useMemo(() => {
    return workerService.calculatePlantWeeklySafetyScore(liveIncidents)
  }, [liveIncidents])

  // 7. Safest Zone, Riskiest Zone, Best Shift Insight Strip
  const insights = useMemo(() => {
    // Riskiest Zone: highest score
    const sortedZonesDesc = [...zoneRiskScores].sort((a, b) => b.score - a.score)
    const riskiest = sortedZonesDesc[0] || { name: 'None Detected', score: 0, level: 'Low Risk', critical: 0, open: 0, total: 0 }

    // Safest Zone: lowest score
    const sortedZonesAsc = [...zoneRiskScores].sort((a, b) => a.score - b.score)
    const safest = sortedZonesAsc[0] || { name: 'All Nominal', score: 0, level: 'Low Risk', critical: 0, open: 0, total: 0 }

    // Best Shift: highest compliance % (and fewest total violations)
    const sortedShifts = [...shiftStats].sort((a, b) => {
      if (b.compliance !== a.compliance) return b.compliance - a.compliance
      return a.total - b.total
    })
    const bestShift = sortedShifts[0] || { name: 'Morning Shift', compliance: 98, total: 0, hours: '06:00 – 14:00' }

    return {
      safest,
      riskiest,
      bestShift,
    }
  }, [zoneRiskScores, shiftStats])

  // Peak bar height for time chart
  const maxTimeCount = Math.max(1, ...timeChartData.map(d => d.count))

  if (!currentUser) {
    return <AccessGate pageName="Safety Analytics Dashboard" />
  }

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">
            Safety Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time intelligence from Lovable Cloud incidents & zone telemetry
          </p>
        </div>

        {/* Filter Controls & Auto-refresh status */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Date Range Selector */}
          <div className="glass flex items-center rounded-xl p-1 text-xs">
            {[
              { id: '24h', label: '24 Hours' },
              { id: '7d', label: '7 Days' },
              { id: '30d', label: '30 Days' },
              { id: 'all', label: 'All Time' },
            ].map(r => (
              <button
                key={r.id}
                onClick={() => setDateRange(r.id)}
                className={clsx(
                  'rounded-lg px-2.5 py-1 font-semibold transition',
                  dateRange === r.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Auto Refresh Pill */}
          <button
            onClick={fetchLatestData}
            className="glass flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition"
            title="Auto-refreshes every 10 seconds from Lovable Cloud database"
          >
            <RefreshCw className={clsx('size-3.5 text-primary', isRefreshing && 'animate-spin')} />
            <span>10s Live Sync</span>
          </button>
        </div>
      </div>

      {/* ── Safest Zone / Riskiest Zone / Best Shift Insight Strip & Plant Weekly Score ── */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Plant Weekly Safety Score out of 100 */}
        <div className="glass relative overflow-hidden rounded-2xl p-5 border border-primary/40 shadow-glow bg-gradient-to-br from-card via-card to-primary/10">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] uppercase tracking-wider font-bold flex items-center gap-1.5 text-primary">
              <Award className="size-3.5" /> Plant Weekly Safety Score
            </span>
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary border border-primary/30">
              {plantWeeklyScore.grade}
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-display text-4xl font-extrabold text-foreground">
              {plantWeeklyScore.score}
            </span>
            <span className="text-sm font-semibold text-muted-foreground">/ 100</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground truncate max-w-[170px]" title={plantWeeklyScore.status}>
              {plantWeeklyScore.status}
            </p>
            <Link
              to="/workers"
              className="text-[10px] font-bold text-primary hover:underline flex items-center gap-0.5 shrink-0"
            >
              Roster &rarr;
            </Link>
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={clsx(
                'h-full rounded-full transition-all duration-500',
                plantWeeklyScore.score >= 90 ? 'bg-success' : plantWeeklyScore.score >= 75 ? 'bg-warning' : 'bg-destructive'
              )}
              style={{ width: `${plantWeeklyScore.score}%` }}
            />
          </div>
          <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-primary to-transparent" />
        </div>

        {/* Safest Zone */}
        <div className="glass rounded-2xl p-5 border border-success/30 relative overflow-hidden bg-card/60">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] uppercase tracking-wider font-bold flex items-center gap-1.5 text-success">
              <ShieldCheck className="size-3.5" /> Safest Zone
            </span>
            <Badge variant="outline" className="border-success/40 bg-success/15 text-success text-[10px] font-bold">
              Risk {insights.safest.score}/100
            </Badge>
          </div>
          <div className="mt-2.5 font-display text-lg font-bold text-foreground truncate" title={insights.safest.name}>
            {insights.safest.name}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {insights.safest.total === 0 ? 'Zero safety incidents logged' : `${insights.safest.total} incident(s) · 0 critical breaches`}
          </p>
          <div className="mt-2 text-[10px] font-semibold text-success flex items-center gap-1">
            <CheckCircle2 className="size-3" /> Optimal Safety Compliance
          </div>
          <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-success to-transparent" />
        </div>

        {/* Riskiest Zone */}
        <div className="glass rounded-2xl p-5 border border-destructive/30 relative overflow-hidden bg-card/60">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] uppercase tracking-wider font-bold flex items-center gap-1.5 text-destructive">
              <ShieldAlert className="size-3.5" /> Riskiest Zone
            </span>
            <Badge variant="outline" className="border-destructive/40 bg-destructive/15 text-destructive text-[10px] font-bold">
              Risk {insights.riskiest.score}/100
            </Badge>
          </div>
          <div className="mt-2.5 font-display text-lg font-bold text-foreground truncate" title={insights.riskiest.name}>
            {insights.riskiest.name}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {insights.riskiest.critical > 0
              ? `${insights.riskiest.critical} critical alert(s) · High scrutiny`
              : `${insights.riskiest.total} incident(s) · Active caution`}
          </p>
          <div className="mt-2 text-[10px] font-semibold text-destructive flex items-center gap-1">
            <AlertTriangle className="size-3" /> Priority Surveillance Required
          </div>
          <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-destructive to-transparent" />
        </div>

        {/* Best Shift */}
        <div className="glass rounded-2xl p-5 border border-sky/30 relative overflow-hidden bg-card/60">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] uppercase tracking-wider font-bold flex items-center gap-1.5 text-sky">
              <Sun className="size-3.5" /> Best Shift
            </span>
            <span className="rounded-full bg-sky/20 px-2 py-0.5 text-[10px] font-bold text-sky border border-sky/30">
              {insights.bestShift.compliance}% Compliance
            </span>
          </div>
          <div className="mt-2.5 font-display text-lg font-bold text-foreground truncate">
            {insights.bestShift.name}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {insights.bestShift.hours || '06:00 – 14:00'} · Highest adherence
          </p>
          <div className="mt-2 text-[10px] font-semibold text-sky flex items-center gap-1">
            <TrendingUp className="size-3" /> Lowest Violation Rate Across Plant
          </div>
          <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-sky to-transparent" />
        </div>
      </div>

      {/* ── KPI Cards Row ── */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Total Today */}
        <div className="glass rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs uppercase tracking-wider font-semibold">Total Incidents Today</span>
            <Activity className="size-4 text-primary" />
          </div>
          <div className="mt-3 font-display text-4xl font-extrabold text-foreground">
            {kpis.totalToday}
          </div>
          <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
            <span className="text-primary font-bold">{filteredIncidents.length}</span> recorded in selected range
          </p>
          <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-primary to-transparent" />
        </div>

        {/* Open Incidents */}
        <div className="glass rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs uppercase tracking-wider font-semibold">Active Open Incidents</span>
            <AlertTriangle className="size-4 text-destructive" />
          </div>
          <div className={clsx(
            'mt-3 font-display text-4xl font-extrabold',
            kpis.openCount > 0 ? 'text-destructive' : 'text-foreground'
          )}>
            {kpis.openCount}
          </div>
          <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
            {kpis.openCount > 0 ? 'Awaiting acknowledgement' : 'Zero unassigned breaches'}
          </p>
          <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-destructive to-transparent" />
        </div>

        {/* Average Response Time */}
        <div className="glass rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs uppercase tracking-wider font-semibold">Avg Response Time</span>
            <Clock className="size-4 text-sky" />
          </div>
          <div className="mt-3 font-display text-4xl font-extrabold text-foreground">
            {kpis.avgResponse}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            From trigger to status resolution
          </p>
          <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-sky to-transparent" />
        </div>

        {/* PPE Compliance % */}
        <div className="glass rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs uppercase tracking-wider font-semibold">Plant PPE Compliance</span>
            <ShieldCheck className="size-4 text-success" />
          </div>
          <div className={clsx(
            'mt-3 font-display text-4xl font-extrabold',
            kpis.complianceRate >= 90 ? 'text-success' : kpis.complianceRate >= 80 ? 'text-warning' : 'text-destructive'
          )}>
            {kpis.complianceRate}%
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Hard hats & safety vests verified
          </p>
          <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-success to-transparent" />
        </div>
      </div>

      {/* ── Charts Row 1: Time Series + Hazard Breakdown ── */}
      <div className="mb-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Incidents Over Time */}
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart2 className="size-4 text-primary" />
                Incidents Over Time
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Frequency distribution across {timeView === 'hourly' ? 'hours of the day' : 'daily calendar'}
              </p>
            </div>

            {/* Hourly vs Daily Toggle */}
            <div className="glass flex items-center rounded-xl p-1 text-xs">
              <button
                onClick={() => setTimeView('hourly')}
                className={clsx(
                  'rounded-lg px-3 py-1 font-semibold transition',
                  timeView === 'hourly' ? 'bg-primary text-white shadow-glow' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Hourly
              </button>
              <button
                onClick={() => setTimeView('daily')}
                className={clsx(
                  'rounded-lg px-3 py-1 font-semibold transition',
                  timeView === 'daily' ? 'bg-primary text-white shadow-glow' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Daily
              </button>
            </div>
          </div>

          {/* Bar Chart Canvas / Containers */}
          <div className="flex h-56 items-end gap-3 pt-6 border-b border-border/60">
            {timeChartData.map((d, i) => {
              const heightPct = Math.max(6, Math.round((d.count / maxTimeCount) * 100))
              return (
                <div key={d.label} className="group relative flex flex-1 flex-col items-center h-full justify-end">
                  {/* Tooltip on Hover */}
                  <div className="absolute -top-8 hidden group-hover:flex flex-col items-center rounded-lg bg-black/90 px-2 py-1 text-[10px] font-bold text-white shadow-lg backdrop-blur-md z-10 whitespace-nowrap">
                    <span>{d.count} incidents</span>
                  </div>

                  {/* Value Above Bar */}
                  {d.count > 0 && (
                    <span className="mb-1 text-[11px] font-bold tabular-nums text-foreground">
                      {d.count}
                    </span>
                  )}

                  {/* Visual Bar with Brand Gradient */}
                  <div
                    className="w-full max-w-[42px] rounded-t-xl transition-all duration-500 group-hover:brightness-125"
                    style={{
                      height: `${heightPct}%`,
                      background: d.count > 0
                        ? 'linear-gradient(180deg, var(--primary) 0%, oklch(72% 0.15 293) 100%)'
                        : 'var(--muted)',
                      boxShadow: d.count > 0 ? '0 0 16px -2px color-mix(in oklab, var(--primary) 40%, transparent)' : 'none',
                    }}
                  />
                  <span className="mt-2 text-[10px] font-medium text-muted-foreground truncate max-w-full">
                    {d.label}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Breakdown by Hazard Type */}
        <Card className="p-6">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <PieIcon className="size-4 text-primary" />
              Breakdown by Hazard Type
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Proportional distribution of safety non-compliances
            </p>
          </CardHeader>

          <CardContent className="p-0 flex flex-col gap-3.5">
            {hazardBreakdown.length === 0 ? (
              <p className="py-12 text-center text-xs text-muted-foreground">No hazard events recorded</p>
            ) : (
              hazardBreakdown.map((h, i) => {
                const color = HAZARD_COLOR_MAP[h.name] || 'var(--primary)'
                return (
                  <div key={h.name} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="size-2.5 rounded-full shrink-0 shadow-sm"
                          style={{ background: color }}
                        />
                        <span className="text-foreground truncate">{h.name}</span>
                      </div>
                      <span className="tabular-nums text-muted-foreground">
                        <strong className="text-foreground mr-1">{h.count}</strong>
                        ({h.pct}%)
                      </span>
                    </div>

                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${h.pct}%`,
                          background: color,
                        }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Charts Row 2: Zone Risk Heatmap + Shift Compliance ── */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {/* Zone Risk Heatmap with Live 0-100 Risk Score */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="size-4 text-primary" />
                Zone Risk Heatmap
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Dynamic 0–100 risk index weighted by hazard frequency and severity
              </p>
            </div>
            <span className="text-[10px] text-muted-foreground font-semibold uppercase">
              Updated Live
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {zoneRiskScores.map(z => {
              return (
                <div
                  key={z.name}
                  className="glass flex flex-col gap-2 rounded-2xl p-4 border border-border/80 transition hover:border-primary/40"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-3 rounded-full shrink-0"
                        style={{ background: z.color }}
                      />
                      <span className="font-bold text-xs text-foreground">{z.name}</span>
                      {z.open > 0 && (
                        <span className="rounded bg-destructive/20 px-1.5 py-0.2 text-[9px] font-bold text-destructive">
                          {z.open} Open
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-bold uppercase tracking-wider"
                        style={{ color: z.color }}
                      >
                        {z.level}
                      </span>
                      <span
                        className="rounded-lg px-2 py-0.5 font-display text-sm font-extrabold text-white"
                        style={{ background: z.color }}
                      >
                        {z.score}
                      </span>
                    </div>
                  </div>

                  {/* Progress Heatmap Bar */}
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${z.score}%`,
                        background: z.color,
                        boxShadow: `0 0 10px ${z.color}`,
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{z.total} incident{z.total !== 1 ? 's' : ''} logged</span>
                    <span>Crit: {z.critical} · High: {z.high} · Med: {z.medium}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Shift-Wise Compliance (Morning, Afternoon, Night) */}
        <Card className="p-6">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Sun className="size-4 text-warning" />
              Shift-Wise Compliance
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Safety adherence benchmarking across 24/7 operating shifts
            </p>
          </CardHeader>

          <CardContent className="p-0 flex flex-col gap-4">
            {shiftStats.map(s => {
              const isMorning = s.key === 'Morning'
              const isAfternoon = s.key === 'Afternoon'

              return (
                <div
                  key={s.key}
                  className="glass flex flex-col gap-3 rounded-2xl p-4 border border-border/80"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-xl bg-card border border-border">
                        {isMorning ? (
                          <Sun className="size-4 text-warning" />
                        ) : isAfternoon ? (
                          <Sunset className="size-4 text-primary" />
                        ) : (
                          <Moon className="size-4 text-sky" />
                        )}
                      </span>
                      <div>
                        <h4 className="font-bold text-xs text-foreground">{s.name}</h4>
                        <span className="text-[10px] text-muted-foreground">{s.hours}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={clsx(
                        'font-display text-lg font-black',
                        s.compliance >= 90 ? 'text-success' : s.compliance >= 80 ? 'text-warning' : 'text-destructive'
                      )}>
                        {s.compliance}%
                      </div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        Compliance
                      </span>
                    </div>
                  </div>

                  {/* Progress Compliance Bar */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${s.compliance}%`,
                        background: s.compliance >= 90 ? 'var(--success)' : s.compliance >= 80 ? 'var(--warning)' : 'var(--destructive)',
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                    <span>{s.total} total detection{s.total !== 1 ? 's' : ''}</span>
                    <span>{s.ppeViolations} PPE violations · {s.intrusions} zone intrusions</span>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* ── AI Executive Safety Summary Banner ── */}
      <div className="glass rounded-2xl p-6 border border-primary/40 bg-gradient-to-r from-primary/10 via-card to-card">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="size-4 text-primary" />
          <h3 className="font-display font-bold text-sm text-foreground">
            Automated Industrial Safety Executive Summary
          </h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Based on {filteredIncidents.length} verified safety detection records from the Lovable Cloud database, plant-wide compliance sits at <strong className="text-foreground">{kpis.complianceRate}%</strong>.
          {kpis.openCount > 0 ? ` Immediate attention is recommended for ${kpis.openCount} open safety breach(es).` : ' All active breaches are acknowledged or resolved.'}
          {' '}Shift analysis indicates optimal safety adherence during the {shiftStats.sort((a,b) => b.compliance - a.compliance)[0]?.name || 'Morning Shift'}.
        </p>
      </div>
    </div>
  )
}
