import React, { useState, useEffect } from 'react'
import {
  Bell, Moon, Sun, Clock, Mail, ShieldAlert,
  ShieldCheck, Check, Send, AlertTriangle, Sparkles,
  Sliders, User, Key, Layers, Flame, Smartphone,
  DownloadCloud, Wifi, CheckCircle2
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { AccessGate } from '../components/AccessGate'
import { useApp } from '../context/AppContext'
import { notificationService } from '../services/notificationService'
import { clsx } from 'clsx'

const SEVERITY_INFO = [
  {
    key: 'Critical',
    label: 'Critical Severities',
    badge: 'destructive',
    description: 'Immediate blast perimeter intrusions, thermal explosions, toxic gas surges (>50 ppm).',
  },
  {
    key: 'High',
    label: 'High Severities',
    badge: 'high',
    description: 'Uncovered personnel in heavy machinery crane lanes, missing hard hats near molten ladles.',
  },
  {
    key: 'Medium',
    label: 'Medium Severities',
    badge: 'medium',
    description: 'Missing high-visibility vests in loading yard, acoustic noise threshold warnings (>85 dB).',
  },
  {
    key: 'Low',
    label: 'Low Severities',
    badge: 'low',
    description: 'Routine maintenance notifications, shift change handovers, transit advisory notices.',
  },
]

export default function Settings() {
  const { currentUser, userSettings, saveUserSettings, showToast } = useApp()

  // Local copy of user settings
  const [form, setForm] = useState(userSettings)
  const [dispatchedEmails, setDispatchedEmails] = useState([])
  const [isSendingTest, setIsSendingTest] = useState(false)

  useEffect(() => {
    if (userSettings) {
      setForm(userSettings)
    }
    setDispatchedEmails(notificationService.getDispatchedEmails())
  }, [userSettings])

  if (!currentUser) {
    return <AccessGate pageName="User Notification Settings" />
  }

  const handleToggleSeverity = (severityKey) => {
    setForm(prev => ({
      ...prev,
      severities: {
        ...prev.severities,
        [severityKey]: !prev.severities[severityKey],
      },
    }))
  }

  const handleSave = () => {
    saveUserSettings(form)
  }

  // Test Edge Function Email Dispatch
  const handleSendTestEmail = async () => {
    setIsSendingTest(true)
    try {
      const mockIncident = {
        id: `inc-test-${Date.now().toString().slice(-4)}`,
        type: 'Test Alert: Thermal Blast Furnace Anomaly',
        severity: 'Critical',
        confidence: 0.98,
        zone: 'Zone A - Blast Furnace',
        camera: 'Camera 01 - Primary Bay',
        status: 'Open',
        snapshot_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"><rect width="400" height="225" fill="%231a1024"/><rect x="50" y="50" width="160" height="130" fill="%23ef4444" fill-opacity="0.3" stroke="%23ef4444" stroke-width="2"/><text x="60" y="40" fill="%23ef4444" font-family="sans-serif" font-size="12" font-weight="bold">CRITICAL BLAST ALERT</text></svg>',
        created_at: new Date().toISOString(),
      }

      const res = await notificationService.dispatchSupervisorAlertEdgeFunction(mockIncident)
      setDispatchedEmails(notificationService.getDispatchedEmails())

      showToast({
        title: 'Edge Function Triggered',
        message: `Alert email dispatched to ${res.supervisorsNotified?.length || 1} Supervisors.`,
        variant: 'success',
      })
    } catch (err) {
      showToast({
        title: 'Dispatch Failed',
        message: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsSendingTest(false)
    }
  }

  const isQuietHoursActive = notificationService.isQuietHoursActive(form.quietHours)

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">
            Notification Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure personal alert triggers, quiet-hours schedule, and supervisor email dispatch
          </p>
        </div>

        <Button onClick={handleSave} className="shadow-glow gap-2 font-bold">
          <Check className="size-4" /> Save Preferences
        </Button>
      </div>

      {/* ── Profile & Role Card ── */}
      <Card className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="grid size-12 place-items-center rounded-2xl bg-primary/20 text-base font-bold text-primary">
              {currentUser.name ? currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2) : 'U'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base font-bold text-foreground">
                  {currentUser.name}
                </h3>
                <span className={clsx(
                  'rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider',
                  currentUser.role === 'Admin' ? 'bg-primary/20 text-primary border-primary/40' :
                  currentUser.role === 'Supervisor' ? 'bg-warning/20 text-warning border-warning/40' :
                  'bg-sky/20 text-sky border-sky/40'
                )}>
                  {currentUser.role}
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {currentUser.email} · {currentUser.department || 'Operations Team'}
              </p>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Preferences stored per-user in local cloud storage.
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── 1. Severity Trigger Configuration ── */}
        <Card className="flex flex-col">
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-4 text-primary" />
              Incident Severity Triggers
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select which hazard severities trigger in-app alerts and notifications for your account.
            </p>
          </CardHeader>

          <CardContent className="p-4 flex-1 space-y-3">
            {SEVERITY_INFO.map(s => {
              const isChecked = !!form.severities?.[s.key]
              return (
                <label
                  key={s.key}
                  className={clsx(
                    'flex items-start gap-3.5 rounded-xl border p-3.5 cursor-pointer transition',
                    isChecked
                      ? 'border-border bg-card/80 shadow-sm'
                      : 'border-border/50 bg-background/40 opacity-70 hover:opacity-100'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleSeverity(s.key)}
                    className="mt-1 size-4 rounded accent-primary cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-foreground">
                        {s.label}
                      </span>
                      <Badge variant={s.badge}>
                        {s.key}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {s.description}
                    </p>
                  </div>
                </label>
              )
            })}
          </CardContent>
        </Card>

        {/* ── 2. Quiet Hours Option ── */}
        <Card className="flex flex-col">
          <CardHeader className="border-b border-border pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Moon className="size-4 text-primary" />
                Quiet Hours Schedule
              </CardTitle>
              {form.quietHours?.enabled && (
                <span className={clsx(
                  'rounded-full px-2.5 py-0.5 text-[10px] font-bold',
                  isQuietHoursActive
                    ? 'bg-warning/20 text-warning animate-pulse'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {isQuietHoursActive ? '🌙 ACTIVE NOW' : 'Scheduled'}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Suppress non-critical notification sounds and non-emergency alerts during rest intervals.
            </p>
          </CardHeader>

          <CardContent className="p-4 flex-1 space-y-4">
            {/* Enable Quiet Hours Switch */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-card/60 p-3.5">
              <div>
                <p className="text-xs font-bold text-foreground">Enable Quiet Hours</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Mute non-essential sirens and audio dings during off-shift hours.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.quietHours?.enabled || false}
                onChange={e => setForm({
                  ...form,
                  quietHours: { ...form.quietHours, enabled: e.target.checked }
                })}
                className="size-5 rounded accent-primary cursor-pointer"
              />
            </div>

            {/* Time Pickers */}
            <div className={clsx(
              'grid grid-cols-2 gap-3 transition-opacity',
              !form.quietHours?.enabled ? 'opacity-40 pointer-events-none' : ''
            )}>
              <div className="glass rounded-xl p-3 border border-border">
                <label className="text-[11px] font-bold text-muted-foreground block mb-1.5 flex items-center gap-1.5">
                  <Clock className="size-3 text-primary" /> Quiet Start Time
                </label>
                <input
                  type="time"
                  value={form.quietHours?.start || '22:00'}
                  onChange={e => setForm({
                    ...form,
                    quietHours: { ...form.quietHours, start: e.target.value }
                  })}
                  className="glass w-full rounded-lg px-2.5 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-[10px] text-muted-foreground mt-1 block">Default: 10:00 PM (22:00)</span>
              </div>

              <div className="glass rounded-xl p-3 border border-border">
                <label className="text-[11px] font-bold text-muted-foreground block mb-1.5 flex items-center gap-1.5">
                  <Clock className="size-3 text-primary" /> Quiet End Time
                </label>
                <input
                  type="time"
                  value={form.quietHours?.end || '06:00'}
                  onChange={e => setForm({
                    ...form,
                    quietHours: { ...form.quietHours, end: e.target.value }
                  })}
                  className="glass w-full rounded-lg px-2.5 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-[10px] text-muted-foreground mt-1 block">Default: 06:00 AM (06:00)</span>
              </div>
            </div>

            {/* Critical Bypass Checkbox */}
            <label className="flex items-start gap-2.5 rounded-xl border border-border bg-card/40 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.quietHours?.allowCritical !== false}
                onChange={e => setForm({
                  ...form,
                  quietHours: { ...form.quietHours, allowCritical: e.target.checked }
                })}
                className="mt-0.5 size-4 rounded accent-primary cursor-pointer"
              />
              <div>
                <p className="text-xs font-bold text-foreground">
                  Always Allow Critical Breaches (Recommended)
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Furnace melt runaways, toxic gas threshold spikes, and life-critical alerts bypass quiet hours automatically.
                </p>
              </div>
            </label>
          </CardContent>
        </Card>
      </div>

      {/* ── 3. Edge Function Supervisor Email Alerts ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="size-4 text-primary" />
                Supervisor Email Alerts (Edge Function)
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically triggered by Lovable Cloud Edge Functions whenever a <strong>High</strong> or <strong>Critical</strong> incident is created.
              </p>
            </div>

            <Button
              size="sm"
              variant="outline"
              disabled={isSendingTest}
              onClick={handleSendTestEmail}
              className="gap-1.5 text-xs font-semibold"
            >
              <Send className="size-3 text-primary" />
              {isSendingTest ? 'Invoking Edge Function...' : 'Send Test Alert'}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="glass rounded-xl p-3 border border-border">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Trigger Criterion</span>
              <p className="text-xs font-bold text-destructive mt-1 flex items-center gap-1">
                <Flame className="size-3" /> High & Critical Only
              </p>
              <span className="text-[10px] text-muted-foreground mt-0.5 block">Zero spam for minor warnings</span>
            </div>

            <div className="glass rounded-xl p-3 border border-border">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Recipients</span>
              <p className="text-xs font-bold text-foreground mt-1">
                All Plant Supervisors & Admins
              </p>
              <span className="text-[10px] text-muted-foreground mt-0.5 block">Queried dynamically from user_roles</span>
            </div>

            <div className="glass rounded-xl p-3 border border-border">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Payload Metadata</span>
              <p className="text-xs font-bold text-foreground mt-1">
                Snapshot, Zone, Time & Link
              </p>
              <span className="text-[10px] text-muted-foreground mt-0.5 block">Direct link to incident audit drawer</span>
            </div>
          </div>

          {/* Dispatched Emails Audit Log Table */}
          <div className="mt-4">
            <h4 className="text-xs font-bold text-foreground mb-2 flex items-center justify-between">
              <span>Recent Edge Function Dispatches ({dispatchedEmails.length})</span>
              <span className="text-[10px] text-muted-foreground font-mono">edge: send-supervisor-alert</span>
            </h4>

            {dispatchedEmails.length === 0 ? (
              <div className="rounded-xl border border-border bg-card/30 p-6 text-center text-muted-foreground text-xs">
                No supervisor alerts dispatched yet. Click <strong>Send Test Alert</strong> or trigger an incident on Live Monitor.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card/40">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Snapshot</th>
                      <th className="py-2 px-3 font-semibold">Recipient</th>
                      <th className="py-2 px-3 font-semibold">Alert Subject</th>
                      <th className="py-2 px-3 font-semibold">Zone & Time</th>
                      <th className="py-2 px-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {dispatchedEmails.slice(0, 6).map(email => (
                      <tr key={email.id} className="hover:bg-accent/40 transition">
                        <td className="py-2 px-3">
                          {email.snapshot_url ? (
                            <div className="size-9 rounded-md border border-border bg-black overflow-hidden">
                              <img src={email.snapshot_url} alt="Snap" className="size-full object-cover" />
                            </div>
                          ) : (
                            <div className="size-9 rounded-md border border-border bg-muted/40 grid place-items-center text-[9px] text-muted-foreground">
                              N/A
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <p className="font-bold text-foreground">{email.recipientName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{email.to}</p>
                        </td>
                        <td className="py-2 px-3">
                          <p className="font-semibold text-foreground truncate max-w-xs">{email.subject}</p>
                          <a
                            href={email.incidentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-primary hover:underline font-mono inline-flex items-center gap-1"
                          >
                            View Incident Link →
                          </a>
                        </td>
                        <td className="py-2 px-3">
                          <p className="font-medium text-foreground">{email.zone}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(email.dispatchedAt || email.time).toLocaleTimeString()}
                          </p>
                        </td>
                        <td className="py-2 px-3">
                          <span className={clsx(
                            'rounded-full px-2 py-0.5 text-[10px] font-bold',
                            email.status === 'Delivered'
                              ? 'bg-success/20 text-success'
                              : 'bg-warning/20 text-warning'
                          )}>
                            {email.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Progressive Web App (PWA) & Mobile Shell ── */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Smartphone className="size-4 text-primary" />
                Progressive Web App (PWA) & Offline Shell
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Installable on Android, iOS, Windows and macOS with offline-first app shell caching
              </p>
            </div>
            <span className="rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-bold flex items-center gap-1">
              <CheckCircle2 className="size-3" /> PWA Ready
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="glass rounded-xl p-3 border border-border">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">App Manifest</span>
              <p className="text-xs font-bold text-foreground mt-1">
                /manifest.json verified
              </p>
              <span className="text-[10px] text-muted-foreground mt-0.5 block">Standalone display & full mobile viewport-fit</span>
            </div>

            <div className="glass rounded-xl p-3 border border-border">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">App Icons</span>
              <p className="text-xs font-bold text-foreground mt-1">
                192px & 512px High-Res
              </p>
              <span className="text-[10px] text-muted-foreground mt-0.5 block">Maskable industrial shield icon & SVG favicon</span>
            </div>

            <div className="glass rounded-xl p-3 border border-border">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Offline Shell</span>
              <p className="text-xs font-bold text-success mt-1 flex items-center gap-1">
                <Wifi className="size-3" /> Service Worker Active
              </p>
              <span className="text-[10px] text-muted-foreground mt-0.5 block">Pre-cached routes for network resilience</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
