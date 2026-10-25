import React, { useState, useEffect } from 'react'
import {
  AlertTriangle, Flame, ShieldAlert, Volume2, VolumeX,
  CheckCircle2, XCircle, PhoneCall, Radio, Users, Check,
  ArrowRight, ShieldCheck, Siren, Sparkles, MapPin, Clock
} from 'lucide-react'
import { Button } from './ui/Button'
import { Badge } from './ui/Badge'
import { sirenEngine } from '../utils/siren'
import { clsx } from 'clsx'

const DEFAULT_EVACUATION_CHECKLIST = [
  { id: 'horns', label: 'Sound plant evacuation horns & high-intensity emergency strobe lights', required: true },
  { id: 'power', label: 'Trigger SCADA emergency fuel cutoff & isolate 33kV substation feeders', required: true },
  { id: 'evacuate', label: 'Direct all floor workers along secondary egress routes to Assembly Point B (North Yard)', required: true },
  { id: 'brigade', label: 'Deploy on-site industrial fire brigade & activate foam deluge suppression cannons', required: true },
  { id: 'authorities', label: 'Transmit automated dispatch alert to Municipal Fire & Rescue (911 / 112)', required: true },
  { id: 'muster', label: 'Verify complete workforce accountability roll call with shift supervisors', required: false },
]

export function EmergencySOSModal({
  isOpen,
  triggerReason = 'Manual SOS Button Pressed',
  zone = 'Zone A - Blast Furnace',
  camera = 'Primary Vision Node #01',
  snapshotUrl = null,
  onClearEmergency,
  currentUser,
}) {
  const [checklist, setChecklist] = useState(
    DEFAULT_EVACUATION_CHECKLIST.map(item => ({ ...item, completed: false }))
  )
  const [isMuted, setIsMuted] = useState(sirenEngine.isMuted)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // Start siren loop & voice annunciation when modal opens
  useEffect(() => {
    if (!isOpen) return

    setElapsedSeconds(0)
    const timer = setInterval(() => {
      setElapsedSeconds(s => s + 1)
    }, 1000)

    // Start siren
    sirenEngine.startEmergencySiren()

    // Speak evacuation announcement
    const spokenText = `Attention all personnel. Emergency evacuation in progress. Critical hazard reported in ${zone}. Evacuate immediately via designated egress routes to Assembly Point B.`
    sirenEngine.speakWarning(spokenText)

    // Repeat spoken warning every 16 seconds
    const speechInterval = setInterval(() => {
      sirenEngine.speakWarning(spokenText)
    }, 16000)

    return () => {
      clearInterval(timer)
      clearInterval(speechInterval)
      sirenEngine.stopEmergencySiren()
    }
  }, [isOpen, zone])

  if (!isOpen) return null

  const completedCount = checklist.filter(c => c.completed).length
  const totalCount = checklist.length
  const progressPct = Math.round((completedCount / totalCount) * 100)

  const toggleChecklistItem = (id) => {
    setChecklist(prev => prev.map(item => (
      item.id === id ? { ...item, completed: !item.completed } : item
    )))
  }

  const markAllComplete = () => {
    setChecklist(prev => prev.map(item => ({ ...item, completed: true })))
  }

  const handleToggleMute = () => {
    const next = sirenEngine.toggleMute()
    setIsMuted(next)
  }

  const formatElapsed = (sec) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-destructive/95 text-white backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      {/* Pulsating emergency gradient aura */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-destructive/60 via-black/85 to-black/95" />

      {/* Top Emergency Status Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-red-500/40 bg-black/60 px-6 py-4 backdrop-blur-lg">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-destructive text-white shadow-[0_0_24px_rgba(239,68,68,0.8)] animate-pulse">
            <Siren className="size-6 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-black tracking-wider text-red-100 uppercase">
                CRITICAL EMERGENCY · PLANT-WIDE EVACUATION
              </span>
              <span className="animate-ping rounded-full bg-red-400 p-1 size-2" />
            </div>
            <p className="text-xs text-red-200 font-medium">
              EHS Life-Safety Protocol Level 4 Initiated
            </p>
          </div>
        </div>

        {/* Timer, Mute & Stand Down Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-black/50 px-3.5 py-1.5 font-mono text-sm font-bold text-red-200">
            <Clock className="size-4 text-red-400" />
            <span>T+{formatElapsed(elapsedSeconds)}</span>
          </div>

          <button
            onClick={handleToggleMute}
            className={clsx(
              'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition',
              isMuted
                ? 'border-yellow-500/50 bg-yellow-500/20 text-yellow-300'
                : 'border-red-400/50 bg-red-500/20 text-white hover:bg-red-500/30'
            )}
          >
            {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4 animate-pulse" />}
            <span>{isMuted ? 'Siren Muted' : 'Mute Siren'}</span>
          </button>

          <Button
            variant="destructive"
            onClick={() => setConfirmClearOpen(true)}
            className="border border-white/20 bg-white text-black hover:bg-white/90 font-bold text-xs shadow-lg"
          >
            Stand Down / Clear Emergency
          </Button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="relative z-10 mx-auto w-full max-w-7xl flex-1 p-6 grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left Column: Incident Telemetry & Camera Snapshot (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="rounded-2xl border border-red-500/40 bg-black/60 p-5 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between pb-3 border-b border-red-500/30">
              <span className="text-[11px] font-bold uppercase tracking-wider text-red-300">
                Trigger Cause & Location
              </span>
              <Badge variant="outline" className="border-red-400 bg-red-950/80 text-red-200 text-xs font-bold animate-pulse">
                CRITICAL SEVERITY
              </Badge>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-500/20 text-red-400 border border-red-500/30">
                <Flame className="size-5" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-white">
                  {triggerReason}
                </h3>
                <p className="text-xs text-red-300 flex items-center gap-1.5 mt-0.5">
                  <MapPin className="size-3.5" /> {zone} · {camera}
                </p>
              </div>
            </div>

            {/* Live / Evidence Snapshot Preview */}
            <div className="mt-4 overflow-hidden rounded-xl border border-red-500/40 bg-black relative aspect-video shadow-inner">
              {snapshotUrl ? (
                <img
                  src={snapshotUrl}
                  alt="Emergency Snapshot"
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-2 text-red-400/80 bg-red-950/40">
                  <Flame className="size-12 animate-pulse text-red-500" />
                  <span className="text-xs font-bold tracking-wider uppercase text-red-300">
                    Active Thermal Hazard Zone
                  </span>
                </div>
              )}
              <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-red-600/90 px-2.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
                <span className="size-1.5 rounded-full bg-white animate-ping" />
                LIVE EVACUATION CAMERA FEED
              </div>
            </div>

            {/* Emergency Broadcast Telemetry */}
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-3">
                <span className="text-red-400 text-[10px] uppercase font-bold block">Spoken Warning</span>
                <span className="font-bold text-white mt-1 block">Active (English PA)</span>
              </div>
              <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-3">
                <span className="text-red-400 text-[10px] uppercase font-bold block">Supervisor Edge Dispatch</span>
                <span className="font-bold text-emerald-400 mt-1 block">Email Alert Sent</span>
              </div>
            </div>
          </div>

          {/* Quick Emergency Contacts */}
          <div className="rounded-2xl border border-red-500/40 bg-black/60 p-4 backdrop-blur-md">
            <h4 className="text-xs font-bold uppercase tracking-wider text-red-300 mb-3 flex items-center gap-2">
              <PhoneCall className="size-3.5 text-red-400" /> Plant Emergency Speed-Dial
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-red-500/30 bg-black/40 p-2.5 flex items-center justify-between">
                <div>
                  <div className="font-bold text-white">Fire Dispatch</div>
                  <div className="text-[10px] text-red-300">Ext 911 / 112</div>
                </div>
                <Radio className="size-4 text-red-400" />
              </div>
              <div className="rounded-xl border border-red-500/30 bg-black/40 p-2.5 flex items-center justify-between">
                <div>
                  <div className="font-bold text-white">EHS Control Room</div>
                  <div className="text-[10px] text-red-300">Ext 4040 (24/7)</div>
                </div>
                <Users className="size-4 text-red-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Evacuation Checklist & Action Protocols (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="rounded-2xl border border-red-500/40 bg-black/70 p-6 shadow-2xl backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-red-500/30">
              <div>
                <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="size-5 text-red-400" />
                  Evacuation Protocol Checklist
                </h3>
                <p className="text-xs text-red-200 mt-0.5">
                  Mandatory sequential safety actions for shift supervisors & safety coordinators
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display text-base font-bold text-red-300">
                  {completedCount} / {totalCount} Completed
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={markAllComplete}
                  className="border-red-400/50 bg-red-950/40 text-red-200 hover:bg-red-900/60 text-xs font-bold"
                >
                  Mark All Complete
                </Button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-red-950 border border-red-500/30">
              <div
                className={clsx(
                  'h-full transition-all duration-300',
                  progressPct === 100 ? 'bg-emerald-400' : 'bg-red-500'
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Checklist items list */}
            <div className="mt-5 flex flex-col gap-3">
              {checklist.map((item, idx) => {
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleChecklistItem(item.id)}
                    className={clsx(
                      'group flex items-start gap-3.5 cursor-pointer rounded-xl border p-4 transition-all',
                      item.completed
                        ? 'border-emerald-500/50 bg-emerald-950/20 text-emerald-100'
                        : 'border-red-500/30 bg-black/50 text-white hover:border-red-500/60 hover:bg-red-950/20'
                    )}
                  >
                    <div className={clsx(
                      'flex size-6 shrink-0 items-center justify-center rounded-lg border transition-all mt-0.5',
                      item.completed
                        ? 'border-emerald-400 bg-emerald-500 text-black font-bold'
                        : 'border-red-400/60 bg-black/60 group-hover:border-red-400'
                    )}>
                      {item.completed && <Check className="size-4 stroke-[3]" />}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-red-400">
                          Step 0{idx + 1}
                        </span>
                        {item.required && (
                          <span className="text-[10px] font-bold text-red-300 uppercase">
                            Required
                          </span>
                        )}
                      </div>
                      <p className={clsx('mt-1 text-sm font-medium leading-snug', item.completed && 'line-through opacity-75')}>
                        {item.label}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Assembly Point Direction Banner */}
            <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  <CheckCircle2 className="size-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Designated Muster Station: Assembly Point B
                  </h4>
                  <p className="text-xs text-emerald-200">
                    North Perimeter Yard (Safe windward zone, 300m away from furnace stack)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog to Clear / Stand Down Emergency */}
      {confirmClearOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-red-500/50 bg-black/90 p-6 shadow-2xl text-white">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="size-6 text-yellow-400" />
              <h3 className="font-display text-lg font-bold text-white">
                Stand Down Plant Emergency?
              </h3>
            </div>
            <p className="mt-3 text-xs text-red-200 leading-relaxed">
              Confirming stand down will silence the emergency sirens, cease the spoken evacuation broadcasts, and return the plant monitoring console to normal operating mode.
            </p>
            {completedCount < totalCount && (
              <div className="mt-3 rounded-xl border border-yellow-500/40 bg-yellow-950/30 p-3 text-xs text-yellow-300">
                Warning: Only <strong>{completedCount} of {totalCount}</strong> evacuation checklist items have been checked off.
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setConfirmClearOpen(false)}
                className="border-white/20 text-white hover:bg-white/10 text-xs"
              >
                Return to Emergency Console
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirmClearOpen(false)
                  onClearEmergency()
                }}
                className="bg-red-600 hover:bg-red-500 font-bold text-xs"
              >
                Confirm Stand Down
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
