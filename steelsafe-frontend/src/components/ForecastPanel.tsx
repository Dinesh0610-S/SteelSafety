/**
 * ForecastPanel.tsx
 * ==================
 * Phase 9: Predictive Incident Forecasting panel.
 *
 * Displays Time-To-Danger (TTD) countdown badges and trend sparklines
 * for CO and H2S in the selected zone. Data is fetched from the
 * /api/v1/forecast/{zone_id} endpoint which runs linear regression
 * on the last 30 sensor readings.
 */

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Clock, AlertTriangle, ShieldCheck, Zap } from 'lucide-react';

interface ForecastData {
  zone_id: string;
  zone_name: string;
  plant_id: string;
  evaluation_time: string;
  lookback_readings_used: number;
  sample_interval_minutes: number;
  co_ppm_current: number;
  h2s_ppm_current: number;
  co_slope: number;
  co_r2: number;
  trend_co: 'rising' | 'stable' | 'falling';
  co_ttd_action: number | null;  // minutes to CO action level (35 ppm)
  co_ttd_high: number | null;    // minutes to CO high alarm (100 ppm)
  h2s_slope: number;
  h2s_r2: number;
  trend_h2s: 'rising' | 'stable' | 'falling';
  h2s_ttd_action: number | null; // minutes to H2S action level (5 ppm)
  h2s_ttd_high: number | null;   // minutes to H2S high alarm (10 ppm)
  overall_ttd_minutes: number | null;
  alert_level: 'imminent' | 'warning' | 'safe';
  confidence: 'high' | 'medium' | 'low';
}

interface ForecastPanelProps {
  zoneId: string;
}

function TrendIcon({ trend }: { trend: 'rising' | 'stable' | 'falling' }) {
  if (trend === 'rising')  return <TrendingUp  className="h-3.5 w-3.5 text-red-500" />;
  if (trend === 'falling') return <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />;
  return <Minus className="h-3.5 w-3.5 text-theme-text-muted" />;
}

function TTDBar({ minutesRemaining, thresholdMinutes }: { minutesRemaining: number; thresholdMinutes: number }) {
  const pct = Math.max(0, Math.min(100, (minutesRemaining / thresholdMinutes) * 100));
  const color = minutesRemaining <= 10 ? 'bg-red-500' : minutesRemaining <= 30 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="h-1 bg-theme-border rounded-full overflow-hidden w-full mt-1">
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${100 - pct}%` }}
      />
    </div>
  );
}

function GasCard({
  label,
  currentPpm,
  unit,
  trend,
  r2,
  ttdAction,
  ttdHigh,
  actionLabel,
  highLabel,
}: {
  label: string;
  currentPpm: number;
  unit: string;
  trend: 'rising' | 'stable' | 'falling';
  r2: number;
  ttdAction: number | null;
  ttdHigh: number | null;
  actionLabel: string;
  highLabel: string;
}) {
  const hasTTD = ttdAction !== null || ttdHigh !== null;
  const urgentTTD = ttdAction !== null && ttdAction <= 10;
  const warnTTD   = ttdAction !== null && ttdAction <= 30;

  return (
    <div className={`rounded-2xl border p-3.5 transition-all ${
      urgentTTD
        ? 'bg-red-950/30 border-red-700/50'
        : warnTTD
        ? 'bg-amber-950/20 border-amber-700/40'
        : 'bg-theme-card border-theme-border'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-mono font-extrabold text-theme-text-muted uppercase tracking-widest">
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          <TrendIcon trend={trend} />
          <span className={`text-[8px] font-mono font-bold uppercase ${
            trend === 'rising' ? 'text-red-400' : trend === 'falling' ? 'text-emerald-400' : 'text-theme-text-muted'
          }`}>
            {trend}
          </span>
        </div>
      </div>

      {/* Current value */}
      <div className="flex items-baseline gap-1 mb-2.5">
        <span className={`text-xl font-black font-mono tabular-nums ${
          urgentTTD ? 'text-red-400' : warnTTD ? 'text-amber-400' : 'text-theme-text'
        }`}>
          {currentPpm.toFixed(currentPpm < 10 ? 2 : 1)}
        </span>
        <span className="text-[9px] text-theme-text-muted font-mono">{unit}</span>
      </div>

      {/* TTD Forecasts */}
      {hasTTD ? (
        <div className="space-y-1.5">
          {ttdAction !== null && (
            <div>
              <div className="flex justify-between items-center text-[9px] font-mono">
                <span className="text-theme-text-secondary">{actionLabel}</span>
                <span className={`font-black ${ttdAction <= 10 ? 'text-red-400 animate-pulse' : ttdAction <= 30 ? 'text-amber-400' : 'text-theme-text'}`}>
                  {ttdAction <= 0 ? 'BREACHED' : `${ttdAction.toFixed(0)} min`}
                </span>
              </div>
              <TTDBar minutesRemaining={ttdAction} thresholdMinutes={60} />
            </div>
          )}
          {ttdHigh !== null && (
            <div>
              <div className="flex justify-between items-center text-[9px] font-mono">
                <span className="text-theme-text-secondary">{highLabel}</span>
                <span className="font-bold text-theme-text-muted">
                  {ttdHigh.toFixed(0)} min
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-[9px] text-theme-text-muted font-mono">
          <ShieldCheck className="h-3 w-3 text-emerald-500" />
          No imminent threshold breach detected
        </div>
      )}

      {/* Confidence */}
      <div className="mt-2 text-[8px] font-mono text-theme-text-muted opacity-70">
        Regression confidence: {(r2 * 100).toFixed(0)}% (R²={r2.toFixed(2)})
      </div>
    </div>
  );
}

export function ForecastPanel({ zoneId }: ForecastPanelProps) {
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!zoneId) return;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/forecast/${zoneId}`)
      .then((r) => {
        if (!r.ok) throw new Error('Forecast endpoint not available');
        return r.json();
      })
      .then((data: ForecastData) => {
        setForecast(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetch(`/api/v1/forecast/${zoneId}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data) setForecast(data); })
        .catch(() => {});
    }, 30_000);

    return () => clearInterval(interval);
  }, [zoneId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-theme-border bg-theme-card p-4 animate-pulse">
        <div className="h-3 w-28 bg-theme-border rounded mb-3" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 bg-theme-border rounded-xl" />
          <div className="h-24 bg-theme-border rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !forecast) {
    return null; // Silent fail — don't clutter the UI if endpoint isn't ready
  }

  const alertStyles = {
    imminent: 'text-red-400 bg-red-950/30 border-red-700/50',
    warning:  'text-amber-400 bg-amber-950/20 border-amber-700/40',
    safe:     'text-emerald-400 bg-emerald-950/20 border-emerald-700/30',
  };

  return (
    <div className="rounded-3xl border border-theme-border bg-theme-card/50 backdrop-blur-sm p-4 space-y-3 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-theme-accent-bg border border-theme-accent-light">
            <Clock className="h-3 w-3 text-theme-accent" />
          </div>
          <span className="text-[9px] font-mono font-extrabold tracking-widest text-theme-text-muted uppercase">
            Predictive Forecast — TTD
          </span>
        </div>

        {/* Alert level badge */}
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[8px] font-black font-mono uppercase ${alertStyles[forecast.alert_level]}`}>
          {forecast.alert_level === 'imminent' && <AlertTriangle className="h-2.5 w-2.5 animate-pulse" />}
          {forecast.alert_level === 'warning'  && <Zap className="h-2.5 w-2.5" />}
          {forecast.alert_level === 'safe'     && <ShieldCheck className="h-2.5 w-2.5" />}
          {forecast.alert_level}
        </span>
      </div>

      {/* Overall TTD */}
      {forecast.overall_ttd_minutes !== null && (
        <div className={`rounded-2xl border px-3 py-2 flex items-center justify-between ${alertStyles[forecast.alert_level]}`}>
          <span className="text-[9px] font-mono font-bold uppercase opacity-80">
            Nearest threshold breach
          </span>
          <span className="text-base font-black font-mono tabular-nums">
            {forecast.overall_ttd_minutes <= 0
              ? 'BREACHED'
              : `~${forecast.overall_ttd_minutes.toFixed(0)} min`
            }
          </span>
        </div>
      )}

      {/* Gas TTD cards */}
      <div className="grid grid-cols-2 gap-2">
        <GasCard
          label="CO"
          currentPpm={forecast.co_ppm_current}
          unit="ppm"
          trend={forecast.trend_co}
          r2={forecast.co_r2}
          ttdAction={forecast.co_ttd_action}
          ttdHigh={forecast.co_ttd_high}
          actionLabel="→ Action (35 ppm)"
          highLabel="→ High (100 ppm)"
        />
        <GasCard
          label="H₂S"
          currentPpm={forecast.h2s_ppm_current}
          unit="ppm"
          trend={forecast.trend_h2s}
          r2={forecast.h2s_r2}
          ttdAction={forecast.h2s_ttd_action}
          ttdHigh={forecast.h2s_ttd_high}
          actionLabel="→ Action (5 ppm)"
          highLabel="→ High (10 ppm)"
        />
      </div>

      {/* Methodology note */}
      <div className="text-[8px] font-mono text-theme-text-muted opacity-60 leading-relaxed">
        Based on linear regression over last {forecast.lookback_readings_used} readings
        (~{forecast.sample_interval_minutes.toFixed(1)} min/sample). TTD is not available
        when slope is non-positive or R² &lt; 0.30.
      </div>
    </div>
  );
}
