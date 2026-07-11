import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Building2, ShieldAlert, CheckCircle2, Clock, AlertTriangle,
  Bell, BellOff, Volume2, VolumeX, RefreshCw, Info
} from 'lucide-react';
import type { PPEViolationEvent } from './CCTVPanel';

interface MainOfficePanelProps {
  /** Live violations fed from App.tsx polling */
  violations: PPEViolationEvent[];
  /** Callbacks to update violation status */
  onAcknowledge: (id: number) => Promise<void>;
  onResolve: (id: number) => Promise<void>;
  /** Force a refresh of the violation list */
  onRefresh: () => void;
}

// Formats an ISO timestamp into a human-friendly relative string
function relativeTime(isoStr: string): string {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function absoluteTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
}

// Web Audio API beep — short 200 ms tone, no external audio file needed
function playAlertBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
    setTimeout(() => ctx.close(), 400);
  } catch (_) {
    // AudioContext not available (e.g. server-side render or strict sandbox)
  }
}

function StatusChip({ status }: { status: string }) {
  if (status === 'open') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/50 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 text-[9px] font-black font-mono uppercase animate-pulse">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        OPEN
      </span>
    );
  }
  if (status === 'acknowledged') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-[9px] font-black font-mono uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        ACKNOWLEDGED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-[9px] font-black font-mono uppercase">
      <CheckCircle2 className="h-3 w-3" />
      RESOLVED
    </span>
  );
}

function ViolationCard({
  event,
  onAcknowledge,
  onResolve,
}: {
  event: PPEViolationEvent;
  onAcknowledge: (id: number) => Promise<void>;
  onResolve: (id: number) => Promise<void>;
}) {
  const [acting, setActing] = useState(false);

  const doAction = async (action: () => Promise<void>) => {
    setActing(true);
    try { await action(); } finally { setActing(false); }
  };

  return (
    <div
      id={`ppe-violation-${event.id}`}
      className={`rounded-2xl border p-4 flex flex-col gap-3 shadow-sm transition-all ${
        event.status === 'open'
          ? 'bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-800/60'
          : event.status === 'acknowledged'
          ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/60'
          : 'bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900/40 opacity-75'
      }`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldAlert className={`h-4 w-4 shrink-0 ${
            event.status === 'open' ? 'text-red-500' :
            event.status === 'acknowledged' ? 'text-amber-500' : 'text-emerald-500'
          }`} />
          <div>
            <span className="text-xs font-black text-theme-text">{event.zone_name}</span>
            <span className="ml-1.5 text-[9px] font-mono bg-theme-card border border-theme-border px-1.5 py-0.5 rounded-full text-theme-text-muted">
              {event.plant_id.replace('plant_', '').replace('_', ' ').toUpperCase()}
            </span>
          </div>
        </div>
        <StatusChip status={event.status} />
      </div>

      {/* Violation details */}
      <div className="flex flex-wrap gap-2 items-center">
        {event.ppe_items_missing.map((item: string) => (
          <span
            key={item}
            className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 text-[9px] font-black font-mono uppercase tracking-wide"
          >
            ⛑ {item.replace('_', ' ')} MISSING
          </span>
        ))}

        {/* Detection method badge */}
        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold font-mono border ${
          event.detection_method === 'manual_override'
            ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400'
            : 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400'
        }`}>
          {event.detection_method === 'manual_override' ? '🔧 MANUAL OVERRIDE' : `🤖 MODEL ${event.confidence_pct.toFixed(0)}%`}
        </span>
      </div>

      {/* Time and risk score row */}
      <div className="flex items-center justify-between gap-3 text-[9px] font-mono text-theme-text-muted flex-wrap">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>{relativeTime(event.timestamp)}</span>
          <span className="text-theme-border">·</span>
          <span>{absoluteTime(event.timestamp)}</span>
        </div>
        {event.risk_score_at_time != null && (
          <div className={`font-bold ${
            event.risk_score_at_time >= 70 ? 'text-red-600 dark:text-red-400' :
            event.risk_score_at_time >= 40 ? 'text-amber-600 dark:text-amber-400' :
            'text-theme-text-secondary'
          }`}>
            Zone Risk: {event.risk_score_at_time.toFixed(0)}/100
          </div>
        )}
      </div>

      {/* Action buttons — only shown for non-resolved events */}
      {event.status !== 'resolved' && (
        <div className="flex gap-2 pt-1 border-t border-theme-border/50">
          {event.status === 'open' && (
            <button
              id={`ppe-acknowledge-${event.id}`}
              onClick={() => doAction(() => onAcknowledge(event.id))}
              disabled={acting}
              className="flex-1 py-1.5 text-[9px] font-black uppercase tracking-wide rounded-xl bg-amber-100 dark:bg-amber-950/40 hover:bg-amber-200 dark:hover:bg-amber-900/50 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {acting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Acknowledge
            </button>
          )}
          <button
            id={`ppe-resolve-${event.id}`}
            onClick={() => doAction(() => onResolve(event.id))}
            disabled={acting}
            className="flex-1 py-1.5 text-[9px] font-black uppercase tracking-wide rounded-xl bg-emerald-100 dark:bg-emerald-950/40 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
          >
            {acting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Mark Resolved
          </button>
        </div>
      )}
    </div>
  );
}

export function MainOfficePanel({
  violations,
  onAcknowledge,
  onResolve,
  onRefresh,
}: MainOfficePanelProps) {
  // Alert banner dismiss state
  const [bannerVisible, setBannerVisible] = useState(false);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sound opt-in
  const [soundEnabled, setSoundEnabled] = useState(false);

  // Filter state
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'acknowledged' | 'resolved'>('all');

  // Track last known open count to detect new violations for the banner
  const prevOpenCountRef = useRef(0);

  const openViolations = violations.filter(v => v.status === 'open');
  const acknowledgedViolations = violations.filter(v => v.status === 'acknowledged');
  const resolvedViolations = violations.filter(v => v.status === 'resolved');
  const openCount = openViolations.length;

  // Show banner and play sound when new violations arrive
  useEffect(() => {
    if (openCount > prevOpenCountRef.current) {
      setBannerVisible(true);
      if (soundEnabled) playAlertBeep();

      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = setTimeout(() => setBannerVisible(false), 8000);
    }
    prevOpenCountRef.current = openCount;
  }, [openCount, soundEnabled]);

  const dismissBanner = useCallback(() => {
    setBannerVisible(false);
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
  }, []);

  const filteredViolations = filterStatus === 'all'
    ? violations
    : violations.filter(v => v.status === filterStatus);

  return (
    <div id="main-office-panel" className="flex flex-col gap-5 animate-fadeIn">
      {/* ── New Violation Alert Banner ─────────────────────────────────── */}
      {bannerVisible && openCount > 0 && (
        <div className="bg-red-600 border border-red-500 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-xl animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-700/80 border border-red-500">
              <AlertTriangle className="h-5 w-5 text-white animate-bounce" />
            </div>
            <div>
              <p className="text-[10px] font-mono font-bold text-red-100 uppercase tracking-wider">
                New PPE Violation Detected
              </p>
              <p className="text-white font-extrabold text-sm">
                {openCount} open violation{openCount !== 1 ? 's' : ''} require attention
              </p>
            </div>
          </div>
          <button
            onClick={dismissBanner}
            className="text-red-200 hover:text-white text-[9px] font-bold uppercase tracking-wider transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="card-soft-base p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 border-b border-theme-border pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-theme-accent-bg border border-theme-accent-light">
              <Building2 className="h-5 w-5 text-theme-accent" />
            </div>
            <div>
              <h2 className="text-xs font-black text-theme-text uppercase tracking-widest flex items-center gap-2">
                Main Office — PPE Alert Dashboard
                {openCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/50 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-[9px] font-black animate-pulse">
                    {openCount} OPEN
                  </span>
                )}
              </h2>
              <p className="text-[10px] text-theme-text-muted font-semibold mt-0.5">
                Simulated office escalation feed — violations from all monitored zones
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Sound toggle */}
            <button
              id="ppe-sound-toggle"
              onClick={() => setSoundEnabled(s => !s)}
              title={soundEnabled ? 'Disable alert sounds' : 'Enable alert sounds'}
              className={`p-2 rounded-xl border text-[9px] font-bold transition-all flex items-center gap-1 ${
                soundEnabled
                  ? 'bg-theme-accent-bg border-theme-accent-light text-theme-accent'
                  : 'bg-theme-card border-theme-border text-theme-text-muted hover:text-theme-text'
              }`}
            >
              {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{soundEnabled ? 'Sounds ON' : 'Sounds OFF'}</span>
            </button>

            {/* Refresh */}
            <button
              id="ppe-refresh"
              onClick={onRefresh}
              className="p-2 rounded-xl border bg-theme-card border-theme-border text-theme-text-muted hover:text-theme-text transition-all"
              title="Refresh violation list"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/60 rounded-xl p-3 text-center">
            <div className="text-2xl font-black text-red-600 dark:text-red-400">{openCount}</div>
            <div className="text-[9px] font-bold uppercase tracking-wide text-red-500 dark:text-red-500">Open</div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-xl p-3 text-center">
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400">{acknowledgedViolations.length}</div>
            <div className="text-[9px] font-bold uppercase tracking-wide text-amber-500 dark:text-amber-500">Acknowledged</div>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 rounded-xl p-3 text-center">
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{resolvedViolations.length}</div>
            <div className="text-[9px] font-bold uppercase tracking-wide text-emerald-500 dark:text-emerald-500">Resolved</div>
          </div>
        </div>

        {/* Detection scope disclaimer */}
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 mb-4">
          <Info className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[9px] text-amber-700 dark:text-amber-400 font-semibold leading-relaxed">
            <span className="font-black">Detection scope:</span> Hard hat only (manual simulation).
            Coco-SSD (80 generic classes) cannot detect PPE — safety vest &amp; face mask require custom YOLO training.
            Events tagged as <span className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">MANUAL OVERRIDE</span> are simulation-only.
            See README for production deployment notes including privacy considerations.
          </p>
        </div>

        {/* Filter bar */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'open', 'acknowledged', 'resolved'] as const).map(status => (
            <button
              key={status}
              id={`ppe-filter-${status}`}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1 text-[9px] font-black uppercase tracking-wider rounded-full border transition-all ${
                filterStatus === status
                  ? 'bg-theme-accent text-white border-theme-accent shadow-sm'
                  : 'bg-theme-card border-theme-border text-theme-text-muted hover:text-theme-text'
              }`}
            >
              {status === 'all' ? `All (${violations.length})` :
               status === 'open' ? `Open (${openCount})` :
               status === 'acknowledged' ? `Ack'd (${acknowledgedViolations.length})` :
               `Resolved (${resolvedViolations.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Violation Feed ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {filteredViolations.length === 0 ? (
          <div className="card-soft-base p-10 flex flex-col items-center gap-3 text-center">
            {filterStatus === 'open' || filterStatus === 'all' ? (
              <>
                <Bell className="h-10 w-10 text-emerald-400 dark:text-emerald-500" />
                <p className="text-sm font-bold text-theme-text">All clear — no active PPE violations</p>
                <p className="text-[10px] text-theme-text-muted max-w-xs leading-relaxed font-medium">
                  Enable the CCTV feed on the Safety &amp; Telemetry tab, then toggle "Simulate Hard Hat Violation"
                  to generate a test event and see it appear here.
                </p>
              </>
            ) : (
              <>
                <BellOff className="h-8 w-8 text-theme-text-muted" />
                <p className="text-xs font-semibold text-theme-text-muted">No {filterStatus} violations to display.</p>
              </>
            )}
          </div>
        ) : (
          filteredViolations.map(event => (
            <ViolationCard
              key={event.id}
              event={event}
              onAcknowledge={onAcknowledge}
              onResolve={onResolve}
            />
          ))
        )}
      </div>

      {/* R7 Risk Engine coupling note */}
      {violations.length > 0 && (
        <div className="flex items-start gap-2 bg-theme-card border border-theme-border rounded-xl p-3">
          <Info className="h-3.5 w-3.5 text-theme-accent shrink-0 mt-0.5" />
          <p className="text-[9px] text-theme-text-secondary font-semibold leading-relaxed">
            <span className="font-black text-theme-text">Risk Engine Integration:</span> Each PPE violation also
            triggers Rule R7 in the compound risk engine. When the violating zone also has elevated CO or H2S,
            R7 adds a score contribution that elevates the zone to HIGH or CRITICAL risk — visible in the 2D and 3D
            heatmap views on the Safety &amp; Telemetry tab.
          </p>
        </div>
      )}
    </div>
  );
}
